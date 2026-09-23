import { badRequest, notFound } from '../errors/HttpError.js';
import { hub } from '../iot/hub.js';
import { store } from '../persistence/JsonStore.js';
import { AlertRepository } from '../repositories/AlertRepository.js';
import { DeviceRepository } from '../repositories/DeviceRepository.js';
import type { Alert, Device } from '../types.js';
import { noticeManager } from './NoticeManager.js';
import { says } from './says.js';

/**
 * Le regole scritte sui dispositivi, e chi le fa scattare.
 *
 * Una regola guarda una cosa sola — «quando la porta diventa aperta» — e
 * scatta sul passaggio, non sullo stato: una porta che resta aperta per un'ora
 * l'ha detto una volta, e ripeterlo ogni minuto per un'ora è il modo più
 * rapido per far spegnere tutti gli avvisi. Torna a poter scattare quando
 * quella cosa smette di essere così.
 */
export class AlertManager {
  mine(ownerId: string): Promise<Alert[]> {
    return store.transaction((tx) => new AlertRepository(tx).findAllOf(ownerId));
  }

  /** Scrive una regola nuova, dopo aver controllato che abbia senso. */
  add(ownerId: string, deviceId: string, code: string, becomes: string): Promise<Alert> {
    return store.transaction((tx) => {
      const device = new DeviceRepository(tx).findById(deviceId);
      if (!device || device.ownerId !== ownerId) throw notFound('dispositivo inesistente');

      const capability = device.capabilities.find((one) => one.code === code);
      if (!capability) throw badRequest(`«${device.name}» non sa fare questa cosa`);

      const alerts = new AlertRepository(tx);
      const gia = alerts
        .findAllOf(ownerId)
        .some((one) => one.deviceId === deviceId && one.code === code && one.becomes === becomes);
      if (gia) throw badRequest('questa regola c’è già');

      return alerts.add({
        ownerId,
        deviceId,
        code,
        becomes,
        says: `${device.name} ${this.#reads(device, code, becomes)}`,
        also: [],
      });
    });
  }

  /** Spegne o riaccende una regola senza cancellarla. */
  flip(ownerId: string, id: string, off: boolean): Promise<Alert> {
    return store.transaction((tx) => {
      const alerts = new AlertRepository(tx);
      const alert = alerts.findById(id);
      if (!alert || alert.ownerId !== ownerId) throw notFound('regola inesistente');

      return alerts.update(id, { off }) as Alert;
    });
  }

  remove(ownerId: string, id: string): Promise<void> {
    return store.transaction((tx) => {
      const alerts = new AlertRepository(tx);
      const alert = alerts.findById(id);
      if (!alert || alert.ownerId !== ownerId) throw notFound('regola inesistente');
      alerts.delete(id);
    });
  }

  /**
   * Una cosa è cambiata: si guarda se qualcuno voleva saperlo.
   *
   * Sul passaggio, non sullo stato. Chi guardava un valore che c'era già non
   * viene svegliato adesso — e se la regola è nata mentre la porta era già
   * aperta, scatterà la prossima volta che si apre, che è quello che uno si
   * aspetta da «quando la porta si apre».
   */
  async happened(deviceId: string, code: string, value: unknown): Promise<void> {
    const adesso = String(value);

    const scattate = await store.transaction((tx) => {
      const alerts = new AlertRepository(tx);
      const devices = new DeviceRepository(tx);
      const out: { alert: Alert; device: Device; luogo?: string }[] = [];

      for (const alert of alerts.findWatching(deviceId, code)) {
        const device = devices.findById(deviceId);
        if (!device) continue;

        const centrata = alert.becomes === adesso;
        if (!centrata) {
          // è rientrata: da qui in poi può scattare di nuovo
          if (alert.firedAt) alerts.update(alert.id, { firedAt: undefined });
          continue;
        }

        if (alert.firedAt) continue;
        alerts.update(alert.id, { firedAt: new Date().toISOString() });
        const luogo = tx.data.places.find((place) => (place.agentIds ?? []).includes(device.agentId))?.name;
        out.push({ alert, device, ...(luogo ? { luogo } : {}) });
      }
      return out;
    });

    for (const { alert, device, luogo } of scattate) {
      await noticeManager.tell(alert.ownerId, {
        kind: 'scene',
        deviceId: device.id,
        agentId: device.agentId,
        who: device.name,
        ...(luogo ? { where: luogo } : {}),
        short: this.#reads(device, code, adesso),
        title: alert.says,
        // sul telefono il titolo dice gia' tutto: sotto ci sta solo dove
        body: luogo ? `Su «${luogo}».` : '',
      });
    }
  }

  /** Come si legge un valore, con le parole del dispositivo. */
  #reads(device: Device, code: string, value: string): string {
    const capability = device.capabilities.find((one) => one.code === code);
    if (!capability) return `è ${value}`;

    if (capability.kind === 'switch') return value === 'true' ? 'si accende' : 'si spegne';
    return `diventa ${says(capability, value).toLocaleLowerCase('it')}`;
  }
}

export const alertManager = new AlertManager();

/*
 * Il hub racconta i passaggi, le regole li ascoltano. Il legame si fa qui e
 * non dentro al hub: lui sa cosa succede in casa, non cosa farne.
 */
hub.watchesChanges((deviceId, code, value) => {
  void alertManager
    .happened(deviceId, code, value)
    .catch((error: Error) => console.warn(`regole di ${deviceId}, ${error.message}`));
});
