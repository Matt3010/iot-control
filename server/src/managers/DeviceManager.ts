import type { DeviceSnapshot } from '../../../shared/protocol.js';
import { badRequest, notFound } from '../errors/HttpError.js';
import { hub } from '../iot/hub.js';
import { store } from '../persistence/db.js';
import { DeviceRepository } from '../repositories/DeviceRepository.js';
import { AlertRepository } from '../repositories/AlertRepository.js';
import { SceneRepository } from '../repositories/SceneRepository.js';
import { check } from './check.js';
import { logManager } from './LogManager.js';
import { guardati } from './guardati.js';
import { dispositivi, says } from './says.js';
import type { Transaction } from '../persistence/db.js';
import type { Device, Scope } from '../types.js';
import { raggioDi, soloPadrone } from './raggio.js';

export class DeviceManager {
  /** Quelli che questa richiesta vede: da ospite, quelli degli agenti dei suoi luoghi e niente telecamere. */
  list(scope: Scope): Promise<Device[]> {
    return store.transaction(async (tx) => {
      const raggio = await raggioDi(tx, scope);
      return (await new DeviceRepository(tx).findAllOf(scope.ownerId)).filter((device) => raggio.vedeDispositivo(device.id));
    });
  }

  /** Accende o spegne l'avviso su un dispositivo. */
  watch(scope: Scope, id: string, wanted: boolean): Promise<Device> {
    return store.transaction(async (tx) => {
      await this.#visto(tx, scope, id);
      return (await new DeviceRepository(tx).watch(id, wanted)) as Device;
    });
  }

  find(scope: Scope, id: string): Promise<Device> {
    return store.transaction((tx) => this.#visto(tx, scope, id));
  }

  /** Uno che questa richiesta non vede, per lei, non esiste. */
  async #visto(tx: Transaction, scope: Scope, id: string): Promise<Device> {
    const device = await new DeviceRepository(tx).findById(id);
    if (!device || device.ownerId !== scope.ownerId || !(await raggioDi(tx, scope)).vedeDispositivo(id)) {
      throw notFound('dispositivo inesistente');
    }
    return device;
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
    /** Se l'elenco è completo, e quindi chi non c'è dentro va segnato come sparito. */
    completo = true,
  ): Promise<Device[]> {
    const { devices, tutti, nuovi, cambiati, gone, spostati } = await store.transaction(async (tx) => {
      const repository = new DeviceRepository(tx);
      // letti una volta: tutto quello che serve dopo si sa da qui e da quello che torna dalle scritture
      const prima = await repository.findAllOfAgent(agentId);
      const perEsterno = new Map(prima.map((one) => [one.externalId, one]));

      const kept = await repository.upsertMany(ownerId, agentId, snapshots);
      /*
       * Cambiato vuol dire qualcosa che chi guarda vede: uno nuovo, un nome,
       * quello che sa fare, uno sparito che torna. L'ora in cui si è fatto
       * sentire l'ultima volta non conta, se no ogni ricollegamento
       * rileggerebbe l'elenco di tutte le schede aperte.
       */
      const nuovi = kept.filter((one) => !perEsterno.has(one.externalId)).length;
      const cambiati = kept.filter((one) => {
        const era = perEsterno.get(one.externalId);
        return (
          !!era &&
          (era.name !== one.name ||
            !!era.goneAt ||
            JSON.stringify(era.capabilities) !== JSON.stringify(one.capabilities))
        );
      }).length;
      for (const one of kept) perEsterno.set(one.externalId, one);

      /*
       * Un'entità che adesso sta dentro a un dispositivo — il sensore dei
       * consumi dentro alla sua presa — era un dispositivo a sé. Prima di
       * toglierlo, le scene e gli avvisi scritti su di lui passano al
       * dispositivo che lo tiene dentro, con il codice che dice da dove
       * viene. Tolto dopo, se li porterebbe via.
       */
      const moves: { from: string; to: string; prefisso: string }[] = [];
      for (const snapshot of snapshots) {
        const casa = perEsterno.get(snapshot.externalId);
        for (const assorbito of snapshot.absorbs ?? []) {
          const vecchio = perEsterno.get(assorbito);
          if (!casa || !vecchio || vecchio.id === casa.id) continue;
          moves.push({ from: vecchio.id, to: casa.id, prefisso: assorbito });
          perEsterno.delete(assorbito);
        }
      }
      const scene = await new SceneRepository(tx).moveDevices(ownerId, moves);
      const alerts = new AlertRepository(tx);
      let regole = 0;
      for (const move of moves) regole += await alerts.moveDevice(move.from, move.to, move.prefisso);
      await repository.deleteMany(moves.map((move) => move.from));

      /*
       * Chi non c'è più non si cancella: si segna da quando manca, e resta
       * con le sue scene e i suoi avvisi. Un account scollegato e
       * ricollegato riporta gli stessi dispositivi, e ritrovano tutto com'era.
       * Se ne vanno davvero solo con «Rimuovi», dalla loro scheda.
       */
      const raccontati = new Set(snapshots.map((snapshot) => snapshot.externalId));
      const lost = completo
        ? [...perEsterno.values()].filter((one) => !raccontati.has(one.externalId)).map((one) => one.id)
        : [];
      const appena = await repository.markGone(lost);
      for (const one of appena) perEsterno.set(one.externalId, one);

      return {
        devices: kept,
        tutti: [...perEsterno.values()],
        nuovi,
        cambiati,
        gone: appena.length,
        spostati: { scene, regole, dispositivi: moves.length },
      };
    });

    // l'indice li tiene tutti, anche quelli che una presentazione non ha nominato
    hub.index(agentId, tutti);
    for (const snapshot of snapshots) {
      hub.publish(ownerId, agentId, snapshot.externalId, { online: snapshot.online, state: snapshot.state });
    }

    // Nel registro ci finisce solo se è cambiato qualcosa: un agente che si
    // ricollega e racconta le stesse cose non è una notizia.
    if (gone || nuovi) {
      logManager.note({
        ownerId,
        agentId,
        kind: 'inventory',
        // Una frase intera e non un conteggio: «2 dispositivi in meno» non
        // dice se sono spariti dalla rete o se li hai tolti tu, e la riga si
        // legge di sfuggita la mattina dopo.
        detail: [nuovi ? `ha trovato ${dispositivi(nuovi)} in più` : '', gone ? `non trova più ${dispositivi(gone)}` : '']
          .filter(Boolean)
          .join(', e '),
      });
    }

    /*
     * L'inventario è cambiato: chi guarda deve rileggerlo, se no si tiene i
     * fantasmi di quelli spariti o non vede quelli nuovi. Le scene che
     * nominavano un dispositivo assorbito si rileggono con lui, perché il
     * sito rilegge dispositivi e scene insieme. Le regole degli avvisi hanno
     * il loro evento.
     */
    if (gone || nuovi || cambiati || spostati.dispositivi) hub.changed(ownerId, { kind: 'devices' });
    if (spostati.regole) hub.changed(ownerId, { kind: 'rules' });
    // scene e avvisi scritti su un dispositivo assorbito adesso guardano l'altro
    if (spostati.dispositivi) guardati.cambiate();
    return devices;
  }

