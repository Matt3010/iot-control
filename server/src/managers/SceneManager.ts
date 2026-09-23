import type { Capability, DeviceValue } from '../../../shared/protocol.js';
import type { SceneDto, SceneStepDto } from '../dto/scene.dto.js';
import { badGateway, badRequest, notFound } from '../errors/HttpError.js';
import { hub } from '../iot/hub.js';
import { noticeManager } from './NoticeManager.js';
import type { Transaction } from '../persistence/JsonStore.js';
import { store } from '../persistence/JsonStore.js';
import { DeviceRepository } from '../repositories/DeviceRepository.js';
import { SceneRepository } from '../repositories/SceneRepository.js';
import { logManager } from './LogManager.js';
import type { Device, Scene, SceneStep } from '../types.js';

/**
 * Un valore va bene per quella capacità? Non è pignoleria: una scena si
 * scrive una volta e si preme per mesi, e un valore storto dentro si scopre
 * la sera che serviva.
 */
function check(capability: Capability, value: DeviceValue): void {
  if (capability.kind === 'sensor') throw badRequest('un sensore si legge, non si comanda');
  if (capability.kind === 'image') throw badRequest('una telecamera si guarda, non si comanda');

  if (capability.kind === 'switch') {
    if (typeof value !== 'boolean') throw badRequest(`«${capability.label}» si accende o si spegne`);
    return;
  }

  if (capability.kind === 'enum') {
    if (typeof value !== 'string' || !capability.values.includes(value)) {
      throw badRequest(`«${capability.label}» non sa fare «${String(value)}»`);
    }
    return;
  }

  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw badRequest(`«${capability.label}» vuole un numero`);
  }
  if (value < capability.min || value > capability.max) {
    throw badRequest(`«${capability.label}» sta fra ${capability.min} e ${capability.max}`);
  }
}

export class SceneManager {
  list(ownerId: string): Promise<Scene[]> {
    return store.transaction((tx) => new SceneRepository(tx).findAllOf(ownerId));
  }

  create(ownerId: string, dto: SceneDto): Promise<Scene> {
    return store.transaction((tx) => {
      const steps = this.#clean(tx, ownerId, dto.steps ?? []);
      return new SceneRepository(tx).insert(ownerId, dto.name, steps);
    });
  }

  update(ownerId: string, id: string, dto: SceneDto): Promise<Scene> {
    return store.transaction((tx) => {
      const scenes = new SceneRepository(tx);
      if (!scenes.owns(ownerId, id)) throw notFound('scena inesistente');

      const patch: Partial<Scene> = { name: dto.name };
      if (dto.steps) patch.steps = this.#clean(tx, ownerId, dto.steps);

      /*
       * `null` vuol dire «non parte piu' da sola», che e' diverso da «non ne
       * stiamo parlando»: il primo cancella l'orario, il secondo lo lascia
       * dov'e'. Senza questa distinzione una scena non si potrebbe piu'
       * spegnere senza rifarla.
       */
      if (dto.when !== undefined) {
        patch.when = dto.when
          ? {
              at: dto.when.at,
              days: dto.when.days ?? [],
              tz: dto.when.tz || 'Europe/Rome',
              ...(dto.when.on ? { on: dto.when.on } : {}),
              ...(dto.when.off ? { off: true } : {}),
            }
          : undefined;
      }
      return scenes.update(id, patch) as Scene;
    });
  }

  remove(ownerId: string, id: string): Promise<void> {
    return store.transaction((tx) => {
      const scenes = new SceneRepository(tx);
      if (!scenes.owns(ownerId, id)) throw notFound('scena inesistente');
      scenes.delete(id);
    });
  }

