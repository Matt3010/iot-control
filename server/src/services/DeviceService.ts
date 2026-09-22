import type { DeviceValue } from '../../../shared/protocol.js';
import type { DeviceView } from '../dto/views.js';
import { toDeviceView } from '../dto/views.js';
import { badGateway } from '../errors/HttpError.js';
import { hub } from '../iot/hub.js';
import { deviceManager } from '../managers/DeviceManager.js';

export class DeviceService {
  async list(ownerId: string): Promise<DeviceView[]> {
    const devices = await deviceManager.list(ownerId);
    return devices.map((device) => toDeviceView(device, hub.liveOf(device.agentId, device.externalId)));
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
