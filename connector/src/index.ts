import type {
  BackendMessage,
  CommandMessage,
  DeviceSnapshot,
  HelloMessage,
  PairMessage,
  SnapshotMessage,
  UnwatchMessage,
  WatchMessage,
} from '../../shared/protocol.js';
import { ConfigError, loadConfig, stateFile } from './config.js';
import type { Capability } from '../../shared/protocol.js';
import {
  arrivato,
  dominioDi,
  domainOf,
  EVENTO_MS,
  formaDi,
  formaNota,
  haImmagine,
  impostaGradi,
  impostaTraduzioni,
  ricordaPreferenza,
  usaPreferenze,
  soloQueste,
  targetOf,
  toServiceCall,
  usaMemoria,
} from './entities.js';
import { Forme, uguali } from './forme.js';
import { componi, fotografia, raggruppa, statoGruppo, type Gruppo } from './gruppi.js';
import { forgetDoors, lastSeen, look as guardala, noticed, watchEyes } from './eyes.js';
import { channelOf } from './go2rtc.js';
import { HomeAssistant, type HaEntity, type Voce } from './homeassistant.js';
import { Link, PROTOCOL } from './link.js';
import { blind, look } from './live.js';
import { Impulsi, IMPULSO_MAX_MS, LUNGO_MS, osserva } from './impulsi.js';
import { PROVIDERS } from './providers.js';
import { ensureToken } from './onboarding.js';
import { cancelPairing, conNomi, listLinked, resumePairing, startPairing, submitPairing, titled, unlink } from './pairing.js';

/**
 * Chi e', per il server e per chi guarda i log.
 *
 * Arriva dall'etichetta con cui l'immagine e' stata costruita, non da un
 * numero scritto qui: erano tre posti a dire la stessa cosa — questa riga,
 * il package.json e il tag di rilascio — e il primo che si dimentica fa
 * raccontare una bugia a tutte le case del mondo. Fuori da un'immagine, in
 * sviluppo, si chiama `dev`, che e' esattamente quello che e'.
 */
const VERSION = process.env.CONNECTOR_VERSION || 'dev';
/** All'avvio le entità arrivano a centinaia: si aspetta un attimo e si manda una lista sola. */
const COALESCE_MS = 500;

