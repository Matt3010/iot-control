import { badRequest, notFound } from '../errors/HttpError.js';
import { hub } from '../iot/hub.js';
import { store } from '../persistence/db.js';
import { AlertRepository } from '../repositories/AlertRepository.js';
import { DeviceRepository } from '../repositories/DeviceRepository.js';
import { PlaceRepository } from '../repositories/PlaceRepository.js';
import { holds } from '../rules/prove.js';
import type { Alert, Device, Op } from '../types.js';
import { noticeManager } from './NoticeManager.js';
import { provabile } from './check.js';
import { number, says, saysThreshold } from './says.js';

/**
 * Come si dice che una cosa comandata a ordini è cambiata. È la stessa
 * tabella che la pagina usa per scrivere le prove (src/lib/prove.ts), ma
 * qui serve solo il «quando», perché un avviso arriva quando succede.
 */
const STATI: Record<string, Record<string, string>> = {
  lock: { Apri: 'si apre', 'Chiudi a chiave': 'si chiude a chiave' },
};

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
  add(ownerId: string, deviceId: string, code: string, becomes: string, op: Op = 'is'): Promise<Alert> {
    return store.transaction(async (tx) => {
      const device = await new DeviceRepository(tx).findById(deviceId);
      if (!device || device.ownerId !== ownerId) throw notFound('dispositivo inesistente');

      const capability = device.capabilities.find((one) => one.code === code);
      if (!capability) throw badRequest(`«${device.name}» non sa fare questa cosa`);
      provabile(capability, device.name, 'quando', becomes);

      // una soglia vale per i numeri, un valore preciso per il resto
      const numerica = capability.kind === 'range' || capability.kind === 'sensor';
      if (op !== 'is' && !numerica) throw badRequest('sopra e sotto valgono solo per i numeri');
      if (op !== 'is' && !Number.isFinite(Number(becomes))) throw badRequest('la soglia va scritta come numero');

      const alerts = new AlertRepository(tx);
      const gia = (await alerts.findAllOf(ownerId)).some(
        (one) => one.deviceId === deviceId && one.code === code && one.op === op && one.becomes === becomes,
      );
      if (gia) throw badRequest('questa regola c’è già');

      return alerts.add({
        ownerId,
        deviceId,
        code,
        op,
        becomes,
        says: `${device.name} ${this.#reads(device, code, becomes, op)}`,
        also: [],
      });
    });
  }

  /** Spegne o riaccende una regola senza cancellarla. */
  flip(ownerId: string, id: string, off: boolean): Promise<Alert> {
    return store.transaction(async (tx) => {
      const alerts = new AlertRepository(tx);
      const alert = await alerts.findById(id);
      if (!alert || alert.ownerId !== ownerId) throw notFound('regola inesistente');

      return (await alerts.update(id, { off })) as Alert;
    });
  }

  remove(ownerId: string, id: string): Promise<void> {
    return store.transaction(async (tx) => {
      const alerts = new AlertRepository(tx);
      const alert = await alerts.findById(id);
      if (!alert || alert.ownerId !== ownerId) throw notFound('regola inesistente');
      await alerts.delete(id);
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

    const scattate = await store.transaction(async (tx) => {
      const alerts = new AlertRepository(tx);
      const device = await new DeviceRepository(tx).findById(deviceId);
      const out: { alert: Alert; device: Device; luogo?: string }[] = [];
      if (!device) return out;

      const luogo = (await new PlaceRepository(tx).findByAgent(device.agentId))?.name;

      for (const alert of await alerts.findWatching(deviceId, code)) {
        const centrata = holds({ op: alert.op, value: alert.becomes }, value);
        if (!centrata) {
          // è rientrata: da qui in poi può scattare di nuovo
          if (alert.firedAt) await alerts.update(alert.id, { firedAt: undefined });
          continue;
        }

        if (alert.firedAt) continue;
        await alerts.update(alert.id, { firedAt: new Date().toISOString() });
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
        short: this.#fired(device, alert, adesso),
        title: alert.says,
        // sul telefono il titolo dice gia' tutto: sotto ci sta solo dove
        body: luogo ? `Su «${luogo}».` : '',
      });
    }
  }

  /**
   * Cosa è successo, per la riga dell'avviso. Per una soglia si dice anche
   * quanto segna adesso: «sale sopra 25 °C» da solo non dice se sono 25,1 o
   * 40, e sono due sere diverse.
   */
  #fired(device: Device, alert: Alert, adesso: string): string {
    const capability = device.capabilities.find((one) => one.code === alert.code);
    if (alert.op === 'is' || !capability) return this.#reads(device, alert.code, adesso);
    const unit = capability.kind === 'range' || capability.kind === 'sensor' ? capability.unit : undefined;
    return `${saysThreshold(capability, alert.op, alert.becomes)}, adesso segna ${number(adesso, unit)}`;
  }

  /** Come si legge un valore, con le parole del dispositivo. */
  #reads(device: Device, code: string, value: string, op: Op = 'is'): string {
    const capability = device.capabilities.find((one) => one.code === code);
    if (!capability) return `è ${value}`;
    if (op !== 'is') return saysThreshold(capability, op, value);

    if (capability.kind === 'switch' && capability.pulse) return 'scatta';
    if (capability.kind === 'switch') return value === 'true' ? 'si accende' : 'si spegne';
    // una serratura si comanda con «Apri» e con lo stesso valore dice com'è
    // rimasta, e letto come un ordine l'avviso sembrava chiederle di aprirsi
    const stato = STATI[code]?.[value];
    if (stato) return stato;
    /*
     * Il valore fra virgolette e com'e' scritto. Smontato in minuscolo
     * diventava «diventa apri», che non e' italiano: quelle parole le
     * sceglie il dispositivo, e sono stati dove una porta dice aperta e
     * comandi dove una tenda dice apri.
     */
    return `diventa «${says(capability, value)}»`;
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
