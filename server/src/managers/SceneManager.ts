import type { Capability, DeviceValue } from '../../../shared/protocol.js';
import type { SceneConditionDto, SceneDto, SceneStepDto, SceneTriggerDto } from '../dto/scene.dto.js';
import { badGateway, badRequest, notFound } from '../errors/HttpError.js';
import { hub } from '../iot/hub.js';
import { noticeManager } from './NoticeManager.js';
import type { Transaction } from '../persistence/db.js';
import { store } from '../persistence/db.js';
import { check, paroleDi, provabile, siMisura } from './check.js';
import { giroNuovo } from '../rules/giri.js';
import { DeviceRepository } from '../repositories/DeviceRepository.js';
import { SceneRepository } from '../repositories/SceneRepository.js';
import { logManager } from './LogManager.js';
import { randomUUID } from 'node:crypto';
import type { Device, DeviceTest, Op, Scene, SceneCondition, SceneConditionGroup, SceneStep, SceneTrigger } from '../types.js';
import { toSceneView } from '../dto/views.js';
import { ordiniDiversi, partonoInsieme } from '../rules/scontri.js';

/**
 * Se partendo da una scena si arriva a un'altra, anche passando per altre.
 *
 * Serve a non chiudere un anello: «A chiama B» si puo', «A chiama B e B
 * chiama A» girerebbe per sempre, e accorgersene mentre le tende vanno su e
 * giu' e' tardi. Si guarda in avanti prima di scrivere, non dopo.
 */
async function leadsTo(tx: Transaction, from: string, target: string): Promise<boolean> {
  const scenes = new SceneRepository(tx);
  const visti = new Set<string>();
  const da = [from];

  while (da.length) {
    const qui = da.pop() as string;
    if (qui === target) return true;
    if (visti.has(qui)) continue;
    visti.add(qui);

    for (const step of (await scenes.findById(qui))?.steps ?? []) {
      if (step.scene) da.push(step.scene);
    }
  }
  return false;
}

export class SceneManager {
  list(ownerId: string): Promise<Scene[]> {
    return store.transaction((tx) => new SceneRepository(tx).findAllOf(ownerId));
  }

  create(ownerId: string, dto: SceneDto): Promise<Scene> {
    return store.transaction(async (tx) => {
      const steps = await this.#clean(tx, ownerId, dto.steps ?? []);
      return new SceneRepository(tx).insert(ownerId, dto.name, steps);
    });
  }

  update(ownerId: string, id: string, dto: SceneDto): Promise<Scene> {
    return store.transaction(async (tx) => {
      const scenes = new SceneRepository(tx);
      if (!(await scenes.owns(ownerId, id))) throw notFound('scena inesistente');

      const patch: Partial<Scene> = { name: dto.name };
      if (dto.steps) patch.steps = await this.#clean(tx, ownerId, dto.steps, id);
      if (dto.triggers) patch.triggers = await this.#cleanTriggers(tx, ownerId, dto.triggers);
      if (dto.only) patch.only = await this.#cleanConditions(tx, ownerId, dto.only);

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
      await this.#scontri(tx, ownerId, id, patch);
      await this.#giri(tx, ownerId, id, patch);
      return (await scenes.update(id, patch)) as Scene;
    });
  }