  /**
   * La scena, tutta insieme.
   *
   * Le righe partono in parallelo, non una dopo l'altra: due tende che si
   * chiudono a mezzo secondo di distanza si vedono, ed è proprio quello che
   * si voleva evitare mettendole nella stessa scena.
   *
   * Poi si conta chi non ha risposto, e lo si dice con i nomi: «Tenda 1 non
   * ha risposto» è una frase su cui si può fare qualcosa, «errore» no. Se non
   * ha risposto nessuno è un guasto; se è partita a metà, la scena non si
   * riavvolge — quello che si è mosso resta mosso, e si dice cosa manca.
   */
  async run(ownerId: string, id: string, who?: string): Promise<void> {
    const { scene, steps } = await store.transaction((tx) => {
      const found = new SceneRepository(tx).findById(id);
      if (!found || found.ownerId !== ownerId) throw notFound('scena inesistente');

      /*
       * Le righe che mandano un avviso non hanno un dispositivo, e non per
       * questo sono da buttare: restano in fila con le altre, perche' l'ordine
       * fra un comando e un avviso e' quello che si e' scritto.
       */
      const devices = new DeviceRepository(tx).findAllOf(ownerId);
      const ready = found.steps
        .map((step) => ({ step, device: devices.find((one) => one.id === step.deviceId) }))
        .filter((pair) => !!pair.device || !!pair.step.notify);
      return { scene: found, steps: ready as { step: SceneStep; device?: Device }[] };
    });

    if (!steps.length) throw badRequest(`La scena «${scene.name}» è vuota, non c'è niente da fare`);

    /*
     * A momenti, non tutto in una volta.
     *
     * Le righe senza attesa partono insieme, come hanno sempre fatto: una
     * scena che accende sei cose non deve aspettare che la prima risponda per
     * mandare la seconda, se no un dispositivo muto terrebbe ferme tutte le
     * altre per il tempo del suo silenzio. Dove c'è un'attesa invece si
     * aspetta davvero, ed e' li' che la scena diventa una sequenza.
     */
    const momenti: { wait: number; quali: typeof steps }[] = [];
    for (const pair of steps) {
      const wait = pair.step.after ?? 0;
      if (wait > 0 || !momenti.length) momenti.push({ wait, quali: [] });
      momenti[momenti.length - 1]?.quali.push(pair);
    }

    /*
     * Chi ha premuto non aspetta la fine.
     *
     * Una scena con dentro «aspetta dieci minuti» dura dieci minuti, e tenere
     * aperta una richiesta per tutto quel tempo vorrebbe dire un tasto che
     * resta grigio mentre in casa non succede piu' niente. Si aspetta il
     * primo momento — quello e' istantaneo, ed e' li' che si scopre se non
     * risponde nessuno — e il resto va avanti per conto suo, lasciando nel
     * registro com'e' finita.
     */
    const mute: typeof steps = [];

    const suona = async (momento: (typeof momenti)[number], at: number): Promise<void> => {
      // Prima di aspettare si dice che si sta aspettando: una scena che dura
      // dieci minuti, se non dice niente, sembra non essere partita.
      hub.changed(ownerId, { kind: 'running', sceneId: scene.id, at, of: momenti.length });
      if (momento.wait > 0) await new Promise((done) => setTimeout(done, momento.wait * 1000));

      const esiti = await Promise.allSettled(
        momento.quali.map(({ step, device }) =>
          step.notify
            ? noticeManager.tell(ownerId, {
                kind: 'scene',
                who: scene.name,
                short: step.notify,
                title: scene.name,
                body: step.notify,
              })
            : hub.command(
                (device as Device).agentId,
                (device as Device).externalId,
                step.code as string,
                step.value as DeviceValue,
              ),
        ),
      );
      momento.quali.forEach((pair, at) => {
        if (esiti[at]?.status === 'rejected') mute.push(pair);
      });
    };

    const nota = (): void => {
      /*
       * Una riga per agente, non una per passo: «Sera» è una cosa sola anche
       * se ne muove sei, e sei righe uguali nel registro sono rumore. Ma se la
       * scena tocca due case, ognuna deve poter leggere che è passata di lì.
       */
      const case_ = new Set(steps.map(({ device }) => device?.agentId).filter((id): id is string => !!id));
      for (const agentId of case_) {
        const suoi = steps.filter(({ device }) => device?.agentId === agentId);
        const zitti = mute.filter(({ device }) => device?.agentId === agentId).length;
        logManager.note({
          ownerId,
          agentId,
          kind: 'scene',
          subject: scene.name,
          // il singolare vale anche dentro a «su»: «1 dispositivi su 2» e'
          // il genere di dettaglio che fa sembrare tutto il resto scritto
          // male
          detail: zitti
            ? `${suoi.length - zitti} ${suoi.length - zitti === 1 ? 'dispositivo' : 'dispositivi'} su ${suoi.length}`
            : `${suoi.length} ${suoi.length === 1 ? 'dispositivo' : 'dispositivi'}`,
          ok: zitti === 0,
          ...(who ? { who } : {}),
        });
      }
    };

    const finita = (): void => {
      hub.changed(ownerId, {
        kind: 'running',
        sceneId: scene.id,
        at: momenti.length,
        of: momenti.length,
        done: true,
      });
    };

    const [primo, ...resto] = momenti;
    if (primo) await suona(primo, 1);

    if (resto.length) {
      void (async () => {
        for (const [at, momento] of resto.entries()) await suona(momento, at + 2);
        nota();
        finita();
      })().catch((error: Error) => {
        console.warn(`«${scene.name}» si è fermata: ${error.message}`);
        finita();
      });

      // Quello che si sa adesso è solo del primo momento, e dirlo a metà
      // sarebbe peggio che non dirlo: il resto finisce nel registro.
      return;
    }

    nota();
    finita();

    if (!mute.length) return;

    const names = [...new Set(mute.map(({ device }) => `«${device?.name ?? 'una riga'}»`))].join(', ');
    throw badGateway(
      mute.length === steps.length
        ? `Nessun dispositivo di «${scene.name}» ha risposto`
        : `${names}: nessuna risposta. Il resto della scena è partito.`,
    );
  }

