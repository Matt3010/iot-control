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
import { toServiceCall, translate } from './entities.js';
import { HomeAssistant } from './homeassistant.js';
import { Link, PROTOCOL } from './link.js';
import { blind, look } from './live.js';
import { ensureToken } from './onboarding.js';
import { cancelPairing, listLinked, startPairing, submitPairing, titled, unlink } from './pairing.js';

const VERSION = '1.6.1';
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
  let real = new Map<string, { deviceId: string; deviceName: string }>();

  const hello = (): HelloMessage => ({
    type: 'hello',
    protocol: PROTOCOL,
    name: config.name,
    version: VERSION,
    devices: [...devices.values()],
  });

  const link = new Link(config, hello, (message) => void listen(message));
  let pending: NodeJS.Timeout | null = null;
  let rereading: NodeJS.Timeout | null = null;

  /** Un cambio d'inventario alla volta non si manda: se ne aspettano altri e si manda la lista. */
  const announceAll = (): void => {
    if (pending) return;
    pending = setTimeout(() => {
      pending = null;
      link.send({ type: 'devices', devices: [...devices.values()] });
    }, COALESCE_MS);
    pending.unref?.();
  };

  /**
   * Si rifà il pieno: chi è un dispositivo vero, e com'è messo adesso. Si
   * chiama a ogni riconnessione — HA è la verità, noi ne teniamo una copia —
   * e ogni volta che l'anagrafe cambia, cioè quando aggiungi un'integrazione.
   */
  async function refill(): Promise<void> {
    real = await ha.devices();
    const entities = await ha.states();

    devices.clear();
    /** Quante entità passa ogni dispositivo: serve a decidere come chiamarle. */
    const quante = new Map<string, number>();

    for (const entity of entities) {
      const known = real.get(entity.entity_id);
      if (!known) continue;
      const device = translate(entity);
      if (!device) continue;

      devices.set(device.externalId, device);
      quante.set(known.deviceId, (quante.get(known.deviceId) ?? 0) + 1);
    }

    // Home Assistant chiama un'entità «<dispositivo> <cosa fa>»: "Persiane
    // Curtain", "Luce salotto Switch". Quando di quel dispositivo passa una
    // cosa sola, il nome giusto è quello del dispositivo — è come lo chiami
    // tu. Con più entità i nomi lunghi servono a distinguerle, e restano.
    for (const [id, device] of devices) {
      const known = real.get(id);
      if (!known?.deviceName || quante.get(known.deviceId) !== 1) continue;
      if (device.name.startsWith(known.deviceName)) {
        devices.set(id, { ...device, name: known.deviceName });
      }
    }

    console.log(`${devices.size} dispositivi da home assistant`);
    announceAll();
  }

  const ha = new HomeAssistant(
    config,
    () => void refill().catch((error: unknown) => console.warn(`non riesco a leggere home assistant: ${(error as Error).message}`)),
    (entity) => {
      if (!real.has(entity.entity_id)) return;
      const fresh = translate(entity);
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
      else link.send({ type: 'state', externalId: device.externalId, online: device.online, state: device.state, at: new Date().toISOString() });
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

      if (message.action === 'list') {
        link.send({ type: 'ack', reqId: message.reqId, ok: true, data: await titled(await listLinked(config), await born()) });
        return;
      }

      if (message.action === 'unlink') {
        await unlink(config, message.entryId ?? '');
        link.send({ type: 'ack', reqId: message.reqId, ok: true, data: await titled(await listLinked(config), await born()) });
        return;
      }

      const step =
        message.action === 'start'
          ? await startPairing(config, message.handler ?? 'tuya')
          : await submitPairing(config, message.flowId ?? '', message.input ?? {});

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

    const call = toServiceCall(command.externalId, command.code, command.value);
    if (!call) return fail(`"${command.code}" non è una cosa che questo dispositivo sa fare`);

    try {
      await ha.callService(call.domain, call.service, command.externalId, call.data);
      link.send({ type: 'ack', reqId: command.reqId, ok: true });
    } catch (error) {
      fail((error as Error).message);
    }
  };

  ha.start();
  link.start();
  console.log(`place-index connector ${VERSION} — "${config.name}"`);

  const shutdown = (): void => {
    console.log('chiusura');
    ha.close();
    link.close();
    process.exit(0);
  };

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
