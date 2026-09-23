import type { DeviceValue } from '../../../shared/protocol.js';
import type { DeviceView } from '../dto/views.js';
import { toDeviceView } from '../dto/views.js';
import { badGateway, notFound } from '../errors/HttpError.js';
import { hub } from '../iot/hub.js';
import { deviceManager } from '../managers/DeviceManager.js';
import type { Device } from '../types.js';

/** Una telecamera si riconosce da questo: non si comanda, si guarda. */
const isCamera = (device: { capabilities: { kind: string }[] }): boolean =>
  device.capabilities.some((entry) => entry.kind === 'image');

export class DeviceService {
  /**
   * `guest` vuol dire che chi chiede sta lavorando nelle mappe di un altro.
   *
   * A un ospite le telecamere non si mostrano. Chi ha la chiave di una mappa
   * può accendere le luci di quell'agente, e va bene; ma una telecamera non è
   * una lampadina, e guardare dentro casa di qualcuno è un'altra cosa. Si
   * parte stretti: allargare dopo è facile, stringere dopo che qualcuno ha
   * già guardato no.
   */
  async list(ownerId: string, guest = false): Promise<DeviceView[]> {
    const devices = await deviceManager.list(ownerId);
    const visti = guest ? devices.filter((device) => !isCamera(device)) : devices;
    return visti.map((device) => toDeviceView(device, hub.liveOf(device.agentId, device.externalId)));
  }

  /** Accende o spegne l'avviso su un dispositivo, e lo dice a chi guarda. */
  async watch(ownerId: string, id: string, wanted: boolean): Promise<DeviceView> {
    const device = await deviceManager.watch(ownerId, id, wanted);
    hub.changed(ownerId, { kind: 'devices' });
    return toDeviceView(device, hub.liveOf(device.agentId, device.externalId));
  }

  /**
   * Un fotogramma. Come per un comando, un agente che non risponde è un
   * guasto fra noi e lui, non una richiesta sbagliata.
   */
  async frame(ownerId: string, id: string, guest = false): Promise<Buffer> {
    if (guest) throw notFound('dispositivo inesistente');

    try {
      return await deviceManager.frame(ownerId, id);
    } catch (error) {
      if (error instanceof Error && !('status' in error)) throw badGateway(error.message);
      throw error;
    }
  }

  /**
   * La telecamera da guardare in diretta.
   *
   * Stesse regole del fotogramma singolo: un ospite non sa nemmeno che esista.
   * Cambia solo che qui non torna un'immagine ma chi la sa mandare.
   */
  async watchable(ownerId: string, id: string, guest = false): Promise<Device> {
    if (guest) throw notFound('dispositivo inesistente');
    return deviceManager.camera(ownerId, id);
  }

  /**
   * Un agente che non risponde non è una richiesta sbagliata: è un guasto fra
   * noi e lui. Il 502 lo dice, e l'interfaccia può scrivere "non risponde"
   * invece di fingere che la luce si sia accesa.
   */
  async command(
    ownerId: string,
    id: string,
    code: string,
    value: DeviceValue,
    who?: string,
  ): Promise<void> {
    try {
      await deviceManager.command(ownerId, id, code, value, who);
    } catch (error) {
      if (error instanceof Error && !('status' in error)) throw badGateway(error.message);
      throw error;
    }
  }
}

export const deviceService = new DeviceService();