  remove(ownerId: string, id: string): Promise<void> {
    return store.transaction(async (tx) => {
      const scenes = new SceneRepository(tx);
      if (!(await scenes.owns(ownerId, id))) throw notFound('scena inesistente');
      await scenes.delete(id);
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
  /**
   * Fa partire una scena.
   *
   * `chiamanti` sono le scene che l'hanno chiamata: il controllo sugli anelli
   * si fa quando si scrive, ma qui si tiene lo stesso — due modifiche fatte
   * nello stesso istante da due finestre diverse potrebbero infilarne uno, e
   * un giro senza fine muove le tende per sempre.
   */
  async run(ownerId: string, id: string, who?: string, chiamanti: string[] = []): Promise<void> {
    const { scene, steps, saltati } = await store.transaction(async (tx) => {
      const found = await new SceneRepository(tx).findById(id);
      if (!found || found.ownerId !== ownerId) throw notFound('scena inesistente');

      /*
       * Le righe che mandano un avviso non hanno un dispositivo, e non per
       * questo sono da buttare: restano in fila con le altre, perche' l'ordine
       * fra un comando e un avviso e' quello che si e' scritto.
       */
      const devices = await new DeviceRepository(tx).findAllOf(ownerId);
      const tutte = found.steps.map((step) => ({ step, device: devices.find((one) => one.id === step.deviceId) }));
      /*
       * Una riga su un dispositivo sparito si salta, e resta scritta: se lo
       * ricolleghi torna a partire. Mandargli il comando lo contava fra quelli
       * che non hanno risposto, che non è vero: non c'è.
       */
      const saltati = tutte.filter((pair) => pair.device?.goneAt).map((pair) => (pair.device as Device).name);
      const ready = tutte.filter((pair) => (!!pair.device && !pair.device.goneAt) || !!pair.step.notify || !!pair.step.scene);
      return { scene: found, steps: ready as { step: SceneStep; device?: Device }[], saltati };
    });

    if (!steps.length && saltati.length) {
      throw badRequest(`La scena «${scene.name}» comanda solo dispositivi che non ci sono più. Tornano se ricolleghi il servizio da cui venivano.`);
    }
    if (!steps.length) throw badRequest(`La scena «${scene.name}» è vuota, non c'è niente da fare`);

    /*
     * Se questa scena è gia' nella catena di chi l'ha chiamata, il giro si
     * chiude: si ferma qui e lo si scrive, invece di girare per sempre.
     */
    if (chiamanti.includes(id)) {
      console.warn(`la scena «${scene.name}» si richiama da sola, giro fermato`);
      return;
    }

    /*
     * Parte: lo si scrive prima di cominciare, e lo si dice a chi sta
     * guardando l'elenco delle scene, che le mette in fila anche per ultima
     * esecuzione. Scriverlo alla fine vorrebbe dire aspettare i dieci minuti
     * di una scena che dentro ha un'attesa.
     */
    const segnata = await store.transaction((tx) => new SceneRepository(tx).markRan(id));
    if (segnata) hub.changed(ownerId, { kind: 'scene', id, value: toSceneView(segnata) });

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
      hub.changed(ownerId, {
        kind: 'running',
        sceneId: scene.id,
        at,
        of: momenti.length,
        ...(momento.wait > 0 ? { resta: momento.wait * 1000 } : {}),
      });
      if (momento.wait > 0) await new Promise((done) => setTimeout(done, momento.wait * 1000));

      const esiti = await Promise.allSettled(
        momento.quali.map(({ step, device }) =>
          step.scene
            ? this.run(ownerId, step.scene, who, [...chiamanti, id])
            : step.notify
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

    /** Com'è andata, in una frase che si regge da sola. */
    const detto = (quanti: number, zitti: number): string => {
      const quanti_ = (n: number) => `${n} ${n === 1 ? 'dispositivo' : 'dispositivi'}`;
      // quello che si è saltato perché non c'è più, detto con un nome nostro davanti
      const salta = !saltati.length
        ? ''
        : saltati.length === 1
          ? `, e salta il dispositivo «${saltati[0]}», che non c’è più`
          : `, e salta ${saltati.length} dispositivi che non ci sono più`;
      if (!zitti) return `parte — ${quanti_(quanti)}${salta}`;
      if (zitti === quanti) return `non parte, non ha risposto nessuno${salta}`;
      return `parte a metà — ${quanti_(quanti - zitti)} su ${quanti}${salta}`;
    };

    /**
     * Quando una scena parte a meta' senza che nessuno la stia guardando.
     *
     * Se l'hai premuta tu, te lo dice il messaggio in fondo allo schermo e
     * basta cosi'. Ma una scena che parte da sola alle sette di sera, o
     * chiamata da un'altra, fallisce in silenzio: le tende restano dove sono
     * e lo scopri l'indomani. Quello e' un avviso.
     */
    const zitte = (): void => {
      if (who || !mute.length) return;

      const nomi = [...new Set(mute.map(({ device, step }) => device?.name ?? (step.scene ? 'una scena' : 'un avviso')))];
      const tutte = mute.length === steps.length;

      /*
       * Il verbo si accorda con quanti sono, non con i loro nomi: quanti sono
       * lo sappiamo noi, come si chiamano no.
       */
      const uno = nomi.length === 1;
      const elenco = nomi.join(', ');

      void noticeManager.tell(ownerId, {
        kind: 'scene',
        who: scene.name,
        short: tutte
          ? 'non è partita'
          : `partita a metà, non ${uno ? 'risponde' : 'rispondono'} ${elenco}`,
        title: tutte
          ? `La scena «${scene.name}» non è partita`
          : `La scena «${scene.name}» è partita a metà`,
        body: tutte
          ? 'Non ha risposto nessuno dei dispositivi che doveva muovere.'
          : `Non ${uno ? 'ha' : 'hanno'} risposto ${elenco}. Il resto è partito.`,
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
          /*
           * La frase intera, contata qui.
           *
           * Il singolare vale anche dentro a «su» — «1 dispositivi su 2» fa
           * sembrare scritto male tutto il resto — e quando non risponde
           * nessuno la scena non è partita a metà: non è partita, e dirlo
           * con uno zero («0 dispositivi su 1») è un modo contorto di dire
           * una cosa semplice.
           */
          detail: detto(suoi.length, zitti),
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
        zitte();
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
    zitte();
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
  /**
   * Com'è la scena dopo questa modifica, confrontata con le altre.
   *
   * Se può partire insieme a un'altra che dà a un dispositivo un ordine
   * diverso, non si salva: quale dei due vincerebbe lo deciderebbe l'ordine
   * in cui arrivano, cioè nessuno. Si dice con quale scena e su quale
   * dispositivo, così si sa cosa cambiare.
   */
  /**
   * Rifiuta una modifica che farebbe ripartire una scena da sola, e dice il
   * giro con i nomi, perché «c'è un giro» non dice cosa togliere.
   */
  async #giri(tx: Transaction, ownerId: string, id: string, patch: Partial<Scene>): Promise<void> {
    const prima = await new SceneRepository(tx).findAllOf(ownerId);
    const dopo = prima.map((one) => (one.id === id ? { ...one, ...patch } : one));
    const devices = await new DeviceRepository(tx).findAllOf(ownerId);

    const giro = giroNuovo(prima, dopo, devices, id);
    if (!giro) return;

    const scena = (sceneId: string) => `«${dopo.find((one) => one.id === sceneId)?.name ?? 'una scena'}»`;
    const dispositivo = (deviceId: string) => `il dispositivo «${devices.find((one) => one.id === deviceId)?.name ?? '?'}»`;

    if (giro.length === 1) {
      const [passo] = giro as [(typeof giro)[number]];
      throw badRequest(
        `La scena ${scena(passo.da)} ripartirebbe da sola, perché comanda ${dispositivo(passo.deviceId)}, che è quello che la fa partire.`,
      );
    }
    const tappe = giro.map(
      (passo) => `${scena(passo.da)} comanda ${dispositivo(passo.deviceId)}, che fa partire ${scena(passo.a)}`,
    );
    throw badRequest(`Queste scene si farebbero ripartire a vicenda. ${tappe.join(', e ')}.`);
  }

  async #scontri(tx: Transaction, ownerId: string, id: string, patch: Partial<Scene>): Promise<void> {
    const scenes = new SceneRepository(tx);
    const prima = await scenes.findById(id);
    if (!prima) return;
    const dopo: Scene = { ...prima, ...patch, ...('when' in patch ? { when: patch.when } : {}) };

    const altre = (await scenes.findAllOf(ownerId)).filter((one) => one.id !== id);
    for (const altra of altre) {
      if (!partonoInsieme(dopo, altra)) continue;
      const [scontro] = ordiniDiversi(dopo, altra);
      if (!scontro) continue;

      const device = await new DeviceRepository(tx).findById(scontro.deviceId);
      throw badRequest(
        `Può partire insieme alla scena «${altra.name}», che dà a «${device?.name ?? 'un dispositivo'}» un ordine diverso. ` +
          'Cambia l’orario o quello che la fa partire, oppure togli una delle due righe.',
      );
    }
  }

  /**
   * Un dispositivo e come guardarlo, controllati contro quello che sa fare.
   *
   * Una soglia vale per i numeri — i gradi, la luminosità — e un valore
   * preciso per il resto, e quel valore dev'essere uno che il dispositivo
   * può avere: «quando la tenda diventa viola» non scatterebbe mai, e
   * nessuno capirebbe perché.
   */
  #test(
    devices: Device[],
    test: { deviceId?: string; code?: string; op?: Op; value?: unknown },
    modo: 'quando' | 'se',
  ): DeviceTest {
    const device = devices.find((one) => one.id === test.deviceId);
    if (!device) throw badRequest('uno dei dispositivi non c’è più');
    const capability = (device.capabilities as Capability[]).find((one) => one.code === test.code);
    if (!capability) throw badRequest(`«${device.name}» non sa fare questa cosa`);
    provabile(capability, device.name, modo, test.value);

    const numerica = siMisura(capability);
    const op = test.op ?? 'is';
    if (numerica) {
      if (op === 'is') throw badRequest(`per «${device.name}» si sceglie sopra o sotto un numero`);
      const soglia = Number(test.value);
      if (!Number.isFinite(soglia)) throw badRequest('la soglia va scritta come numero');
      return { deviceId: device.id, code: capability.code, op, value: soglia };
    }

    if (op !== 'is') throw badRequest('sopra e sotto valgono solo per i numeri');
    const scritto = String(test.value);
    if (capability.kind === 'switch' && scritto !== 'true' && scritto !== 'false') {
      throw badRequest('un interruttore è acceso o spento');
    }
    const parole = paroleDi(capability);
    if (parole && !parole.includes(scritto)) {
      throw badRequest(`«${device.name}» non ha il valore «${scritto}»`);
    }
    if (capability.kind === 'image') throw badRequest(`«${device.name}» si guarda e basta`);
    return { deviceId: device.id, code: capability.code, op, value: scritto };
  }

  async #cleanTriggers(tx: Transaction, ownerId: string, triggers: SceneTriggerDto[]): Promise<SceneTrigger[]> {
    const devices = await new DeviceRepository(tx).findAllOf(ownerId);
    return triggers.map((trigger) => ({ id: trigger.id || `trg-${randomUUID()}`, ...this.#test(devices, trigger, 'quando') }));
  }

  /**
   * Le condizioni, ognuna con quello che le serve e niente di più.
   *
   * Arrivano come un gruppo solo, che può contenerne altri. Oltre tre livelli
   * non si va: su un telefono un gruppo dentro un gruppo dentro un gruppo non
   * si legge più, e nessuna casa ha bisogno di una domanda così.
   */
  async #cleanConditions(tx: Transaction, ownerId: string, radice: SceneConditionDto): Promise<SceneConditionGroup> {
    const devices = await new DeviceRepository(tx).findAllOf(ownerId);
    const ORA = /^([01]\d|2[0-3]):[0-5]\d$/;
    const DATA = /^\d{4}-\d{2}-\d{2}$/;
    const PROFONDITA = 3;
    let quante = 0;

    const gruppo = (condizione: SceneConditionDto, livello: number): SceneConditionGroup => {
      if (livello > PROFONDITA) throw badRequest('un gruppo può stare dentro un altro al massimo due volte');
      return {
        id: condizione.id || `cnd-${randomUUID()}`,
        kind: 'group',
        match: condizione.match === 'any' ? 'any' : 'all',
        items: (condizione.items ?? []).map((one) => una(one, livello)),
      };
    };

    const una = (condizione: SceneConditionDto, livello: number): SceneCondition => {
      quante += 1;
      if (quante > 30) throw badRequest('al massimo trenta condizioni per scena');
      const id = condizione.id || `cnd-${randomUUID()}`;
      switch (condizione.kind) {
        case 'group':
          return gruppo(condizione, livello + 1);
        case 'device':
          return { id, kind: 'device', ...this.#test(devices, condizione, 'se') };
        case 'days':
          return { id, kind: 'days', days: [...new Set(condizione.days ?? [])].sort() };
        case 'hours':
          if (!ORA.test(condizione.from ?? '') || !ORA.test(condizione.to ?? '')) {
            throw badRequest("le ore vanno scritte come 07:30");
          }
          return { id, kind: 'hours', from: condizione.from as string, to: condizione.to as string };
        case 'dates': {
          const from = condizione.from ?? '';
          const to = condizione.to ?? '';
          if (!DATA.test(from) || !DATA.test(to)) throw badRequest('le date vanno scritte come 2026-09-25');
          if (from > to) throw badRequest('il periodo finisce prima di cominciare');
          return { id, kind: 'dates', from, to };
        }
      }
    };

    if (radice.kind !== 'group') throw badRequest('le condizioni arrivano come un gruppo');
    return gruppo(radice, 1);
  }

  async #clean(
    tx: Transaction,
    ownerId: string,
    steps: SceneStepDto[],
    id?: string,
  ): Promise<SceneStep[]> {
    const devices = new DeviceRepository(tx);

    /*
     * Un momento finisce dove comincia un'attesa. Dentro a un momento le righe
     * partono insieme, quindi due volte la stessa cosa li' dentro vorrebbe
     * dire dare due ordini contrari allo stesso dispositivo nello stesso
     * istante: quello che succede dopo non lo decide piu' nessuno.
     */
    let momento = 0;
    const gia = new Map<string, number>();

    const out: SceneStep[] = [];
    for (const step of steps) {
      const after = Math.max(0, Math.round(step.after ?? 0));

      /*
       * Una riga che manda un avviso non tocca niente in casa: non c'e' un
       * dispositivo da controllare, e due avvisi nello stesso momento sono
       * legittimi — sono due frasi, non due ordini contrari.
       */
      if (step.notify !== undefined) {
        if (after > 0) momento += 1;
        out.push({ notify: step.notify, ...(after ? { after } : {}) });
        continue;
      }

      /*
       * Una scena che ne chiama un'altra: quella deve esistere, essere tua, e
       * non riportare qui. Un anello — «A chiama B, B chiama A» — girerebbe
       * per sempre, e accorgersene mentre le tende vanno su e giù e' tardi.
       */
      if (step.scene) {
        const altra = await new SceneRepository(tx).findById(step.scene);
        if (!altra || altra.ownerId !== ownerId) throw badRequest('scena inesistente');
        if (step.scene === id) throw badRequest('una scena non può chiamare se stessa');
        // in creazione un id ancora non c'è, e un anello non può esistere
        if (id && (await leadsTo(tx, step.scene, id))) {
          throw badRequest(`«${altra.name}» riporta a questa, e sarebbe un giro senza fine`);
        }

        if (after > 0) momento += 1;
        out.push({ scene: step.scene, ...(after ? { after } : {}) });
        continue;
      }

      const device = step.deviceId ? await devices.findById(step.deviceId) : undefined;
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
          `«${device.name}» compare due volte nello stesso momento, mettici un'attesa in mezzo o togline una`,
        );
      }
      gia.set(chiave, momento);

      out.push({
        deviceId: step.deviceId,
        code: step.code,
        value: step.value as DeviceValue,
        ...(after ? { after } : {}),
      });
    }
    return out;
  }
}

export const sceneManager = new SceneManager();
