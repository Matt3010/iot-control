import { randomUUID } from 'node:crypto';
import type { Transaction } from '../persistence/JsonStore.js';
import type { Alert } from '../types.js';

/**
 * Le regole: «quando questa cosa diventa così, dimmelo».
 *
 * Stanno sul dispositivo di cui parlano e non in un elenco a parte, perché è
 * lì che si decidono e lì che si vanno a spegnere. Sono poche per definizione
 * — una porta, un congelatore, un sensore — e chi ne scrive venti le spegne
 * tutte dopo due giorni.
 */
export class AlertRepository {
  constructor(private readonly tx: Transaction) {}

  findAllOf(ownerId: string): Alert[] {
    return this.tx.data.alerts.filter((one) => one.ownerId === ownerId);
  }

  findById(id: string): Alert | undefined {
    return this.tx.data.alerts.find((one) => one.id === id);
  }

  /** Quelle che guardano quella cosa di quel dispositivo. */
  findWatching(deviceId: string, code: string): Alert[] {
    return this.tx.data.alerts.filter((one) => one.deviceId === deviceId && one.code === code && !one.off);
  }

  add(alert: Omit<Alert, 'id' | 'createdAt'>): Alert {
    const made: Alert = { id: `reg-${randomUUID()}`, createdAt: new Date().toISOString(), ...alert };
    this.tx.data.alerts.push(made);
    this.tx.markDirty();
    return made;
  }

  update(id: string, patch: Partial<Pick<Alert, 'off' | 'firedAt'>>): Alert | undefined {
    const alert = this.findById(id);
    if (!alert) return undefined;

    Object.assign(alert, patch);
    // `firedAt` tolto vuol dire «e' rientrata»: si scrive come assenza
    if (patch.firedAt === undefined && 'firedAt' in patch) delete alert.firedAt;
    this.tx.markDirty();
    return alert;
  }

  delete(id: string): boolean {
    const at = this.tx.data.alerts.findIndex((one) => one.id === id);
    if (at < 0) return false;

    this.tx.data.alerts.splice(at, 1);
    this.tx.markDirty();
    return true;
  }

  /** Un dispositivo che non c'è più si porta via le regole che lo nominavano. */
  pruneDevices(gone: Set<string>): number {
    const prima = this.tx.data.alerts.length;
    this.tx.data.alerts = this.tx.data.alerts.filter((one) => !gone.has(one.deviceId));

    const tolte = prima - this.tx.data.alerts.length;
    if (tolte) this.tx.markDirty();
    return tolte;
  }
}
