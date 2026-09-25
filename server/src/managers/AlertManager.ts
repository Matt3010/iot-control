import { badRequest, notFound } from '../errors/HttpError.js';
import { Fila } from '../iot/fila.js';
import { hub } from '../iot/hub.js';
import { store } from '../persistence/db.js';
import { AlertRepository } from '../repositories/AlertRepository.js';
import { DeviceRepository } from '../repositories/DeviceRepository.js';
import { PlaceRepository } from '../repositories/PlaceRepository.js';
import { holds } from '../rules/prove.js';
import { statoDi } from '../../../shared/regole.js';
import type { Transaction } from '../persistence/db.js';
import type { Alert, Device, Notice, Op, Scope } from '../types.js';
import { raggioDi } from './raggio.js';
import { noticeManager, scrivi } from './NoticeManager.js';
import { provaDi } from './check.js';
import { guardati } from './guardati.js';
import { number, says, saysThreshold } from './says.js';

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
  /** Le regole scritte sui dispositivi che questa richiesta vede. */
  mine(scope: Scope): Promise<Alert[]> {
    return store.transaction(async (tx) => {
      const raggio = await raggioDi(tx, scope);
      return (await new AlertRepository(tx).findAllOf(scope.ownerId)).filter((alert) => raggio.vedeDispositivo(alert.deviceId));
    });
  }

  /** Una regola che si vede: sta su un dispositivo che si vede. Le altre non ci sono. */
  async #vista(tx: Transaction, scope: Scope, id: string): Promise<Alert> {
    const alert = await new AlertRepository(tx).findById(id);
    if (!alert || alert.ownerId !== scope.ownerId || !(await raggioDi(tx, scope)).vedeDispositivo(alert.deviceId)) {
      throw notFound('regola inesistente');
    }
    return alert;
  }

  /**
   * Scrive una regola nuova, dopo aver controllato che abbia senso. Il
   * controllo è lo stesso delle partenze e delle condizioni delle scene
   * (`check.ts`, `provaDi`).
   */
  async add(scope: Scope, deviceId: string, code: string, becomes: string, op: Op = 'is'): Promise<Alert> {
    const ownerId = scope.ownerId;
    const nuova = await store.transaction(async (tx) => {
      const device = await new DeviceRepository(tx).findById(deviceId);
      if (!device || device.ownerId !== ownerId || !(await raggioDi(tx, scope)).vedeDispositivo(deviceId)) {
        throw notFound('dispositivo inesistente');
      }

      const capability = device.capabilities.find((one) => one.code === code);
      if (!capability) throw badRequest(`«${device.name}» non sa fare questa cosa`);
      const prova = provaDi(capability, device.name, 'quando', op, becomes);
      const valore = String(prova.value);

      // la stessa regola due volte la rifiuta l'archivio, anche da due schede insieme
      const scritta = await new AlertRepository(tx).add({
        ownerId,
        deviceId,
        code,
        op: prova.op,
        becomes: valore,
        says: `${device.name} ${this.#reads(device, code, valore, prova.op)}`,
        also: [],
        // se è già vera nasce già scattata: scatterà al prossimo passaggio, non al prossimo numero
        ...(giaVera(deviceId, code, prova) ? { firedAt: new Date().toISOString() } : {}),
      });
      if (!scritta) throw badRequest('questa regola c’è già');
      return scritta;
    });
    guardati.cambiate();
    return nuova;
  }

  /**
   * Spegne o riaccende una regola senza cancellarla.
   *
   * Riaccesa riparte da capo, come appena scritta: se quello che chiede è
   * già vero nasce già scattata, se no pronta a scattare. Spenta non guarda
   * più niente, quindi non vede nemmeno la porta che si chiude: se restava
   * segnata come scattata, alla prossima apertura taceva.
   */
  async flip(scope: Scope, id: string, off: boolean): Promise<Alert> {
    const fatta = await store.transaction(async (tx) => {
      const alerts = new AlertRepository(tx);
      const alert = await this.#vista(tx, scope, id);
      const gia = !off && giaVera(alert.deviceId, alert.code, { op: alert.op, value: alert.becomes });
      return (await alerts.update(id, off ? { off } : { off, firedAt: gia ? new Date().toISOString() : undefined })) as Alert;
    });
    guardati.cambiate();
    return fatta;
  }

  async remove(scope: Scope, id: string): Promise<void> {
    await store.transaction(async (tx) => {
      await this.#vista(tx, scope, id);
      await new AlertRepository(tx).delete(id);
    });
    guardati.cambiate();
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
    // quasi tutti i passaggi non li guarda nessuno, e lo si sa senza chiederlo al database
    if (!(await guardati.daAvvisi(deviceId, code))) return;
    const adesso = String(value);

    const scattate = await store.transaction(async (tx) => {
      const alerts = new AlertRepository(tx);
      // prima le regole: quasi tutti i passaggi non ne hanno, e lì ci si ferma
      const guardano = await alerts.findWatching(deviceId, code);
      if (!guardano.length) return [];

      const rientrate = guardano.filter((alert) => !holds({ op: alert.op, value: alert.becomes }, value));
      /*
       * È rientrata, e da qui in poi può scattare di nuovo. Tutte e non solo
       * quelle lette come scattate: un'apertura arrivata un istante prima
       * può averla appena presa, e la condizione sta nella scrittura.
       */
      await alerts.rearm(rientrate.map((alert) => alert.id));

      /*
       * Scatta chi vince il turno: la condizione sta dentro alla scrittura,
       * e due passaggi arrivati insieme non mandano due avvisi.
       */
      const vinte: Alert[] = [];
      for (const alert of guardano) {
        if (rientrate.includes(alert) || alert.firedAt) continue;
        if (await alerts.fire(alert.id)) vinte.push(alert);
      }
      if (!vinte.length) return [];

      const device = await new DeviceRepository(tx).findById(deviceId);
      if (!device) return [];
      const luogo = (await new PlaceRepository(tx).findByAgent(device.agentId))?.name;

      // la riga dell'avviso nella stessa transazione del turno: preso l'uno, c'è anche l'altra
      const righe: Notice[] = [];
      for (const alert of vinte) {
        righe.push(
          await scrivi(tx, alert.ownerId, {
            kind: 'rule',
            deviceId: device.id,
            agentId: device.agentId,
            who: device.name,
            ...(luogo ? { where: luogo } : {}),
            short: this.#fired(device, alert, adesso),
            title: alert.says,
            // sul telefono il titolo dice gia' tutto: sotto ci sta solo dove
            body: luogo ? `Su «${luogo}».` : '',
          }),
        );
      }
      return righe;
    });

    for (const riga of scattate) await noticeManager.manda(riga);
  }

  /**
   * Com'è un dispositivo quando non c'è un passaggio da raccontare: il primo
   * stato dopo un riavvio, o dopo che è tornato in rete.
   *
   * Non fa scattare niente, perché non si sa quando è successo. Ma una regola
   * già scattata che adesso non vale più rientra: se la porta si è chiusa
   * mentre non la vedevamo, la prossima volta che si apre lo si deve dire.
   * E una che adesso vale senza essere scattata si segna come scattata,
   * come una regola appena scritta: se no il primo numero dopo — da 30 a
   * 30,5 gradi con «sopra 25» — la faceva scattare senza nessun passaggio.
   */
  async settled(deviceId: string, state: Record<string, unknown>): Promise<void> {
    if (!(await guardati.conAvvisi(deviceId))) return;
    await store.transaction(async (tx) => {
      const alerts = new AlertRepository(tx);
      const guardano = (await alerts.findAllOfDevice(deviceId)).filter((alert) => !alert.off && alert.code in state);
      const vale = (alert: Alert): boolean => holds({ op: alert.op, value: alert.becomes }, state[alert.code]);
      await alerts.rearm(guardano.filter((alert) => alert.firedAt && !vale(alert)).map((alert) => alert.id));
      await alerts.markFired(guardano.filter((alert) => !alert.firedAt && vale(alert)).map((alert) => alert.id));
    });
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
    // un evento non «diventa»: succede, e si dice che cosa
    if (capability.kind === 'sensor' && capability.event) return `«${says(capability, value)}»`;
    if (capability.kind === 'switch') return value === 'true' ? 'si accende' : 'si spegne';
    // una serratura si comanda con «Apri» e con lo stesso valore dice com'è
    // rimasta, e letto come un ordine l'avviso sembrava chiederle di aprirsi
    const stato = statoDi(capability, value);
    if (stato) return stato.quando;
    /*
     * Il valore fra virgolette e com'e' scritto. Smontato in minuscolo
     * diventava «diventa apri», che non e' italiano: quelle parole le
     * sceglie il dispositivo, e sono stati dove una porta dice aperta e
     * comandi dove una tenda dice apri.
     */
    return `diventa «${says(capability, value)}»`;
  }
}

