import { randomUUID } from 'node:crypto';
import type { Capability, DeviceValue } from '../../../shared/protocol.js';
import type { SceneConditionDto, SceneDto, SceneStepDto, SceneTriggerDto } from '../dto/scene.dto.js';
import { toSceneView } from '../dto/views.js';
import { badGateway, badRequest, notFound } from '../errors/HttpError.js';
import { hub } from '../iot/hub.js';
import type { Transaction } from '../persistence/db.js';
import { store } from '../persistence/db.js';
import { DeviceRepository } from '../repositories/DeviceRepository.js';
import { SceneRepository, SceneRunRepository } from '../repositories/SceneRepository.js';
import { stendi, type Foglia } from '../rules/chiamate.js';
import { giroNuovo } from '../rules/giri.js';
import { diversi, ordiniDi, partonoInsieme } from '../rules/scontri.js';
import type { Device, DeviceTest, Op, Scene, SceneCondition, SceneConditionGroup, SceneStep, SceneTrigger } from '../types.js';
import { check, provaDi } from './check.js';
import { guardati } from './guardati.js';
import { logManager } from './LogManager.js';
import { noticeManager, scrivi } from './NoticeManager.js';
import { dispositivi } from './says.js';

/** Una riga pronta a partire: quello che fa, quando, e su quale dispositivo. */
interface Pronta extends Foglia {
  device?: Device;
}

/** Un momento: le righe che partono insieme, e quanto aspettare prima. */
interface Momento {
  wait: number;
  quali: Pronta[];
}

/**
 * Le scene che stanno andando adesso, partenza per partenza.
 *
 * Una scena con un'attesa di dieci minuti è una promessa fatta dieci minuti
 * prima. Se nel frattempo la cambi o la togli, quello che resta da fare è
 * quello della scena di prima, e mandarlo lo stesso vorrebbe dire muovere
 * una tenda che nella scena non c'è più. Si ferma. Vale anche per chi la
 * chiama: le sue righe sono dentro alla stessa partenza.
 */
const inCorsa = new Map<string, { scene: Set<string>; stop: AbortController }>();

/** Un'attesa che si interrompe se la partenza viene fermata. */
function aspetta(secondi: number, segnale: AbortSignal): Promise<void> {
  return new Promise((done, fail) => {
    if (segnale.aborted) return fail(segnale.reason as Error);
    const timer = setTimeout(() => {
      segnale.removeEventListener('abort', via);
      done();
    }, secondi * 1000);
    const via = (): void => {
      clearTimeout(timer);
      fail(segnale.reason as Error);
    };
    segnale.addEventListener('abort', via, { once: true });
  });
}

/** Perché una partenza si è fermata prima della fine: detto nel registro. */
class Fermata extends Error {}

export class SceneManager {
  list(ownerId: string): Promise<Scene[]> {
    return store.transaction((tx) => new SceneRepository(tx).findAllOf(ownerId));
  }

  create(ownerId: string, dto: SceneDto): Promise<Scene> {
    return store.transaction(async (tx) => {
      const [scene, devices] = await this.#leggi(tx, ownerId);
      const steps = this.#clean(scene, devices, ownerId, dto.steps ?? []);
      return new SceneRepository(tx).insert(ownerId, dto.name, steps);
    });
  }

  async update(ownerId: string, id: string, dto: SceneDto): Promise<Scene> {
    const fatta = await store.transaction(async (tx) => {
      const scenes = new SceneRepository(tx);
      const [tutte, devices] = await this.#leggi(tx, ownerId);
      if (!tutte.some((one) => one.id === id)) throw notFound('scena inesistente');

      const patch: Partial<Scene> = { name: dto.name };
      if (dto.steps) patch.steps = this.#clean(tutte, devices, ownerId, dto.steps, id);
      if (dto.triggers) patch.triggers = this.#cleanTriggers(devices, dto.triggers);
      if (dto.only) patch.only = this.#cleanConditions(devices, dto.only);

      /*
       * `null` vuol dire «non parte piu' da sola», che e' diverso da «non ne
       * stiamo parlando»: il primo cancella l'orario, il secondo lo lascia
       * dov'e'. Il fuso non si scrive: è quello dell'account.
       */
      if (dto.when !== undefined) {
        patch.when = dto.when
          ? {
              at: dto.when.at,
              days: dto.when.days ?? [],
              ...(dto.when.on ? { on: dto.when.on } : {}),
              ...(dto.when.off ? { off: true } : {}),
            }
          : undefined;
      }
      this.#scontri(tutte, devices, id, patch);
      this.#giri(tutte, devices, id, patch);
      return (await scenes.update(id, patch)) as Scene;
    });
    // le sue partenze possono essere cambiate: chi ascolta i passaggi rilegge cosa guardare
    guardati.cambiate();
    this.#ferma(id, 'si ferma prima della fine, perché nel frattempo la scena cambia');
    return fatta;
  }

