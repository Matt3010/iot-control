import type { CommandMessage, DeviceSnapshot, HelloMessage } from '../../shared/protocol.js';
import { ConfigError, loadConfig } from './config.js';
import { toServiceCall, translate } from './entities.js';
import { HomeAssistant } from './homeassistant.js';
import { Link, PROTOCOL } from './link.js';

const VERSION = '1.0.0';
/** All'avvio le entità arrivano a centinaia: si aspetta un attimo e si manda una lista sola. */
const COALESCE_MS = 500;

function main(): void {
  const config = loadConfig();
  /** La fotografia di adesso. Al riavvio la si rifà chiedendola ad HA, che la sa. */
  const devices = new Map<string, DeviceSnapshot>();

  const hello = (): HelloMessage => ({
    type: 'hello',
    protocol: PROTOCOL,
    name: config.name,
    version: VERSION,
    devices: [...devices.values()],
  });

  const link = new Link(config, hello, (command) => void obey(command));
  let pending: NodeJS.Timeout | null = null;

  /** Un cambio d'inventario alla volta non si manda: se ne aspettano altri e si manda la lista. */
  const announceAll = (): void => {
    if (pending) return;
    pending = setTimeout(() => {
      pending = null;
      link.send({ type: 'devices', devices: [...devices.values()] });
    }, COALESCE_MS);
    pending.unref?.();
  };

  const ha = new HomeAssistant(
    config,
    async () => {
      // Ogni riconnessione rifà il pieno: HA è la verità, noi ne teniamo una copia.
      const entities = await ha.states();
      devices.clear();
      for (const entity of entities) {
        const device = translate(entity);
        if (device) devices.set(device.externalId, device);
      }
      console.log(`${devices.size} dispositivi da home assistant`);
      announceAll();
    },
    (entity) => {
      const device = translate(entity);
      if (!device) return;

      const known = devices.get(device.externalId);
      devices.set(device.externalId, device);

      // Se cambia solo quanto è accesa una luce non serve rimandare l'inventario:
      // basta dire il valore nuovo. È la via stretta, quella di tutto il giorno.
      const shape = !known || known.name !== device.name || JSON.stringify(known.capabilities) !== JSON.stringify(device.capabilities);
      if (shape) announceAll();
      else link.send({ type: 'state', externalId: device.externalId, online: device.online, state: device.state, at: new Date().toISOString() });
    },
    () => {
      // HA è caduto: i dispositivi non sono spenti, sono irraggiungibili. Dirlo
      // è meglio che lasciare l'interfaccia a mostrare uno stato di mezz'ora fa.
      for (const [id, device] of devices) devices.set(id, { ...device, online: false });
      link.send({ type: 'devices', devices: [...devices.values()] });
    },
  );

  const obey = async (command: CommandMessage): Promise<void> => {
    const fail = (error: string): void => void link.send({ type: 'ack', reqId: command.reqId, ok: false, error });

    if (!devices.has(command.externalId)) return fail('dispositivo sconosciuto per questo agente');
    if (!ha.connected) return fail('home assistant non è raggiungibile');

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

try {
  main();
} catch (error) {
  if (error instanceof ConfigError) {
    console.error(`configurazione: ${error.message}`);
    process.exit(78); // EX_CONFIG: non c'è motivo che systemd riprovi all'infinito
  }
  throw error;
}
