import { randomUUID } from 'node:crypto';
import type { Capability } from '../../../shared/protocol.js';
import type { Transaction } from '../persistence/JsonStore.js';
import type { Device } from '../types.js';

export class DeviceRepository {
  constructor(private readonly tx: Transaction) {}

  findAllOf(ownerId: string): Device[] {
    return this.tx.data.devices.filter((device) => device.ownerId === ownerId);
  }

  findById(id: string): Device | undefined {
    return this.tx.data.devices.find((device) => device.id === id);
  }

  owns(ownerId: string, id: string): boolean {
    return this.findById(id)?.ownerId === ownerId;
  }

  findAllOfAgent(agentId: string): Device[] {
    return this.tx.data.devices.filter((device) => device.agentId === agentId);
  }

  /**
   * Un dispositivo che torna non è un dispositivo nuovo: si riconosce dal suo
   * id dentro il suo agente, e conserva quello che i luoghi già puntano.
   */
  upsert(ownerId: string, agentId: string, externalId: string, name: string, capabilities: Capability[]): Device {
    const found = this.tx.data.devices.find((device) => device.agentId === agentId && device.externalId === externalId);
    const lastSeenAt = new Date().toISOString();

    if (found) {
      Object.assign(found, { name, capabilities, lastSeenAt });
      this.tx.markDirty();
      return found;
    }

    const device: Device = { id: `dev-${randomUUID()}`, ownerId, agentId, externalId, name, capabilities, lastSeenAt };
    this.tx.data.devices.push(device);
    this.tx.markDirty();
    return device;
  }

  /**
   * Quelli che l'agente non racconta più non esistono più. Home Assistant un
   * dispositivo spento lo elenca lo stesso, come «non disponibile»: se manca
   * dall'elenco vuol dire che è stato tolto, o che non era un dispositivo —
   * l'ora dell'alba, lo stato dei backup. Tenerli farebbe da fantasmi
   * perennemente «non raggiungibili».
   */
  pruneAgent(agentId: string, keep: Set<string>): string[] {
    const going = this.tx.data.devices
      .filter((device) => device.agentId === agentId && !keep.has(device.externalId))
      .map((device) => device.id);
    if (!going.length) return [];

    this.tx.data.devices = this.tx.data.devices.filter((device) => !going.includes(device.id));
    this.tx.markDirty();
    return going;
  }

  /**
   * Un agente che se ne va porta via i suoi dispositivi. Il luogo che lo teneva
   * resta dov'è, e torna a essere un luogo: era un indirizzo prima di avere
   * un agente.
   */
  deleteByAgent(agentId: string): string[] {
    const going = this.tx.data.devices.filter((device) => device.agentId === agentId).map((device) => device.id);
    this.tx.data.devices = this.tx.data.devices.filter((device) => device.agentId !== agentId);

    for (const place of this.tx.data.places) {
      if (place.agentIds?.includes(agentId)) {
        place.agentIds = place.agentIds.filter((id) => id !== agentId);
      }
    }
    this.tx.markDirty();
    return going;
  }
}
