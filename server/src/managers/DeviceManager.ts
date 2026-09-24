import type { DeviceSnapshot } from '../../../shared/protocol.js';
import { badRequest, notFound } from '../errors/HttpError.js';
import { hub } from '../iot/hub.js';
import { store } from '../persistence/db.js';
import { DeviceRepository } from '../repositories/DeviceRepository.js';
import { AlertRepository } from '../repositories/AlertRepository.js';
import { SceneRepository } from '../repositories/SceneRepository.js';
import { check } from './check.js';
import { logManager } from './LogManager.js';
import { says } from './says.js';
import type { Device } from '../types.js';

/**
 * «1 dispositivo in più», «2 dispositivi in meno».
 *
 * Nel registro ci finiva «1 in più», e uno in più di cosa lo doveva indovinare
 * chi leggeva. Una riga di registro si legge di sfuggita, magari la mattina
 * dopo: deve dire per intero di cosa parla.
 */
const conta = (quanti: number): string =>
  `${quanti} ${quanti === 1 ? 'dispositivo' : 'dispositivi'}`;

export class DeviceManager {
  list(ownerId: string): Promise<Device[]> {
    return store.transaction((tx) => new DeviceRepository(tx).findAllOf(ownerId));
  }

  /** Accende o spegne l'avviso su un dispositivo. */
  watch(ownerId: string, id: string, wanted: boolean): Promise<Device> {
    return store.transaction(async (tx) => {
      const devices = new DeviceRepository(tx);
      const device = await devices.findById(id);
      if (!device || device.ownerId !== ownerId) throw notFound('dispositivo inesistente');

      return (await devices.watch(id, wanted)) as Device;
    });
  }

