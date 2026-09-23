import type { DeviceSnapshot } from '../../../shared/protocol.js';
import { badRequest, notFound } from '../errors/HttpError.js';
import { hub } from '../iot/hub.js';
import { store } from '../persistence/JsonStore.js';
import { DeviceRepository } from '../repositories/DeviceRepository.js';
import { AlertRepository } from '../repositories/AlertRepository.js';
import { SceneRepository } from '../repositories/SceneRepository.js';
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
    return store.transaction((tx) => {
      const devices = new DeviceRepository(tx);
      const device = devices.findById(id);
      if (!device || device.ownerId !== ownerId) throw notFound('dispositivo inesistente');

      return devices.watch(id, wanted) as Device;
    });
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
    const { devices, gone, scenes, before } = await store.transaction((tx) => {
      const repository = new DeviceRepository(tx);
      const was = repository.findAllOfAgent(agentId).length;
      const kept = snapshots.map((snapshot) =>
        repository.upsert(ownerId, agentId, snapshot.externalId, snapshot.name, snapshot.capabilities),
      );
      const lost = repository.pruneAgent(agentId, new Set(snapshots.map((snapshot) => snapshot.externalId)));
      return {
        devices: kept,
        gone: lost,
        // chi sparisce esce anche dagli insiemi che lo tenevano: un insieme
        // che prova a comandare un fantasma non si capisce perché non va
        scenes: lost.length ? new SceneRepository(tx).pruneDevices(new Set(lost)) : 0,
        // e le regole che lo guardavano: una regola su un fantasma non
        // scattera' mai, e resterebbe li' a far credere di essere coperti
        rules: lost.length ? new AlertRepository(tx).pruneDevices(new Set(lost)) : 0,
        before: was,
      };
    });

    hub.index(agentId, devices);
    for (const snapshot of snapshots) {
      hub.publish(ownerId, agentId, snapshot.externalId, { online: snapshot.online, state: snapshot.state });
    }

    // L'inventario è cambiato: chi guarda deve rileggerlo, se no si tiene i
    // fantasmi di quelli spariti o non vede quelli nuovi.
    // Nel registro ci finisce solo se è cambiato qualcosa: un agente che si
    // ricollega e racconta le stesse cose non è una notizia.
    if (gone.length || devices.length !== before) {
      logManager.note({
        ownerId,
        agentId,
        kind: 'inventory',
        // Una frase intera e non un conteggio: «2 dispositivi in meno» non
        // dice se sono spariti dalla rete o se li hai tolti tu, e la riga si
        // legge di sfuggita la mattina dopo.
        detail: [
          devices.length > before ? `ha trovato ${conta(devices.length - before)} in più` : '',
          gone.length ? `non trova più ${conta(gone.length)}` : '',
        ]
          .filter(Boolean)
          .join(', e '),
      });
    }

    if (gone.length || devices.length) hub.changed(ownerId, { kind: 'devices' });
    // gli insiemi cambiati si rileggono insieme ai dispositivi: è la stessa lista
    if (scenes) hub.changed(ownerId, { kind: 'devices' });
    return devices;
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
    if (capability.kind === 'sensor') throw badRequest('un sensore si legge, non si comanda');
    if (capability.kind === 'image') throw badRequest('una telecamera si guarda, non si comanda');

    const kind = typeof value;
    if (kind !== 'string' && kind !== 'number' && kind !== 'boolean') throw badRequest('valore non valido');

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
