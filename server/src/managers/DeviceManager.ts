import type { DeviceSnapshot } from '../../../shared/protocol.js';
import { badRequest, notFound } from '../errors/HttpError.js';
import { hub } from '../iot/hub.js';
import { store } from '../persistence/JsonStore.js';
import { DeviceRepository } from '../repositories/DeviceRepository.js';
import type { Device } from '../types.js';

export class DeviceManager {
  list(ownerId: string): Promise<Device[]> {
    return store.transaction((tx) => new DeviceRepository(tx).findAllOf(ownerId));
  }

  find(ownerId: string, id: string): Promise<Device> {
    return store.transaction((tx) => {
      const device = new DeviceRepository(tx).findById(id);
      if (!device || device.ownerId !== ownerId) throw notFound('dispositivo inesistente');
      return device;
    });
  }

  /**
   * Quello che un agente racconta di sé, che è tutto quello che ha: l'elenco è
   * completo, quindi chi non c'è dentro non c'è più. Un dispositivo solo spento
   * resta nell'elenco — è l'agente a dire che non lo raggiunge — e quindi non
   * viene toccato.
   */
  async sync(ownerId: string, agentId: string, snapshots: DeviceSnapshot[]): Promise<Device[]> {
    const { devices, gone } = await store.transaction((tx) => {
      const repository = new DeviceRepository(tx);
      const kept = snapshots.map((snapshot) =>
        repository.upsert(ownerId, agentId, snapshot.externalId, snapshot.name, snapshot.capabilities),
      );
      return {
        devices: kept,
        gone: repository.pruneAgent(agentId, new Set(snapshots.map((snapshot) => snapshot.externalId))),
      };
    });

    hub.index(agentId, devices);
    for (const snapshot of snapshots) {
      hub.publish(ownerId, agentId, snapshot.externalId, { online: snapshot.online, state: snapshot.state });
    }

    // L'inventario è cambiato: chi guarda deve rileggerlo, se no si tiene i
    // fantasmi di quelli spariti o non vede quelli nuovi.
    if (gone.length || devices.length) hub.changed(ownerId, { kind: 'devices' });
    return devices;
  }

  /** Premere un interruttore: si aspetta che l'agente dica di sì. */
  async command(ownerId: string, id: string, code: string, value: string | number | boolean): Promise<void> {
    const device = await this.find(ownerId, id);
    const capability = device.capabilities.find((entry) => entry.code === code);
    if (!capability) throw badRequest('questo dispositivo non sa fare questa cosa');
    if (capability.kind === 'sensor') throw badRequest('un sensore si legge, non si comanda');

    const kind = typeof value;
    if (kind !== 'string' && kind !== 'number' && kind !== 'boolean') throw badRequest('valore non valido');

    await hub.command(device.agentId, device.externalId, code, value);
  }
}

export const deviceManager = new DeviceManager();