  find(ownerId: string, id: string): Promise<Device> {
    return store.transaction(async (tx) => {
      const device = await new DeviceRepository(tx).findById(id);
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
  async sync(
    ownerId: string,
    agentId: string,
    snapshots: DeviceSnapshot[],
    /** Se l'elenco è completo, e quindi chi non c'è dentro va tolto. */
    completo = true,
  ): Promise<Device[]> {
    const { devices, gone, scenes, before, tutti } = await store.transaction(async (tx) => {
      const repository = new DeviceRepository(tx);
      const was = (await repository.findAllOfAgent(agentId)).length;

      const kept: Device[] = [];
      for (const snapshot of snapshots) {
        kept.push(
          await repository.upsert(ownerId, agentId, snapshot.externalId, snapshot.name, snapshot.capabilities),
        );
      }

      /*
       * Un'entità che adesso sta dentro a un dispositivo — il sensore dei
       * consumi dentro alla sua presa — era un dispositivo a sé. Prima di
       * toglierlo, le scene e gli avvisi scritti su di lui passano al
       * dispositivo che lo tiene dentro, con il codice che dice da dove
       * viene. Tolto dopo, se li porterebbe via.
       */
      const perEsterno = new Map((await repository.findAllOfAgent(agentId)).map((one) => [one.externalId, one]));
      /** Quelli entrati dentro a un altro: scene e avvisi sono già passati a lui, e loro se ne vanno subito. */
      const assorbiti: string[] = [];
      for (const snapshot of snapshots) {
        const casa = perEsterno.get(snapshot.externalId);
        for (const assorbito of snapshot.absorbs ?? []) {
          const vecchio = perEsterno.get(assorbito);
          if (!casa || !vecchio || vecchio.id === casa.id) continue;
          await new SceneRepository(tx).moveDevice(ownerId, vecchio.id, casa.id, assorbito);
          await new AlertRepository(tx).moveDevice(vecchio.id, casa.id, assorbito);
          assorbiti.push(vecchio.id);
        }
      }
      await repository.deleteMany(assorbiti);

      /*
       * Chi non c'è più non si cancella: si segna da quando manca, e resta
       * con le sue scene e i suoi avvisi. Un account scollegato e
       * ricollegato riporta gli stessi dispositivi, e ritrovano tutto com'era.
       * Se ne vanno davvero solo con «Rimuovi», dalla loro scheda.
       */
      const lost = completo
        ? await repository.lostOfAgent(agentId, new Set(snapshots.map((snapshot) => snapshot.externalId)))
        : [];
      const appena = await repository.markGone(lost);

      return { devices: kept, gone: appena, scenes: 0, before: was, tutti: await repository.findAllOfAgent(agentId) };
    });

    // l'indice li tiene tutti, anche quelli che una presentazione non ha nominato
    hub.index(agentId, tutti);
    for (const snapshot of snapshots) {
      hub.publish(ownerId, agentId, snapshot.externalId, { online: snapshot.online, state: snapshot.state });
    }

    // L'inventario è cambiato: chi guarda deve rileggerlo, se no si tiene i
    // fantasmi di quelli spariti o non vede quelli nuovi.
    // Nel registro ci finisce solo se è cambiato qualcosa: un agente che si
    // ricollega e racconta le stesse cose non è una notizia.
    if (gone || tutti.length !== before) {
      logManager.note({
        ownerId,
        agentId,
        kind: 'inventory',
        // Una frase intera e non un conteggio: «2 dispositivi in meno» non
        // dice se sono spariti dalla rete o se li hai tolti tu, e la riga si
        // legge di sfuggita la mattina dopo.
        detail: [
          tutti.length > before ? `ha trovato ${conta(tutti.length - before)} in più` : '',
          gone ? `non trova più ${conta(gone)}` : '',
        ]
          .filter(Boolean)
          .join(', e '),
      });
    }

    if (gone || devices.length) hub.changed(ownerId, { kind: 'devices' });
    // gli insiemi cambiati si rileggono insieme ai dispositivi: è la stessa lista
    if (scenes) hub.changed(ownerId, { kind: 'devices' });
    return devices;
  }

  /**
   * «Rimuovi», dalla scheda di un dispositivo sparito: se ne va davvero, con
   * le righe, le partenze e le condizioni delle scene che lo nominavano e gli
   * avvisi scritti su di lui. Uno che c'è ancora non si toglie da qui, perché
   * al prossimo inventario tornerebbe, nuovo e senza niente.
   */
  async remove(ownerId: string, id: string): Promise<void> {
    await store.transaction(async (tx) => {
      const devices = new DeviceRepository(tx);
      const device = await devices.findById(id);
      if (!device || device.ownerId !== ownerId) throw notFound('dispositivo inesistente');
      if (!device.goneAt) throw badRequest('c’è ancora, per toglierlo si scollega il servizio da cui viene');
      await new SceneRepository(tx).pruneDevices(ownerId, new Set([id]));
      await new AlertRepository(tx).pruneDevices(new Set([id]));
      await devices.deleteMany([id]);
    });
    hub.changed(ownerId, { kind: 'devices' });
  }

  /**
   * Un fotogramma da una telecamera.
   *
   * Non finisce nel registro: guardare non è successo niente, e una riga a
   * ogni aggiornamento coprirebbe in un'ora tutto il resto della giornata.
   */
  async frame(ownerId: string, id: string): Promise<Buffer> {
    const device = await this.camera(ownerId, id);
    return hub.snapshot(device.agentId, device.externalId);
  }

  /** Una telecamera, e non un'altra cosa: la domanda si fa in un posto solo. */
  async camera(ownerId: string, id: string): Promise<Device> {
    const device = await this.find(ownerId, id);
    const guarda = device.capabilities.find((entry) => entry.kind === 'image');
    if (!guarda) throw badRequest('questo dispositivo non è una telecamera');
    return device;
  }

  /** Premere un interruttore: si aspetta che l'agente dica di sì. */
  async command(
    ownerId: string,
    id: string,
    code: string,
    value: string | number | boolean,
    who?: string,
  ): Promise<void> {
    const device = await this.find(ownerId, id);
    const capability = device.capabilities.find((entry) => entry.code === code);
    if (!capability) throw badRequest('questo dispositivo non sa fare questa cosa');
    // lo stesso controllo che passano le righe di una scena: un comando che
    // arriva da solo non è meno comando di uno che arriva in fila
    check(capability, value);

    /*
     * Nel registro ci va comunque, riuscito o no. Anzi: quello che non è
     * riuscito è proprio quello che si va a cercare, perché è la sera in cui
     * la tapparella non è scesa.
     */
    const note = (ok: boolean): void =>
      logManager.note({
        ownerId,
        agentId: device.agentId,
        kind: 'command',
        subject: device.name,
        detail: says(capability, value),
        ok,
        ...(who ? { who } : {}),
      });

    try {
      await hub.command(device.agentId, device.externalId, code, value);
    } catch (error) {
      note(false);
      throw error;
    }
    note(true);
  }
}

export const deviceManager = new DeviceManager();
