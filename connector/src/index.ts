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
import { ConfigError, loadConfig } from './config.js';
import { targetOf, toServiceCall } from './entities.js';
import { componi, raggruppa, type Gruppo } from './gruppi.js';
import { forgetDoors, lastSeen, look as guardala, noticed, watchEyes } from './eyes.js';
import { channelOf } from './go2rtc.js';
import { HomeAssistant, type HaEntity, type Voce } from './homeassistant.js';
import { Link, PROTOCOL } from './link.js';
import { blind, look } from './live.js';
import { leggiImpulsi } from './impulsi.js';
import { lettoriImpulsi, PROVIDERS } from './providers.js';
import { ensureToken } from './onboarding.js';
import { cancelPairing, conNomi, listLinked, startPairing, submitPairing, titled, unlink } from './pairing.js';

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
  /** La fotografia di adesso. Al riavvio la si rifà chiedendola ad HA, che la sa. */
  const devices = new Map<string, DeviceSnapshot>();
  /**
   * Quali entità sono davvero dei dispositivi. Si rilegge a ogni connessione e
   * ogni volta che l'anagrafe di HA cambia — è così che i dispositivi Tuya
   * compaiono appena aggiungi l'integrazione, senza riavviare niente.
   */
  /**
   * Come stanno insieme le entità (connector/src/gruppi.ts): il gruppo di
   * ogni dispositivo, l'ultimo stato di ogni entità, e di quale dispositivo
   * è ogni entità che sta dentro a un altro. Si rifà a ogni giro d'inventario;
   * in mezzo cambiano solo gli stati.
   */
  let gruppi = new Map<string, Gruppo>();
  let dentroA = new Map<string, string>();
  let voci = new Map<string, Voce>();
  let traduzioni: Record<string, string> = {};
  const stati = new Map<string, HaEntity>();
  /** Gli interruttori a impulso, e per quanti millisecondi. Lo dice il provider. */
  let impulsi = new Map<string, number>();

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
      online: vero(device.externalId, device.online),
      // a impulso lo sa il provider e non Home Assistant: si aggiunge qui,
      // come quello che si sa in più delle telecamere
      ...(pulse
        ? {
            capabilities: device.capabilities.map((capability) =>
              capability.kind === 'switch' && capability.code === 'power' ? { ...capability, pulse } : capability,
            ),
          }
        : {}),
    };
  };

  const hello = (): HelloMessage => ({
    type: 'hello',
    protocol: PROTOCOL,
    name: config.name,
    version: VERSION,
    devices: [...devices.values()].map(fuori),
  });

  const link = new Link(config, hello, (message) => void listen(message));
  let pending: NodeJS.Timeout | null = null;
  let rereading: NodeJS.Timeout | null = null;

  /** Un cambio d'inventario alla volta non si manda: se ne aspettano altri e si manda la lista. */
  const announceAll = (): void => {
    if (pending) return;
    pending = setTimeout(() => {
      pending = null;
      link.send({ type: 'devices', devices: [...devices.values()].map(fuori) });
    }, COALESCE_MS);
    pending.unref?.();
  };

  /**
   * Si rifà il pieno: chi è un dispositivo vero, e com'è messo adesso. Si
   * chiama a ogni riconnessione — HA è la verità, noi ne teniamo una copia —
   * e ogni volta che l'anagrafe cambia, cioè quando aggiungi un'integrazione.
   */
  async function refill(): Promise<void> {
    const anagrafe = await ha.anagrafe();
    impulsi = await leggiImpulsi(ha, lettoriImpulsi());
    stati.clear();
    for (const entity of await ha.states()) stati.set(entity.entity_id, entity);
    traduzioni = await ha.traduzioni([...new Set(anagrafe.map((voce) => voce.platform))]);

    voci = new Map(anagrafe.map((voce) => [voce.entityId, voce]));
    gruppi = new Map(raggruppa(anagrafe, stati).map((gruppo) => [gruppo.primaria, gruppo]));
    dentroA = new Map([...gruppi.values()].flatMap((gruppo) => gruppo.accessori.map((id) => [id, gruppo.primaria] as const)));

    devices.clear();
    /** Quante schede fa ogni dispositivo vero: serve a decidere come chiamarle. */
    const quante = new Map<string, number>();
    for (const gruppo of gruppi.values()) quante.set(gruppo.nome, (quante.get(gruppo.nome) ?? 0) + 1);

    for (const gruppo of gruppi.values()) {
      const device = componi(gruppo, stati, voci, traduzioni);
      if (!device) continue;
      // Home Assistant chiama un'entità «<dispositivo> <cosa fa>»: "Persiane
      // Curtain", "Luce salotto Switch". Quando il dispositivo fa una scheda
      // sola, il nome giusto è il suo — è come lo chiami tu. Con più schede i
      // nomi lunghi servono a distinguerle, e restano.
      const nome = gruppo.nome && quante.get(gruppo.nome) === 1 && device.name.startsWith(gruppo.nome) ? gruppo.nome : device.name;
      devices.set(device.externalId, { ...device, name: nome });
    }

    await distinte();
    // l'indirizzo di una telecamera può essere cambiato mentre non guardavamo
    forgetDoors();
    await bussa();

    console.log(`${devices.size} dispositivi da home assistant`);
    announceAll();
  }

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
    const occhi = [...devices.values()].filter((one) => one.externalId.startsWith('camera.'));

    const quanti = new Map<string, number>();
    for (const one of occhi) quanti.set(one.name, (quanti.get(one.name) ?? 0) + 1);

    await Promise.all(
      occhi
        .filter((one) => (quanti.get(one.name) ?? 0) > 1)
        .map(async (one) => {
          const canale = await channelOf(one.externalId);
          if (canale) devices.set(one.externalId, { ...one, name: canale });
        }),
    );
  }

  /** Le telecamere, che sono le uniche a cui si bussa. */
  const occhi = (): string[] =>
    [...devices.keys()].filter((externalId) => externalId.startsWith('camera.'));

  /**
   * Quello che dice il registratore, scritto sopra a quello che dice Home
   * Assistant.
   *
   * Lui non va a bussare: una telecamera generica resta `idle` anche quando
   * il registratore è staccato dalla rete, e da qui usciva verde. Il pallino
   * di una telecamera deve dire una cosa sola — l'immagine arriva o no —
   * perché è quella la domanda di chi lo guarda.
   */
  const vero = (externalId: string, online: boolean): boolean => {
    if (!externalId.startsWith('camera.')) return online;
    const visto = lastSeen(externalId);
    // non sapere non è sapere di no: senza risposta si lascia dire a lui
    return visto === undefined ? online : online && visto;
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

  /** Lo stato di adesso, detto a chi guarda. */
  const dillo = (device: DeviceSnapshot): void => {
    const detto = fuori(device);
    link.send({
      type: 'state',
      externalId: detto.externalId,
      online: detto.online,
      state: detto.state,
      at: new Date().toISOString(),
    });
  };

  /** Un giro su tutte le telecamere, prima di raccontare l'inventario. */
  const bussa = async (): Promise<void> => {
    for (const externalId of occhi()) await guardala(externalId);
  };

  const ha = new HomeAssistant(
    config,
    () => void refill().catch((error: unknown) => console.warn(`non riesco a leggere home assistant: ${(error as Error).message}`)),
    (entity) => {
      // una lettura o un'impostazione cambia il dispositivo che la tiene dentro
      const primaria = dentroA.get(entity.entity_id) ?? entity.entity_id;
      const gruppo = gruppi.get(primaria);
      if (!gruppo) return;
      stati.set(entity.entity_id, entity);
      const fresh = componi(gruppo, stati, voci, traduzioni);
      if (!fresh) return;

      const known = devices.get(fresh.externalId);
      // il nome accorciato non si perde a ogni cambio di stato: quello buono
      // lo ha deciso l'ultimo giro d'inventario, questo porta solo i valori
      const device = { ...fresh, name: known?.name ?? fresh.name };
      devices.set(device.externalId, device);

      // Se cambia solo quanto è accesa una luce non serve rimandare l'inventario:
      // basta dire il valore nuovo. È la via stretta, quella di tutto il giorno.
      const shape = !known || known.name !== device.name || JSON.stringify(known.capabilities) !== JSON.stringify(device.capabilities);
      if (shape) announceAll();
      else {
        const detto = fuori(device);
        link.send({ type: 'state', externalId: detto.externalId, online: detto.online, state: detto.state, at: new Date().toISOString() });
      }
    },
    () => {
      // L'anagrafe è cambiata: qualcuno ha aggiunto Tuya, o staccato una presa.
      // Arriva una raffica di eventi, uno per entità: si aspetta che finisca.
      if (rereading) clearTimeout(rereading);
      rereading = setTimeout(() => void refill().catch(() => undefined), COALESCE_MS);
      rereading.unref?.();
    },
    () => {
      // HA è caduto: i dispositivi non sono spenti, sono irraggiungibili. Dirlo
      // è meglio che lasciare l'interfaccia a mostrare uno stato di mezz'ora fa.
      for (const [id, device] of devices) devices.set(id, { ...device, online: false });
      link.send({ type: 'devices', devices: [...devices.values()] });
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
    return titled(await listLinked(config, collegabili), await born());
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
          ? await startPairing(config, message.handler)
          : await submitPairing(config, message.flowId ?? '', message.input ?? {});
      // i campi con il loro nome italiano, quando la centrale lo sa
      const step = await conNomi(grezzo, (integrazione) => ha.traduzioniCollegamento(integrazione));

      link.send({ type: 'ack', reqId: message.reqId, ok: true, data: step });
    } catch (error) {
      link.send({ type: 'ack', reqId: message.reqId, ok: false, error: (error as Error).message });
    }
  };

  /** Da quale collegamento viene ogni entità, se si riesce a saperlo. */
  const born = (): Promise<Map<string, string>> =>
    ha.entriesOf().catch(() => new Map<string, string>());

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
    const call = toServiceCall(command.externalId, command.code, command.value);
    if (!call) return fail(`"${command.code}" non è una cosa che questo dispositivo sa fare`);

    try {
      await ha.callService(call.domain, call.service, bersaglio, call.data);
      link.send({ type: 'ack', reqId: command.reqId, ok: true });
    } catch (error) {
      fail((error as Error).message);
    }
  };

  /*
   * L'impulso si cambia dall'app del provider, e Home Assistant non se ne
   * accorge: nessun evento dice che la durata è cambiata. Si rilegge ogni
   * dieci minuti, e si manda solo se è cambiato qualcosa.
   */
  const rileggi = setInterval(() => {
    if (!ha.connected) return;
    void leggiImpulsi(ha, lettoriImpulsi()).then((adesso) => {
      const prima = JSON.stringify([...impulsi].sort());
      if (JSON.stringify([...adesso].sort()) === prima) return;
      impulsi = adesso;
      announceAll();
    });
  }, 10 * 60_000);
  rileggi.unref?.();

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