async function main(): Promise<void> {
  const config = loadConfig();

  // Se Home Assistant è appena installato non ha ancora un utente, quindi
  // nemmeno un token: il primo avvio lo facciamo noi, e da lì in poi il token
  // ce lo teniamo. È il pezzo che prima costringeva una persona al browser.
  config.haToken = await ensureToken(config);
  // le forme di ogni entità com'erano l'ultima volta che si sapevano (connector/src/forme.ts)
  usaMemoria(new Forme(stateFile(config, 'forme.json')));
  usaPreferenze(stateFile(config, 'preferenze.json'));
  /** La fotografia di adesso. Al riavvio la si rifà chiedendola ad HA, che la sa. */
  const devices = new Map<string, DeviceSnapshot>();
  /**
   * Come stanno insieme le entità (connector/src/gruppi.ts): il gruppo di
   * ogni dispositivo, l'ultimo stato di ogni entità, e di quale dispositivo
   * è ogni entità che sta dentro a un altro. Si rifà a ogni giro d'inventario;
   * in mezzo cambiano solo gli stati. Un giro costruisce mappe nuove e le
   * mette al posto delle vecchie tutte insieme, senza attese in mezzo: chi
   * le legge nel frattempo le trova intere, vecchie o nuove.
   */
  let gruppi = new Map<string, Gruppo>();
  let dentroA = new Map<string, string>();
  let voci = new Map<string, Voce>();
  let stati = new Map<string, HaEntity>();
  /** Da quale collegamento viene ogni entità, com'era all'ultimo giro. */
  let nati = new Map<string, string>();
  /**
   * Le entità che l'anagrafe conosce ma che al giro non avevano ancora uno
   * stato: appena ne arriva uno, il giro si rifà, se no restavano fuori fino
   * al riavvio.
   */
  let senzaStato = new Set<string>();
  /**
   * Gli stati arrivati mentre un giro aspettava la centrale. La fotografia
   * che lui riceve può essere più vecchia di loro, e buttarli vorrebbe dire
   * tornare indietro nel tempo.
   */
  let arrivati: Map<string, HaEntity> | null = null;
  /** Gli interruttori a impulso, imparati guardandoli (connector/src/impulsi.ts). */
  const impulsi = new Impulsi(stateFile(config, 'impulsi.json'));
  /** Quando abbiamo spento noi un'entità: uno spegnimento chiesto da noi non è un impulso. */
  const spenti = new Map<string, number>();
  /**
   * L'ultimo stato detto al server di ogni dispositivo, com'è partito. Uno
   * uguale non si rimanda: una TV che dice dove è arrivato il film ogni
   * secondo, o un segnale che oscilla, cambiano la centrale ma non quello
   * che si vede.
   */
  const detti = new Map<string, string>();

  /**
   * Un dispositivo come esce di qui.
   *
   * Nella mappa `devices` resta quello che dice Home Assistant, sempre e
   * solo quello. Il sapere in più sulle telecamere si applica qui, in
   * uscita, e non si scrive mai dentro: scrivercelo voleva dire perdere la
   * verità di HA, e da lì in poi ogni conto successivo si moltiplicava per
   * un falso rimasto appiccicato. Una telecamera tornata a funzionare
   * restava rossa finché HA non si ricordava di mandare un aggiornamento
   * suo, che può voler dire fra un minuto o domani.
   */
  const fuori = (device: DeviceSnapshot): DeviceSnapshot => {
    const pulse = impulsi.get(device.externalId);
    return {
      ...device,
      online: vero(device),
      // a impulso lo sa chi l'ha visto succedere e non Home Assistant: si
      // aggiunge qui, come quello che si sa in più delle telecamere
      ...(pulse
        ? {
            capabilities: device.capabilities.map((capability) =>
              capability.kind === 'switch' && capability.code === 'power' ? { ...capability, pulse } : capability,
            ),
          }
        : {}),
    };
  };

  /** L'impronta di quello che il server sa di un dispositivo: com'è e se risponde. */
  const impronta = (online: boolean, state: DeviceSnapshot['state']): string => JSON.stringify({ online, state });

  /** L'inventario intero come esce di qui, segnato come detto. */
  const tutti = (): DeviceSnapshot[] =>
    [...devices.values()].map((device) => {
      const detto = fuori(device);
      detti.set(detto.externalId, impronta(detto.online, detto.state));
      return detto;
    });

  const hello = (): HelloMessage => ({
    type: 'hello',
    protocol: PROTOCOL,
    name: config.name,
    version: VERSION,
    devices: tutti(),
  });

  const link = new Link(config, hello, (message) => void listen(message));
  let pending: NodeJS.Timeout | null = null;
  let rereading: NodeJS.Timeout | null = null;

  /** Un cambio d'inventario alla volta non si manda: se ne aspettano altri e si manda la lista. */
  const announceAll = (): void => {
    if (pending) return;
    pending = setTimeout(() => {
      pending = null;
      link.send({ type: 'devices', devices: tutti() });
    }, COALESCE_MS);
    pending.unref?.();
  };

  /**
   * Lo stato di adesso, detto a chi guarda, se è diverso dall'ultimo detto.
   * È la strada di ogni cambiamento: di quello che si aggiunge in uscita
   * (`fuori`) serve solo se risponde, e le capacità non si toccano.
   */
  const dillo = (device: DeviceSnapshot): void => {
    const online = vero(device);
    const adesso = impronta(online, device.state);
    if (detti.get(device.externalId) === adesso) return;
    detti.set(device.externalId, adesso);
    link.send({
      type: 'state',
      externalId: device.externalId,
      online,
      state: device.state,
      at: new Date().toISOString(),
    });
  };

  /**
   * Un pezzo di lavoro che, se sbaglia, non deve portarsi dietro il resto:
   * un evento che non si capisce non ferma quelli dopo, e un impulso che non
   * si impara non impedisce di dire lo stato. Si scrive nel registro, con
   * dove è successo.
   */
  const sicuro = (cosa: string, fatto: () => void): void => {
    try {
      fatto();
    } catch (error) {
      console.error(`non riesco a seguire ${cosa} (${error instanceof Error ? (error.stack ?? error.message) : String(error)})`);
    }
  };

  /**
   * Si rifà il pieno: chi è un dispositivo vero, e com'è messo adesso. Si
   * chiama a ogni riconnessione — HA è la verità, noi ne teniamo una copia —
   * e ogni volta che l'anagrafe cambia, cioè quando aggiungi un'integrazione.
   *
   * Un giro alla volta: se ne viene chiesto un altro mentre il primo è in
   * corso, si rifà appena finito, una volta sola.
   */
  let giro: Promise<void> | null = null;
  let ancora = false;
  const refill = (): Promise<void> => {
    if (giro) {
      ancora = true;
      return giro;
    }
    giro = (async () => {
      try {
        do {
          ancora = false;
          await unGiro();
        } while (ancora);
      } finally {
        giro = null;
      }
    })();
    return giro;
  };

  async function unGiro(): Promise<void> {
    arrivati = new Map();
    try {
      // l'anagrafe si legge una volta sola, e da lì si ricava tutto quello che serve
      const registri = await ha.registri();
      const anagrafe = HomeAssistant.anagrafe(registri);
      const integrazioni = new Set([...anagrafe.map((voce) => voce.platform), ...anagrafe.map((voce) => domainOf(voce.entityId))]);
      const [lista, tradotte, unita] = await Promise.all([
        ha.states(),
        ha.traduzioni([...integrazioni]),
        ha.gradi().catch(() => undefined),
      ]);

      // da qui in giù niente attese: le mappe nuove prendono il posto delle vecchie in un colpo solo
      const nuovi = fotografia(lista, arrivati);
      impostaGradi(unita);
      impostaTraduzioni(tradotte);
      soloQueste(new Set(anagrafe.map((voce) => voce.entityId)));
      nati = HomeAssistant.nati(registri);
      voci = new Map(anagrafe.map((voce) => [voce.entityId, voce]));
      senzaStato = new Set(anagrafe.filter((voce) => !nuovi.has(voce.entityId)).map((voce) => voce.entityId));
      /*
       * Un'entità che l'anagrafe conosce ma che adesso non ha uno stato — la
       * centrale appena ripartita, un'integrazione che non ha ancora letto
       * i suoi apparecchi — non è sparita. L'inventario che si manda è
       * completo, e il server segna sparito chi non c'è, con le sue scene e
       * i suoi avvisi. Se se ne conosce la forma resta, irraggiungibile e
       * con la forma di prima, finché non arriva il suo stato.
       */
      for (const id of senzaStato) {
        const voce = voci.get(id);
        if (!voce || !formaNota(id)) continue;
        const nome = voce.name || [voce.deviceName, voce.originalName].filter(Boolean).join(' ') || id;
        nuovi.set(id, { entity_id: id, state: 'unavailable', attributes: { friendly_name: nome } });
      }
      stati = nuovi;
      gruppi = new Map(raggruppa(anagrafe, stati).map((gruppo) => [gruppo.primaria, gruppo]));
      dentroA = new Map([...gruppi.values()].flatMap((gruppo) => gruppo.accessori.map((id) => [id, gruppo.primaria] as const)));

      /** Quante schede fa ogni dispositivo vero: serve a decidere come chiamarle. */
      const quante = new Map<string, number>();
      for (const gruppo of gruppi.values()) quante.set(gruppo.nome, (quante.get(gruppo.nome) ?? 0) + 1);

      devices.clear();
      for (const gruppo of gruppi.values()) {
        const device = componi(gruppo, stati, voci);
        if (!device) continue;
        // Home Assistant chiama un'entità «<dispositivo> <cosa fa>»: "Persiane
        // Curtain", "Luce salotto Switch". Quando il dispositivo fa una scheda
        // sola, il nome giusto è il suo — è come lo chiami tu. Con più schede i
        // nomi lunghi servono a distinguerle, e restano.
        const nome = gruppo.nome && quante.get(gruppo.nome) === 1 && device.name.startsWith(gruppo.nome) ? gruppo.nome : device.name;
        devices.set(device.externalId, { ...device, name: nome });
      }
      /*
       * Quello che si ricorda per dispositivo e per entità vale finché c'è
       * il dispositivo, o finché serve: l'ultimo stato detto di uno che non
       * c'è più, e uno spegnimento nostro più vecchio di un impulso, non
       * servono a nessuno, e senza toglierli crescerebbero per sempre.
       */
      for (const id of detti.keys()) if (!devices.has(id)) detti.delete(id);
      const scaduto = Date.now() - IMPULSO_MAX_MS;
      for (const [id, quando] of spenti) if (quando <= scaduto) spenti.delete(id);
    } finally {
      arrivati = null;
    }

    await distinte();
    // l'indirizzo di una telecamera può essere cambiato mentre non guardavamo
    forgetDoors();

    console.log(`${devices.size} dispositivi da home assistant`);
    announceAll();
    raccontaAccount();
    // le telecamere dopo: l'inventario non aspetta che rispondano tutte
    void bussa().catch((error: unknown) => console.warn(`giro delle telecamere: ${(error as Error).message}`));
  }

  /** Il giro si rifà fra poco: le richieste che arrivano a raffica diventano un giro solo. */
  const rileggi = (): void => {
    if (rereading) clearTimeout(rereading);
    rereading = setTimeout(() => {
      rereading = null;
      void refill().catch((error: unknown) => console.warn(`non riesco a leggere home assistant: ${(error as Error).message}`));
    }, COALESCE_MS);
    rereading.unref?.();
  };

  /**
   * Telecamere con lo stesso nome: si aggiunge il canale.
   *
   * Un registratore con quattro obiettivi risponde a un indirizzo solo, e
   * Home Assistant le chiama tutte e quattro come lui: in elenco diventano
   * quattro righe identiche, e scegliere «quella giusta» e' un indovinello.
   * Quello che le distingue e' il canale — `/video1`, `/video2` — che poi e'
   * esattamente quello che la persona ha scritto per collegarle.
   *
   * Solo quando il nome e' davvero in comune: una telecamera che qualcuno ha
   * gia' chiamato «Cancello» ha il nome migliore che potesse avere, e
   * rifarlo a partire da un indirizzo IP sarebbe un passo indietro.
   */
  async function distinte(): Promise<void> {
    const occhi = [...devices.values()].filter(occhio);

    const quanti = new Map<string, number>();
    for (const one of occhi) quanti.set(one.name, (quanti.get(one.name) ?? 0) + 1);

    await Promise.all(
      occhi
        .filter((one) => (quanti.get(one.name) ?? 0) > 1)
        .map(async (one) => {
          const canale = await channelOf(one.externalId);
          // si riprende com'è adesso: mentre si chiedeva il canale lo stato può essere cambiato
          const ora = devices.get(one.externalId);
          if (canale && ora) devices.set(one.externalId, { ...ora, name: canale });
        }),
    );
  }

  /**
   * Se un dispositivo è una telecamera: lo dice la sua forma, che ha
   * un'immagine. Il nome del dominio non conta, così un'integrazione che ne
   * porta una in un altro modo è una telecamera anche lei.
   */
  const occhio = (device: DeviceSnapshot): boolean => device.capabilities.some((capability: Capability) => capability.kind === 'image');

  /** Le telecamere, che sono le uniche a cui si bussa. */
  const occhi = (): string[] => [...devices.values()].filter(occhio).map((device) => device.externalId);

  /**
   * Quello che dice il registratore, scritto sopra a quello che dice Home
   * Assistant.
   *
   * Lui non va a bussare: una telecamera generica resta `idle` anche quando
   * il registratore è staccato dalla rete, e da qui usciva verde. Il pallino
   * di una telecamera deve dire una cosa sola — l'immagine arriva o no —
   * perché è quella la domanda di chi lo guarda.
   */
  const vero = (device: DeviceSnapshot): boolean => {
    if (!occhio(device)) return device.online;
    const visto = lastSeen(device.externalId);
    // non sapere non è sapere di no: senza risposta si lascia dire a lui
    return visto === undefined ? device.online : device.online && visto;
  };

  /**
   * Quello che si è appena scoperto chiedendo un'immagine.
   *
   * È la prova più forte che ci sia e arriva gratis: se il fotogramma non
   * viene, quella telecamera non c'è, e non c'è bisogno di aspettare il giro
   * del minuto per dirlo a chi sta guardando lo schermo.
   */
  const visto = (externalId: string, ok: boolean): void => {
    if (!noticed(externalId, ok)) return;
    const device = devices.get(externalId);
    if (device) dillo(device);
  };

  /**
   * Un giro su tutte le telecamere insieme, dopo aver raccontato
   * l'inventario: quella che risponde diversamente da prima lo dice da sé.
   */
  const bussa = async (): Promise<void> => {
    await Promise.all(
      occhi().map(async (externalId) => {
        const prima = lastSeen(externalId);
        const adesso = await guardala(externalId);
        const device = devices.get(externalId);
        if (adesso !== undefined && adesso !== prima && device) dillo(device);
      }),
    );
  };

  /**
   * Un dispositivo rifatto dallo stato di adesso delle sue entità, e detto:
   * con la lista intera se è cambiato quello che sa fare, se no con lo
   * stato soltanto, che è la via stretta, quella di tutto il giorno.
   *
   * È la strada di ogni cambiamento, quindi costa poco: la forma
   * dell'entità cambiata si confronta con quella ricordata
   * (connector/src/forme.ts), e se è la stessa si rifanno solo i valori.
   * Il dispositivo intero si ricompone solo quando è cambiata la forma.
   */
  const ricomponi = (primaria: string, cambiata?: string): void => {
    const gruppo = gruppi.get(primaria);
    const known = devices.get(primaria);
    if (!gruppo) return;

    const entity = cambiata ? stati.get(cambiata) : undefined;
    const forma = entity ? formaDi(entity, voci.get(entity.entity_id)).cambiata : false;
    if (known && !forma) {
      const adesso = statoGruppo(gruppo, stati, known.capabilities);
      if (!adesso) return;
      const device = { ...known, ...adesso };
      devices.set(primaria, device);
      dillo(device);
      return;
    }

    const fresh = componi(gruppo, stati, voci);
    if (!fresh) return;
    // il nome accorciato non si perde a ogni cambio di stato: quello buono
    // lo ha deciso l'ultimo giro d'inventario, questo porta solo i valori
    const device = { ...fresh, name: known?.name ?? fresh.name };
    devices.set(device.externalId, device);

    const shape = !known || !uguali(known.capabilities, device.capabilities) || !uguali(known.absorbs ?? [], device.absorbs ?? []);
    if (shape) announceAll();
    else dillo(device);
  };

  /**
   * Un evento nuovo mentre il precedente sta ancora parlando.
   *
   * Due pressioni uguali a un secondo di distanza direbbero la stessa parola
   * due volte, e per chi guarda i passaggi sarebbe una sola. Prima di dire la
   * seconda si torna muti un attimo: così ognuna è un passaggio suo, e fa
   * partire la sua scena.
   */
  const zittisci = (primaria: string, entity: HaEntity, prima: HaEntity | null): void => {
    if (!prima || prima.state === entity.state) return;
    const code = primaria === entity.entity_id ? 'value' : `${entity.entity_id}#value`;
    const known = devices.get(primaria);
    if (!known?.state[code]) return;
    dillo({ ...known, state: { ...known.state, [code]: '' } });
  };

  /**
   * Quello che un cambiamento insegna sugli impulsi, e il controllo che un
   * interruttore a impulso acceso torni davvero spento: se resta acceso a
   * lungo, non lo è più.
   */
  const impara = (entity: HaEntity, prima: HaEntity | null): void => {
    const id = entity.entity_id;
    const nostro = (spenti.get(id) ?? 0) > Date.now() - IMPULSO_MAX_MS;
    // uno spegnimento nostro vale per il primo spento che arriva, e poi non serve più
    if (entity.state === 'off') spenti.delete(id);
    if (impulsi.applica(id, osserva(prima, entity, nostro))) announceAll();

    if (entity.state !== 'on' || prima?.state === 'on' || impulsi.get(id) === undefined) return;
    const da = entity.last_changed;
    const controllo = setTimeout(
      () =>
        sicuro(`l'impulso di ${id}`, () => {
          const ora = stati.get(id);
          if (ora?.state === 'on' && ora.last_changed === da && impulsi.applica(id, { dimentica: true })) announceAll();
        }),
      LUNGO_MS,
    );
    controllo.unref?.();
  };

  const ha = new HomeAssistant(
    config,
    () => void refill().catch((error: unknown) => console.warn(`non riesco a leggere home assistant: ${(error as Error).message}`)),
    (entity, prima) => {
      const id = entity.entity_id;
      arrivati?.set(id, entity);
      stati.set(id, entity);
      arrivato(entity);
      sicuro(`gli impulsi di ${id}`, () => impara(entity, prima));

      // un'entità che al giro non aveva stato adesso ce l'ha: il giro si rifà, e lei entra
      if (senzaStato.delete(id)) rileggi();

      // una lettura o un'impostazione cambia il dispositivo che la tiene dentro
      const primaria = dentroA.get(id) ?? id;
      if (!gruppi.has(primaria)) return;

      /*
       * Un evento dice la sua parola per poco, e poi deve tornare muto: se
       * no il secondo squillo, uguale al primo, non sarebbe un passaggio.
       * Si ricompone quel dispositivo appena passato quel poco.
       */
      if (dominioDi(id)?.evento) {
        zittisci(primaria, entity, prima);
        const zitto = setTimeout(() => sicuro(`il ritorno muto di ${id}`, () => ricomponi(primaria)), EVENTO_MS + 200);
        zitto.unref?.();
      }
      ricomponi(primaria, id);
    },
    // L'anagrafe è cambiata: qualcuno ha aggiunto Tuya, o staccato una presa.
    // Arriva una raffica di eventi, uno per entità: si aspetta che finisca.
    rileggi,
    () => {
      // HA è caduto: i dispositivi non sono spenti, sono irraggiungibili. Dirlo
      // è meglio che lasciare l'interfaccia a mostrare uno stato di mezz'ora fa.
      for (const [id, device] of devices) devices.set(id, { ...device, online: false });
      announceAll();
    },
  );

  /**
   * Cosa è collegato: tutto quello che viene dal catalogo, non solo le tre
   * marche che hanno una voce nel registro. Se il catalogo non risponde,
   * almeno quelle.
   */
  const collegati = async () => {
    const catalogo = await ha.catalogo().catch(() => []);
    const collegabili = new Set([...catalogo.map((voce) => voce.handler), ...Object.keys(PROVIDERS)]);
    const nomeDi = (handler: string): string | undefined =>
      PROVIDERS[handler as keyof typeof PROVIDERS]?.label ?? catalogo.find((voce) => voce.handler === handler)?.name;
    /*
     * E ogni collegamento da cui viene almeno un dispositivo dell'app, anche
     * se non è nel catalogo. La centrale ne aggiunge qualcuno da sola — Google
     * Cast, quando trova un apparecchio Google in rete — e un dispositivo che
     * si vede deve far vedere anche da dove viene, e come si stacca.
     */
    const origini = await born();
    const nostri = new Set([...devices.keys(), ...dentroA.keys()]);
    const conDispositivi = new Set([...origini].filter(([entita]) => nostri.has(entita)).map(([, collegamento]) => collegamento));
    const elenco = await titled(await listLinked(config, collegabili, conDispositivi), origini, haImmagine);
    return elenco.map((one) => {
      const name = nomeDi(one.handler);
      return name ? { ...one, name } : one;
    });
  };

  /**
   * Collegare un account: una conversazione a più battute, e ogni battuta
   * torna indietro con la risposta attaccata all'`ack`. Gli errori non si
   * nascondono — chi sta guardando il QR deve sapere se è scaduto.
   */
  const pair = async (message: PairMessage): Promise<void> => {
    try {
      if (message.action === 'cancel') {
        if (message.flowId) await cancelPairing(config, message.flowId);
        link.send({ type: 'ack', reqId: message.reqId, ok: true });
        return;
      }

      if (message.action === 'catalog') {
        link.send({ type: 'ack', reqId: message.reqId, ok: true, data: await ha.catalogo() });
        return;
      }

      if (message.action === 'list') {
        link.send({ type: 'ack', reqId: message.reqId, ok: true, data: await collegati() });
        return;
      }

      if (message.action === 'unlink') {
        await unlink(config, message.entryId ?? '');
        link.send({ type: 'ack', reqId: message.reqId, ok: true, data: await collegati() });
        return;
      }

      const grezzo =
        message.action === 'start'
          ? // con una conversazione già aperta si riprende quella: il rientro in un account scaduto
            message.flowId
            ? await resumePairing(config, message.flowId)
            : await startPairing(config, message.handler)
          : await submitPairing(config, message.flowId ?? '', message.input ?? {});
      // i campi con il loro nome italiano, quando la centrale lo sa
      const step = await conNomi(grezzo, (integrazione) => ha.traduzioniCollegamento(integrazione));

      link.send({ type: 'ack', reqId: message.reqId, ok: true, data: step });
    } catch (error) {
      link.send({ type: 'ack', reqId: message.reqId, ok: false, error: (error as Error).message });
    }
  };

  /** Da quale collegamento viene ogni entità: quella dell'ultimo giro, o chiesta adesso se un giro non c'è ancora stato. */
  const born = async (): Promise<Map<string, string>> =>
    nati.size ? nati : ha.registri().then(HomeAssistant.nati, () => new Map<string, string>());

  /** Quello che scende dal filo: un comando, o una battuta di accoppiamento. */
  const listen = (message: BackendMessage): void => {
    if (message.type === 'pair') void pair(message);
    else if (message.type === 'command') void obey(message);
    else if (message.type === 'snapshot') void watch(message);
    else if (message.type === 'watch') void guarda(message);
    else if (message.type === 'unwatch') void smetti(message);
  };

  /**
   * Un fotogramma chiesto da chi sta guardando. Torna in base64 dentro
   * all'`ack`: il filo parla JSON, e un JPEG di là ci passa così.
   */
  const watch = async (ask: SnapshotMessage): Promise<void> => {
    const fail = (error: string): void => void link.send({ type: 'ack', reqId: ask.reqId, ok: false, error });

    if (!devices.has(ask.externalId)) return fail('telecamera sconosciuta per questo agente');
    if (!ha.connected) return fail('il servizio in casa non è raggiungibile');

    try {
      const jpeg = await ha.snapshot(ask.externalId);
      visto(ask.externalId, true);
      link.send({
        type: 'ack',
        reqId: ask.reqId,
        ok: true,
        data: { jpeg: jpeg.toString('base64'), at: new Date().toISOString() },
      });
    } catch (error) {
      // Nel registro della macchina, che e' l'unico posto dove si puo'
      // guardare: una telecamera che non manda niente ha sempre un motivo, e
      // di la' arriva solo la frase corta.
      console.warn(`fotogramma da ${ask.externalId}: ${(error as Error).message}`);
      visto(ask.externalId, false);
      fail((error as Error).message);
    }
  };

  /**
   * Qualcuno ha aperto una telecamera: si apre il flusso e si comincia a
   * spingere. La risposta qui e' solo «ho capito» — i fotogrammi vanno per
   * la loro strada.
   */
  const guarda = async (ask: WatchMessage): Promise<void> => {
    const fail = (error: string): void => void link.send({ type: 'ack', reqId: ask.reqId, ok: false, error });

    if (!devices.has(ask.externalId)) return fail('telecamera sconosciuta per questo agente');
    if (!ha.connected) return fail('il servizio in casa non è raggiungibile');

    try {
      await look(config, ask.session, ask.externalId, ask.fps);
      link.send({ type: 'ack', reqId: ask.reqId, ok: true });
    } catch (error) {
      console.warn(`diretta di ${ask.externalId}: ${(error as Error).message}`);
      fail((error as Error).message);
    }
  };

  /** Non guarda piu' nessuno: si chiude, e la macchina torna a respirare. */
  const smetti = async (ask: UnwatchMessage): Promise<void> => {
    blind(ask.session);
    link.send({ type: 'ack', reqId: ask.reqId, ok: true });
  };

  const obey = async (command: CommandMessage): Promise<void> => {
    const fail = (error: string): void => void link.send({ type: 'ack', reqId: command.reqId, ok: false, error });

    if (!devices.has(command.externalId)) return fail('dispositivo sconosciuto per questo agente');
    if (!ha.connected) return fail('il servizio in casa non è raggiungibile');

    // un comando a una capacità che sta dentro va alla sua entità, e solo se è davvero di questo dispositivo
    const bersaglio = targetOf(command.externalId, command.code);
    if (bersaglio !== command.externalId && !gruppi.get(command.externalId)?.accessori.includes(bersaglio)) {
      return fail(`"${command.code}" non è una cosa che questo dispositivo sa fare`);
    }
    const call = toServiceCall(command.externalId, command.code, command.value, stati.get(bersaglio));
    if (!call) return fail(`"${command.code}" non è una cosa che questo dispositivo sa fare`);
    if ('manca' in call) return fail(call.manca);
    // un valore che tiene l'agente: si ricorda, e si dice com'è adesso
    if ('preferenza' in call) {
      ricordaPreferenza(bersaglio, call.preferenza);
      link.send({ type: 'ack', reqId: command.reqId, ok: true });
      ricomponi(command.externalId);
      return;
    }
    // uno spegnimento chiesto da noi non va scambiato per un impulso
    const spegne = call.service === 'turn_off';
    if (spegne) spenti.set(bersaglio, Date.now());

    try {
      await ha.callService(call.domain, call.service, bersaglio, call.data);
      link.send({ type: 'ack', reqId: command.reqId, ok: true });
    } catch (error) {
      // un comando che non è andato non ha spento niente: lo spegnimento che viene dopo non è nostro
      if (spegne) spenti.delete(bersaglio);
      fail((error as Error).message);
    }
  };

  /*
   * Come stanno gli account, detto al backend da sé: dopo ogni giro
   * d'inventario e ogni cinque minuti. Un account scaduto si scopre così
   * anche quando nessuno ha la finestra aperta, e arriva l'avviso.
   */
  const raccontaAccount = (): void => {
    if (!ha.connected) return;
    void collegati()
      .then((accounts) => link.send({ type: 'accounts', accounts }))
      .catch(() => undefined);
  };
  const giroAccount = setInterval(raccontaAccount, 5 * 60_000);
  giroAccount.unref?.();

  ha.start();
  link.start();
  console.log(`place-index connector ${VERSION} — "${config.name}"`);

  const shutdown = (): void => {
    console.log('chiusura');
    ha.close();
    link.close();
    process.exit(0);
  };

  /*
   * E qualcuno bussa alle telecamere ogni minuto.
   *
   * Senza, il pallino direbbe la verità solo a chi sta guardando: un
   * registratore staccato mentre nessuno guarda resterebbe verde fino alla
   * prossima immagine chiesta — cioè, di notte, fino al mattino. E l'avviso
   * «dimmi se smette di rispondere» aspetta proprio quel momento lì.
   */
  watchEyes(occhi, (externalId, up) => {
    const device = devices.get(externalId);
    if (!device) return;
    console.log(`${externalId}: ${up ? "l'immagine arriva di nuovo" : 'non manda immagini'}`);
    dillo(device);
  });

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

/*
 * Una promessa rifiutata che nessuno aspettava non deve spegnere l'agente:
 * in casa non c'è nessuno a riaccenderlo, e un errore in un pezzo solo —
 * una telecamera, una traduzione — lascerebbe al buio tutto il resto. Si
 * scrive nel registro, dove chi cerca il guasto lo trova, e si va avanti.
 */
process.on('unhandledRejection', (reason: unknown) => {
  console.error(`errore non gestito: ${reason instanceof Error ? (reason.stack ?? reason.message) : String(reason)}`);
});

/*
 * Un'eccezione che arriva fin qui invece si scrive e si esce. Le strade che
 * conosciamo — un cambiamento dalla centrale, un evento che torna muto, un
 * impulso — sono già protette una per una e vanno avanti da sole; quello
 * che arriva qui è successo in un posto che non sappiamo, magari a metà di
 * un giro, con le mappe mezze vecchie e mezze nuove. Un agente che va avanti
 * così racconta cose false senza che nessuno se ne accorga; uno che esce
 * riparte da solo (il container ha `restart: unless-stopped`), rilegge tutto
 * dalla centrale in pochi secondi, e ritrova forme, impulsi e preferenze nei
 * suoi file.
 */
process.on('uncaughtException', (error: Error) => {
  console.error(`errore non previsto, l'agente riparte da capo (${error.stack ?? error.message})`);
  process.exit(1);
});

main().catch((error: unknown) => {
  if (error instanceof ConfigError) {
    console.error(`configurazione: ${error.message}`);
    process.exit(78); // EX_CONFIG: non c'è motivo che systemd riprovi all'infinito
  }
  // Tutto il resto — home assistant che non parte, il benvenuto che va storto —
  // merita di riprovare: il container riparte da solo.
  console.error((error as Error).message);
  process.exit(1);
});