  async remove(ownerId: string, id: string): Promise<void> {
    await store.transaction(async (tx) => {
      const scenes = new SceneRepository(tx);
      if (!(await scenes.owns(ownerId, id))) throw notFound('scena inesistente');
      await scenes.delete(id);
    });
    guardati.cambiate();
    this.#ferma(id, 'si ferma prima della fine, perché nel frattempo la scena viene tolta');
  }

  /**
   * Il fusibile salta: la scena non parte più da sola finché qualcuno non la
   * tocca. Lo dice solo chi l'ha fatto saltare davvero, così l'avviso parte
   * una volta anche se due passaggi arrivano insieme; e la riga dell'avviso
   * si scrive insieme al salto, perché uno non resti senza l'altra.
   */
  async blow(id: string): Promise<Scene | undefined> {
    const fatto = await store.transaction(async (tx) => {
      const fermata = await new SceneRepository(tx).blow(id);
      if (!fermata) return undefined;
      const riga = await scrivi(tx, fermata.ownerId, {
        kind: 'scene',
        who: fermata.name,
        short: 'si ferma, perché continuava a ripartire in automatico',
        title: `La scena «${fermata.name}» è stata fermata`,
        body:
          'È partita da sola dieci volte in un minuto e stava per ripartire ancora, come se fosse in un giro. Guarda cosa la fa partire e cosa comanda. ' +
          'Non riparte da sola finché non la cambi o non la fai partire a mano.',
      });
      return { fermata, riga };
    });
    if (!fatto) return undefined;
    hub.changed(fatto.fermata.ownerId, { kind: 'scene', id: fatto.fermata.id, value: toSceneView(fatto.fermata) });
    await noticeManager.manda(fatto.riga);
    return fatto.fermata;
  }