  /**
   * «Rimuovi», dalla scheda di un dispositivo sparito: se ne va davvero, con
   * le righe, le partenze e le condizioni delle scene che lo nominavano e gli
   * avvisi scritti su di lui. Uno che c'è ancora non si toglie da qui, perché
   * al prossimo inventario tornerebbe, nuovo e senza niente.
   */
  async remove(scope: Scope, id: string): Promise<void> {
    const ownerId = scope.ownerId;
    const regole = await store.transaction(async (tx) => {
      const devices = new DeviceRepository(tx);
      const device = await this.#visto(tx, scope, id);
      soloPadrone(scope);
      if (!device.goneAt) throw badRequest('c’è ancora, per toglierlo si scollega il servizio da cui viene');
      await new SceneRepository(tx).pruneDevices(ownerId, new Set([id]));
      const cadute = await new AlertRepository(tx).pruneDevices(new Set([id]));
      await devices.deleteMany([id]);
      return cadute;
    });
    // dispositivi e scene si rileggono insieme; gli avvisi scritti su di lui se ne sono andati con lui
    guardati.cambiate();
    hub.changed(ownerId, { kind: 'devices' });
    if (regole) hub.changed(ownerId, { kind: 'rules' });
  }

  /**
   * Un fotogramma da una telecamera.
   *
   * Non finisce nel registro: guardare non è successo niente, e una riga a
   * ogni aggiornamento coprirebbe in un'ora tutto il resto della giornata.
   */
  async frame(scope: Scope, id: string): Promise<Buffer> {
    const device = await this.camera(scope, id);
    return hub.snapshot(device.agentId, device.externalId);
  }

  /** Una telecamera, e non un'altra cosa: la domanda si fa in un posto solo. */
  async camera(scope: Scope, id: string): Promise<Device> {
    const device = await this.find(scope, id);
    const guarda = device.capabilities.find((entry) => entry.kind === 'image');
    if (!guarda) throw badRequest('questo dispositivo non è una telecamera');
    return device;
  }

  /** Premere un interruttore: si aspetta che l'agente dica di sì. */
  async command(
    scope: Scope,
    id: string,
    code: string,
    value: string | number | boolean,
    who?: string,
  ): Promise<void> {
    const ownerId = scope.ownerId;
    const device = await this.find(scope, id);
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