  /**
   * Ogni riga dev'essere possibile: il dispositivo è suo, quella cosa la sa
   * fare, e il valore ha senso. Un dispositivo può comparire più volte — una
   * lampadina che si accende e si porta al 30% sono due righe, ed è giusto —
   * e adesso può comparire anche due volte per la stessa cosa, purché in due
   * momenti diversi: «apri, aspetta un minuto, richiudi» è una scena sensata,
   * «apri e chiudi nello stesso istante» no.
   */
  #clean(tx: Transaction, ownerId: string, steps: SceneStepDto[]): SceneStep[] {
    const devices = new DeviceRepository(tx);

    /*
     * Un momento finisce dove comincia un'attesa. Dentro a un momento le righe
     * partono insieme, quindi due volte la stessa cosa li' dentro vorrebbe
     * dire dare due ordini contrari allo stesso dispositivo nello stesso
     * istante: quello che succede dopo non lo decide piu' nessuno.
     */
    let momento = 0;
    const gia = new Map<string, number>();

    return steps.map((step) => {
      const after = Math.max(0, Math.round(step.after ?? 0));

      /*
       * Una riga che manda un avviso non tocca niente in casa: non c'e' un
       * dispositivo da controllare, e due avvisi nello stesso momento sono
       * legittimi — sono due frasi, non due ordini contrari.
       */
      if (step.notify) {
        if (after > 0) momento += 1;
        return { notify: step.notify, ...(after ? { after } : {}) };
      }

      const device = step.deviceId ? devices.findById(step.deviceId) : undefined;
      if (!device || device.ownerId !== ownerId) throw badRequest('dispositivo inesistente');

      const capability = device.capabilities.find((entry) => entry.code === step.code);
      if (!capability) throw badRequest(`«${device.name}» non sa fare questa cosa`);

      const kind = typeof step.value;
      if (kind !== 'string' && kind !== 'number' && kind !== 'boolean') throw badRequest('valore non valido');
      check(capability, step.value as DeviceValue);

      if (after > 0) momento += 1;

      const chiave = `${step.deviceId}:${step.code}`;
      if (gia.get(chiave) === momento) {
        throw badRequest(
          `«${device.name}» compare due volte nello stesso momento: mettici un'attesa in mezzo, o togline una`,
        );
      }
      gia.set(chiave, momento);

      return {
        deviceId: step.deviceId,
        code: step.code,
        value: step.value as DeviceValue,
        ...(after ? { after } : {}),
      };
    });
  }
}

export const sceneManager = new SceneManager();