  /**
   * Le scene del proprietario e i suoi dispositivi, letti una volta: ogni
   * controllo di una modifica li guarda, e leggerli per ognuno voleva dire
   * una domanda per riga.
   */
  async #leggi(tx: Transaction, ownerId: string): Promise<[Scene[], Device[]]> {
    return Promise.all([new SceneRepository(tx).findAllOf(ownerId), new DeviceRepository(tx).findAllOf(ownerId)]);
  }

  /**
   * Una scena e tutte quelle che chiama, anche passando per altre, lette a
   * giri: ogni giro chiede solo quelle nominate e non ancora lette. Un
   * anello si ferma da solo, perché una scena già letta non si chiede due
   * volte.
   */
  async #chiamate(tx: Transaction, ownerId: string, id: string): Promise<Map<string, Scene>> {
    const scenes = new SceneRepository(tx);
    const perId = new Map<string, Scene>();
    // anche quelle chieste e non trovate: una chiamata a una scena tolta non si richiede a ogni giro
    const chieste = new Set<string>();
    let daLeggere = [id];
    while (daLeggere.length) {
      for (const one of daLeggere) chieste.add(one);
      const lette = await scenes.findManyOf(ownerId, daLeggere);
      for (const one of lette) perId.set(one.id, one);
      const nominate = lette.flatMap((one) => one.steps.flatMap((step) => (step.scene ? [step.scene] : [])));
      daLeggere = [...new Set(nominate)].filter((one) => !chieste.has(one));
    }
    return perId;
  }

  /** Ferma le partenze che contano su quella scena, e dice perché nel registro. */
  #ferma(sceneId: string, perche: string): void {
    for (const corsa of inCorsa.values()) {
      if (corsa.scene.has(sceneId)) corsa.stop.abort(new Fermata(perche));
    }
  }

  /**
   * Cosa fa la scena e chi tocca, letto e segnato in un colpo solo.
   *
   * Le scene che chiama si stendono qui, con i loro tempi, e da qui in poi
   * è una fila sola (`rules/chiamate.ts`): un anello — «A chiama B, B chiama
   * A» — si ferma alla seconda volta invece di girare per sempre, anche se
   * due modifiche fatte nello stesso istante riuscissero a infilarne uno.
   *
   * Nella stessa transazione si segna che sono partite, e se c'è da
   * aspettare si lascia scritta la partenza, così un riavvio a metà si può
   * raccontare.
   */
  #prepara(ownerId: string, id: string, run: string, who?: string) {
    return store.transaction(async (tx) => {
      /*
       * Solo quello che serve: lei, le scene che chiama (e quelle che
       * chiamano loro), e i dispositivi che nominano. Leggere tutte le scene
       * e tutti i dispositivi dell'account a ogni partenza voleva dire, per
       * una scena che accende una luce, rileggere la casa intera.
       */
      const perId = await this.#chiamate(tx, ownerId, id);
      const found = perId.get(id);
      if (!found) throw notFound('scena inesistente');

      const stesa = stendi(found, (sceneId) => perId.get(sceneId));
      const nominati = [...new Set(stesa.foglie.flatMap(({ step }) => (step.deviceId ? [step.deviceId] : [])))];
      const devices = await new DeviceRepository(tx).findManyOf(ownerId, nominati);
      for (const anello of stesa.anelli) {
        const nomi = anello.map((sceneId) => perId.get(sceneId)?.name ?? sceneId).join(' → ');
        console.warn(`la scena «${found.name}» tornerebbe su sé stessa (${nomi}), la chiamata che riporta indietro si salta`);
      }

      /*
       * Le righe che mandano un avviso non hanno un dispositivo, e non per
       * questo sono da buttare: restano in fila con le altre, perche' l'ordine
       * fra un comando e un avviso e' quello che si e' scritto.
       */
      const tutteLeRighe: Pronta[] = stesa.foglie.map((foglia) => ({
        ...foglia,
        device: devices.find((one) => one.id === foglia.step.deviceId),
      }));
      /*
       * Una riga su un dispositivo sparito si salta, e resta scritta: se lo
       * ricolleghi torna a partire. Mandargli il comando lo contava fra quelli
       * che non hanno risposto, che non è vero: non c'è.
       */
      const saltati = [...new Map(tutteLeRighe.flatMap((one) => (one.device?.goneAt ? [[one.device.id, one.device] as const] : []))).values()];
      const pronte = tutteLeRighe.filter((one) => (!!one.device && !one.device.goneAt) || !!one.step.notify);

      if (!pronte.length && saltati.length) {
        throw badRequest(
          `La scena «${found.name}» comanda solo dispositivi che non ci sono più. Tornano se ricolleghi il servizio da cui venivano.`,
        );
      }
      if (!pronte.length) throw badRequest(`La scena «${found.name}» è vuota, non c'è niente da fare`);

      /*
       * A momenti, non tutto in una volta. Le righe con lo stesso tempo
       * partono insieme; fra un tempo e l'altro si aspetta la differenza.
       */
      const tempi = [...new Set(pronte.map((one) => one.t))].sort((a, b) => a - b);
      const momenti: Momento[] = tempi.map((t, at) => ({
        wait: t - (tempi[at - 1] ?? 0),
        quali: pronte.filter((one) => one.t === t),
      }));

      /*
       * Parte: lo si scrive prima di cominciare, e lo si dice a chi sta
       * guardando l'elenco delle scene, che le mette in fila anche per ultima
       * esecuzione. Chi la preme a mano la riaccende, se il fusibile l'aveva
       * fermata: l'ha guardata, e la vuole.
       */
      const segnate = await new SceneRepository(tx).markRan([...stesa.scene], who ? id : undefined);

      /*
       * Le case che la scena nomina, anche quelle dove salta soltanto un
       * dispositivo sparito: chi guarda il registro di quella casa deve
       * leggere che la scena è passata di lì e cosa non ha trovato.
       */
      const case_ = [
        ...new Set([...pronte.flatMap((one) => (one.device ? [one.device.agentId] : [])), ...saltati.map((one) => one.agentId)]),
      ];
      if (momenti.length > 1 || (momenti[0]?.wait ?? 0) > 0) {
        await new SceneRunRepository(tx).start({ id: run, sceneId: id, ownerId, agentIds: case_ });
      }
      return { scene: found, momenti, pronte, saltati, segnate, toccate: stesa.scene, case_ };
    });
  }

  /** La partenza è finita, in un modo o nell'altro: non c'è più niente da raccontare dopo un riavvio. */
  #fine(run: string): Promise<void> {
    return store.transaction((tx) => new SceneRunRepository(tx).end(run));
  }

  /** Batte per le partenze che questo server sta eseguendo: sono vive. */
  battito(): Promise<void> {
    return store.transaction((tx) => new SceneRunRepository(tx).beat([...inCorsa.keys()]));
  }

  /**
   * Le partenze rimaste a metà perché il servizio che le eseguiva si è fermato.
   *
   * Le attese vivono in memoria, e un riavvio le perde: la tenda che doveva
   * richiudersi dopo dieci minuti resta aperta. Nel registro delle case che
   * la scena toccava si scrive che non è arrivata in fondo, e perché. Sono
   * quelle che non battono più da prima di `ferme`.
   */
  async interrotte(ferme: Date): Promise<void> {
    const rimaste = await store.transaction((tx) => new SceneRunRepository(tx).takeInterrupted(ferme));
    for (const one of rimaste) {
      for (const agentId of one.agentIds) {
        logManager.note({
          ownerId: one.ownerId,
          agentId,
          kind: 'scene',
          subject: one.name,
          detail: 'non arriva in fondo, perché il servizio riparte durante un’attesa',
          ok: false,
        });
      }
    }
  }

  /**
   * Fa partire una scena, tutta insieme.
   *
   * Le righe dello stesso momento partono in parallelo, non una dopo
   * l'altra: due tende che si chiudono a mezzo secondo di distanza si
   * vedono, ed è proprio quello che si voleva evitare mettendole nella
   * stessa scena. Dove c'è un'attesa invece si aspetta davvero.
   *
   * Poi si conta chi non ha risposto, e lo si dice con i nomi. Se non ha
   * risposto nessuno è un guasto; se è partita a metà, la scena non si
   * riavvolge — quello che si è mosso resta mosso, e si dice cosa manca.
   */
  async run(ownerId: string, id: string, who?: string): Promise<void> {
    const run = `run-${randomUUID()}`;
    const { scene, momenti, pronte, saltati, segnate, toccate, case_ } = await this.#prepara(ownerId, id, run, who);
    for (const one of segnate) hub.changed(ownerId, { kind: 'scene', id: one.id, value: toSceneView(one) });

    const stop = new AbortController();
    inCorsa.set(run, { scene: toccate, stop });

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
    /*
     * L'esito si conta sui dispositivi, non sulle righe: una lampada che si
     * accende, va al 40% e diventa arancione è un dispositivo solo, e
     * «parte, 3 dispositivi» era falso. Un dispositivo ha risposto se ha
     * risposto a tutte le sue righe.
     *
     * Contano solo i dispositivi, perché è di loro che si dice se hanno
     * risposto. Una scena chiamata si stende dentro a chi la chiama
     * (`rules/chiamate.ts`), quindi i suoi dispositivi contano nella riga
     * di chi l'ha fatta partire, con il suo nome. Una riga che manda un
     * avviso non è un dispositivo che non risponde: il suo esito è l'avviso
     * stesso, e se non si riesce a scriverlo lo si dice nel terminale. Per
     * questo una scena fatta solo di avvisi non lascia righe nel registro,
     * che è quello di una casa: in nessuna casa è successo niente.
     */
    const mute: Pronta[] = [];

    const suona = async (momento: Momento, at: number): Promise<void> => {
      // Prima di aspettare si dice che si sta aspettando: una scena che dura
      // dieci minuti, se non dice niente, sembra non essere partita.
      hub.changed(ownerId, {
        kind: 'running',
        run,
        sceneId: scene.id,
        at,
        of: momenti.length,
        ...(momento.wait > 0 ? { resta: momento.wait * 1000 } : {}),
      });
      if (momento.wait > 0) await aspetta(momento.wait, stop.signal);

      const esiti = await Promise.allSettled(
        momento.quali.map(({ step, device, da }) =>
          step.notify
            ? noticeManager.tell(ownerId, { kind: 'scene', who: da.name, short: step.notify, title: da.name, body: step.notify })
            : hub.command(
                (device as Device).agentId,
                (device as Device).externalId,
                step.code as string,
                step.value as DeviceValue,
              ),
        ),
      );
      momento.quali.forEach((pronta, at) => {
        const esito = esiti[at];
        if (esito?.status !== 'rejected') return;
        if (pronta.device) mute.push(pronta);
        else console.warn(`la scena «${scene.name}» non riesce a mandare un avviso, ${(esito.reason as Error).message}`);
      });
    };

    /** Quanti dispositivi, e quanti non hanno risposto, in quella casa o in tutte. */
    const conta = (agentId?: string): { tutti: number; zitti: number; nomi: string[] } => {
      const qui = (pronta: Pronta): boolean => !!pronta.device && (!agentId || pronta.device.agentId === agentId);
      const zitti = new Map(mute.filter(qui).map(({ device }) => [(device as Device).id, (device as Device).name]));
      return {
        tutti: new Set(pronte.filter(qui).map(({ device }) => (device as Device).id)).size,
        zitti: zitti.size,
        nomi: [...zitti.values()],
      };
    };

    /** Com'è andata in una casa, in una frase che si regge da sola. */
    const detto = (agentId: string): string => {
      const { tutti, zitti } = conta(agentId);
      // quello che si è saltato perché non c'è più, detto con un nome nostro davanti
      const suoi = saltati.filter((one) => one.agentId === agentId);
      const salta = !suoi.length
        ? ''
        : suoi.length === 1
          ? `, e salta il dispositivo «${suoi[0]?.name}», che non c’è più`
          : `, e salta ${dispositivi(suoi.length)} che non ci sono più`;
      if (!tutti) return `non parte${salta}`;
      if (!zitti) return `parte — ${dispositivi(tutti)}${salta}`;
      if (zitti === tutti) return `non parte, non ha risposto nessuno${salta}`;
      return `parte a metà — ${dispositivi(tutti - zitti)} su ${tutti}${salta}`;
    };

    /**
     * Quando una scena parte a meta' senza che nessuno la stia guardando.
     *
     * Se l'hai premuta tu, te lo dice il messaggio in fondo allo schermo e
     * basta cosi'. Ma una scena che parte da sola alle sette di sera
     * fallisce in silenzio: le tende restano dove sono e lo scopri
     * l'indomani. Quello e' un avviso.
     */
    const zitte = (): void => {
      const { tutti, zitti, nomi } = conta();
      if (who || !zitti) return;
      const tutte = zitti === tutti;

      /*
       * Il verbo si accorda con quanti sono, non con i loro nomi: quanti sono
       * lo sappiamo noi, come si chiamano no.
       */
      const uno = nomi.length === 1;
      const elenco = nomi.join(', ');

      void noticeManager.tell(ownerId, {
        kind: 'scene',
        who: scene.name,
        short: tutte ? 'non parte' : `parte a metà, non ${uno ? 'risponde' : 'rispondono'} ${elenco}`,
        title: tutte ? `La scena «${scene.name}» non è partita` : `La scena «${scene.name}» è partita a metà`,
        body: tutte
          ? 'Non ha risposto nessuno dei dispositivi che doveva muovere.'
          : `Non ${uno ? 'ha' : 'hanno'} risposto ${elenco}. Il resto è partito.`,
      });
    };

    /*
     * Una riga per agente, non una per passo: «Sera» è una cosa sola anche
     * se ne muove sei, e sei righe uguali nel registro sono rumore. Ma se la
     * scena tocca due case, ognuna deve poter leggere che è passata di lì.
     * Quando non risponde nessuno la scena non è partita a metà: non è
     * partita.
     */
    const nota = (fermata?: string): void => {
      for (const agentId of case_) {
        const { tutti, zitti } = conta(agentId);
        logManager.note({
          ownerId,
          agentId,
          kind: 'scene',
          subject: scene.name,
          detail: fermata ?? detto(agentId),
          ok: !fermata && tutti > 0 && zitti === 0,
          ...(who ? { who } : {}),
        });
      }
    };

    const finita = (): void => {
      inCorsa.delete(run);
      hub.changed(ownerId, { kind: 'running', run, sceneId: scene.id, at: momenti.length, of: momenti.length, done: true });
    };

    const [primo, ...resto] = momenti;
    const subito = primo && primo.wait === 0;
    if (subito) await suona(primo, 1);

    const dopo = subito ? resto : momenti;
    if (dopo.length) {
      void (async () => {
        for (const [at, momento] of dopo.entries()) await suona(momento, at + (subito ? 2 : 1));
        nota();
        zitte();
      })()
        .catch((error: Error) => {
          if (error instanceof Fermata) nota(error.message);
          else console.warn(`la scena «${scene.name}» si è fermata, ${error.message}`);
        })
        .finally(() => {
          finita();
          void this.#fine(run).catch((error: Error) => console.warn(`partenza di «${scene.name}», ${error.message}`));
        });

      // Quello che si sa adesso è solo del primo momento, e dirlo a metà
      // sarebbe peggio che non dirlo: il resto finisce nel registro.
      return;
    }

    nota();
    zitte();
    finita();

    const { tutti, zitti, nomi } = conta();
    if (!zitti) return;
    const elenco = nomi.map((nome) => `«${nome}»`).join(', ');
    throw badGateway(
      zitti === tutti
        ? `Nessun dispositivo di «${scene.name}» ha risposto`
        : `Non ${nomi.length === 1 ? 'ha' : 'hanno'} risposto ${elenco}. Il resto della scena è partito.`,
    );
  }

  /**
   * Rifiuta una modifica che farebbe ripartire una scena da sola, e dice il
   * giro con i nomi, perché «c'è un giro» non dice cosa togliere.
   */
  #giri(prima: Scene[], devices: Device[], id: string, patch: Partial<Scene>): void {
    const dopo = prima.map((one) => (one.id === id ? { ...one, ...patch } : one));

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

  /**
   * Com'è la scena dopo questa modifica, confrontata con le altre.
   *
   * Se può partire insieme a un'altra che dà a un dispositivo un ordine
   * diverso nello stesso istante, non si salva: quale dei due vincerebbe lo
   * deciderebbe l'ordine in cui arrivano, cioè nessuno. Si dice con quale
   * scena e su quale dispositivo, così si sa cosa cambiare.
   */
  #scontri(tutte: Scene[], devices: Device[], id: string, patch: Partial<Scene>): void {
    const prima = tutte.find((one) => one.id === id);
    if (!prima) return;
    const dopo: Scene = { ...prima, ...patch, ...('when' in patch ? { when: patch.when } : {}) };
    const perId = new Map(tutte.map((one) => [one.id, one.id === id ? dopo : one]));
    const trova = (sceneId: string) => perId.get(sceneId);

    /*
     * Ogni scena si stende e se ne preparano gli ordini una volta sola, prima
     * e dopo la modifica, e solo quando serve: confrontarle a coppie
     * rifacendo tutto per ogni coppia cresceva col quadrato delle scene.
     */
    const primaDi = new Map(tutte.map((one) => [one.id, one]));
    const trovaPrima = (sceneId: string) => primaDi.get(sceneId);
    const una = <T>(fai: (scene: Scene) => T) => {
      const fatte = new Map<string, T>();
      return (scene: Scene): T => {
        if (!fatte.has(scene.id)) fatte.set(scene.id, fai(scene));
        return fatte.get(scene.id) as T;
      };
    };
    const stesaDopo = una((scene) => stendi(scene, trova));
    const ordiniDopo = una((scene) => ordiniDi(stesaDopo(scene)));
    const ordiniPrima = una((scene) => ordiniDi(stendi(scene, trovaPrima)));

    if (stesaDopo(dopo).tagliata) {
      throw badRequest('Con le scene che chiama diventa troppo lunga per partire tutta. Togli qualche chiamata.');
    }

    /*
     * Non solo lei. Una scena chiamata di solito non ha orario né partenze,
     * e da sola non parte insieme a nessuna: i suoi ordini però partono con
     * chi la chiama, e cambiarli può mettere in lite quella con un'altra.
     */
    const coinvolte = [...perId.values()].filter((one) => one.id === id || stesaDopo(one).scene.has(id));

    /*
     * Conta solo una lite che nasce da questa modifica. Una che c'era già —
     * scritta prima che il controllo guardasse dentro alle chiamate — non
     * deve impedire di rinominare una scena o di toccarne una riga che non
     * c'entra: si sistema cambiando le scene che litigano.
     */
    const cera = (a: Scene, b: Scene, deviceId: string): boolean => {
      const pa = primaDi.get(a.id);
      const pb = primaDi.get(b.id);
      if (!pa || !pb || !partonoInsieme(pa, pb)) return false;
      return diversi(ordiniPrima(pa), ordiniPrima(pb)).some((one) => one.deviceId === deviceId);
    };

    for (const questa of coinvolte) {
      for (const altra of perId.values()) {
        if (altra.id === questa.id || !partonoInsieme(questa, altra)) continue;
        const scontro = diversi(ordiniDopo(questa), ordiniDopo(altra)).find((one) => !cera(questa, altra, one.deviceId));
        if (!scontro) continue;

        const device = devices.find((one) => one.id === scontro.deviceId);
        const chi = questa.id === id ? 'Può partire' : `Chiamata dalla scena «${questa.name}», può partire`;
        throw badRequest(
          `${chi} insieme alla scena «${altra.name}», che dà a «${device?.name ?? 'un dispositivo'}» un ordine diverso. ` +
            'Cambia l’orario o quello che la fa partire, oppure togli una delle due righe.',
        );
      }
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
    // lo stesso controllo degli avvisi: una prova è una prova, da qualunque parte la si scriva
    return { deviceId: device.id, code: capability.code, ...provaDi(capability, device.name, modo, test.op ?? 'is', test.value) };
  }

  #cleanTriggers(devices: Device[], triggers: SceneTriggerDto[]): SceneTrigger[] {
    return triggers.map((trigger) => ({ id: trigger.id || `trg-${randomUUID()}`, ...this.#test(devices, trigger, 'quando') }));
  }

  /**
   * Le condizioni, ognuna con quello che le serve e niente di più.
   *
   * Arrivano come un gruppo solo, che può contenerne altri. Oltre tre livelli
   * non si va: su un telefono un gruppo dentro un gruppo dentro un gruppo non
   * si legge più, e nessuna casa ha bisogno di una domanda così.
   */
  #cleanConditions(devices: Device[], radice: SceneConditionDto): SceneConditionGroup {
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


  /**
   * Ogni riga dev'essere possibile: il dispositivo è suo, quella cosa la sa
   * fare, e il valore ha senso. Un dispositivo può comparire più volte — una
   * lampadina che si accende e si porta al 30% sono due righe, ed è giusto —
   * e anche due volte per la stessa cosa, purché in due momenti diversi:
   * «apri, aspetta un minuto, richiudi» è una scena sensata, «apri e chiudi
   * nello stesso istante» no.
   */
  #clean(tutte: Scene[], devices: Device[], ownerId: string, steps: SceneStepDto[], id?: string): SceneStep[] {
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

      // una scena che ne chiama un'altra: quella deve esistere ed essere tua
      if (step.scene) {
        const altra = tutte.find((one) => one.id === step.scene);
        if (!altra || altra.ownerId !== ownerId) throw badRequest('scena inesistente');
        if (step.scene === id) throw badRequest('una scena non può chiamare se stessa');
        if (after > 0) momento += 1;
        out.push({ scene: step.scene, ...(after ? { after } : {}) });
        continue;
      }

      const device = devices.find((one) => one.id === step.deviceId);
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
        deviceId: device.id,
        code: capability.code,
        value: step.value as DeviceValue,
        ...(after ? { after } : {}),
      });
    }

    /*
     * Un anello — «A chiama B, B chiama A» — girerebbe per sempre, e
     * accorgersene mentre le tende vanno su e giù è tardi. Si stende la
     * scena come sarebbe dopo, con la stessa funzione che la fa partire
     * (`rules/chiamate.ts`), e se una strada torna qui si rifiuta. In
     * creazione un id ancora non c'è, e nessuno può chiamarla.
     */
    if (id) {
      const perId = new Map(tutte.map((one) => [one.id, one]));
      const questa = { ...(perId.get(id) as Scene), steps: out };
      perId.set(id, questa);
      const anello = stendi(questa, (sceneId) => perId.get(sceneId)).anelli.find((one) => one[0] === id);
      if (anello) {
        const altra = perId.get(anello[1] as string);
        throw badRequest(`«${altra?.name ?? 'una scena'}» riporta a questa, e sarebbe un giro senza fine`);
      }
    }
    return out;
  }
}

export const sceneManager = new SceneManager();
