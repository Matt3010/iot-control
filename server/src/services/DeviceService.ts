import type { DeviceValue } from '../../../shared/protocol.js';
import type { DeviceView } from '../dto/views.js';
import { toDeviceView } from '../dto/views.js';
import { badGateway } from '../errors/HttpError.js';
import { hub } from '../iot/hub.js';
import { deviceManager } from '../managers/DeviceManager.js';
import type { Device, Scope } from '../types.js';

export class DeviceService {
  /**
   * Quelli che questa richiesta vede. Da ospite restano fuori le
   * telecamere: chi ha la chiave di una mappa può accendere le luci di
   * quell'agente, e va bene, ma una telecamera non è una lampadina, e
   * guardare dentro casa di qualcuno è un'altra cosa. Lo decide il raggio
   * (`managers/raggio.ts`), come per tutto il resto.
   */
  async list(scope: Scope): Promise<DeviceView[]> {
    const devices = await deviceManager.list(scope);
    return devices.map((device) => toDeviceView(device, hub.liveOf(device.agentId, device.externalId)));
  }

  /** Accende o spegne l'avviso su un dispositivo, e lo dice a chi guarda. */
  async watch(scope: Scope, id: string, wanted: boolean): Promise<DeviceView> {
    const device = await deviceManager.watch(scope, id, wanted);
    hub.changed(scope.ownerId, { kind: 'devices' });
    return toDeviceView(device, hub.liveOf(device.agentId, device.externalId));
  }

  /**
   * Un fotogramma. Come per un comando, un agente che non risponde è un
   * guasto fra noi e lui, non una richiesta sbagliata.
   */
  async frame(scope: Scope, id: string): Promise<Buffer> {
    try {
      return await deviceManager.frame(scope, id);
    } catch (error) {
      if (error instanceof Error && !('status' in error)) throw badGateway(error.message);
      throw error;
    }
  }

  remove(scope: Scope, id: string): Promise<void> {
    return deviceManager.remove(scope, id);
  }

  /**
   * La telecamera da guardare in diretta. Stesse regole del fotogramma
   * singolo: cambia solo che qui non torna un'immagine ma chi la sa mandare.
   */
  async watchable(scope: Scope, id: string): Promise<Device> {
    return deviceManager.camera(scope, id);
  }

  /**
   * Un agente che non risponde non è una richiesta sbagliata: è un guasto fra
   * noi e lui. Il 502 lo dice, e l'interfaccia può scrivere "non risponde"
   * invece di fingere che la luce si sia accesa.
   */
  async command(
    scope: Scope,
    id: string,
    code: string,
    value: DeviceValue,
    who?: string,
  ): Promise<void> {
    try {
      await deviceManager.command(scope, id, code, value, who);
    } catch (error) {
      if (error instanceof Error && !('status' in error)) throw badGateway(error.message);
      throw error;
    }
  }
}

export const deviceService = new DeviceService();