/**
 * Se quello che la regola chiede è già vero adesso, per quello che il
 * dispositivo racconta. Uno che non risponde non racconta niente, e allora
 * no (`hub.stateOf`).
 */
function giaVera(deviceId: string, code: string, prova: { op: Op; value: string | number }): boolean {
  return holds(prova, hub.stateOf(deviceId)?.[code]);
}

export const alertManager = new AlertManager();

/*
 * Il hub racconta i passaggi, le regole li ascoltano. Il legame si fa qui e
 * non dentro al hub: lui sa cosa succede in casa, non cosa farne.
 *
 * In fila per dispositivo (`iot/fila.ts`). «Si apre» e «si chiude» un
 * istante dopo sono due transazioni: in parallelo la chiusura può finire
 * prima dell'apertura, e la regola resterebbe scattata con la porta chiusa,
 * muta alla volta dopo. Dispositivi diversi invece non si aspettano.
 */
const regole = new Fila((deviceId, error) => console.warn(`regole di ${deviceId}, ${error.message}`));

hub.watchesChanges((deviceId, cambi) => {
  void regole.metti(deviceId, async () => {
    for (const cambio of cambi) await alertManager.happened(deviceId, cambio.code, cambio.value);
  });
});
hub.watchesSnapshots((deviceId, state) => void regole.metti(deviceId, () => alertManager.settled(deviceId, state)));
