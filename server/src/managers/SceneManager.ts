import type { DeviceValue } from '../../../shared/protocol.js';
import type { SceneDto } from '../dto/scene.dto.js';
import { badGateway, badRequest, notFound } from '../errors/HttpError.js';
import { hub } from '../iot/hub.js';
import { store } from '../persistence/JsonStore.js';
import { DeviceRepository } from '../repositories/DeviceRepository.js';
import { SceneRepository } from '../repositories/SceneRepository.js';
import type { Device, Scene } from '../types.js';

const unique = (ids: string[]): string[] => [...new Set(ids.filter(Boolean))];

export class SceneManager {
  list(ownerId: string): Promise<Scene[]> {
    return store.transaction((tx) => new SceneRepository(tx).findAllOf(ownerId));
  }

  create(ownerId: string, dto: SceneDto): Promise<Scene> {
    return store.transaction((tx) => {
      const deviceIds = this.#check(tx, ownerId, unique(dto.deviceIds ?? []));
      return new SceneRepository(tx).insert(ownerId, dto.name, deviceIds);
    });
  }

  update(ownerId: string, id: string, dto: SceneDto): Promise<Scene> {
    return store.transaction((tx) => {
      const scenes = new SceneRepository(tx);
      if (!scenes.owns(ownerId, id)) throw notFound('insieme inesistente');

      const patch: Partial<Scene> = { name: dto.name };
      if (dto.deviceIds) patch.deviceIds = this.#check(tx, ownerId, unique(dto.deviceIds));
      return scenes.update(id, patch) as Scene;
    });
  }

  remove(ownerId: string, id: string): Promise<void> {
    return store.transaction((tx) => {
      const scenes = new SceneRepository(tx);
      if (!scenes.owns(ownerId, id)) throw notFound('insieme inesistente');
      scenes.delete(id);
    });
  }

  /**
   * La stessa cosa detta a tutti insieme.
   *
   * Partono in parallelo, non uno dopo l'altro: due tende che si aprono a
   * mezzo secondo di distanza si vedono, ed è proprio quello che si voleva
   * evitare mettendole nello stesso insieme.
   *
   * Poi si conta. Se qualcuno non ha risposto lo si dice con i nomi: «Tenda 1
   * non ha risposto» è una frase su cui si può fare qualcosa, «errore» no. E
   * se non ha risposto nessuno è un guasto, non una richiesta sbagliata.
   */
  async command(ownerId: string, id: string, code: string, value: DeviceValue): Promise<void> {
    const { scene, devices } = await store.transaction((tx) => {
      const found = new SceneRepository(tx).findById(id);
      if (!found || found.ownerId !== ownerId) throw notFound('insieme inesistente');

      const all = new DeviceRepository(tx).findAllOf(ownerId);
      const mine = found.deviceIds
        .map((deviceId) => all.find((device) => device.id === deviceId))
        .filter((device): device is Device => !!device);
      return { scene: found, devices: mine };
    });

    /*
     * O la sanno fare tutti, o non parte niente.
     *
     * Una tenda e una lampadina nello stesso insieme non hanno un «Apri» in
     * comune: mandarlo solo alla tenda vorrebbe dire fare mezza cosa e dire
     * che è andata bene. L'interfaccia mostra già solo le azioni comuni, ma la
     * regola vive qui — è qui che si decide cosa succede davvero.
     */
    const able = devices.filter((device) =>
      device.capabilities.some((entry) => entry.code === code && entry.kind !== 'sensor'),
    );
    if (!able.length) throw badRequest(`«${scene.name}» non ha niente che sappia farlo`);
    if (able.length !== devices.length) {
      const others = devices.filter((device) => !able.includes(device));
      throw badRequest(
        `${others.map((device) => `«${device.name}»`).join(', ')} non sa farlo: «${scene.name}» fa solo quello che sanno fare tutti`,
      );
    }

    const results = await Promise.allSettled(
      able.map((device) => hub.command(device.agentId, device.externalId, code, value)),
    );

    const mute = able.filter((_device, at) => results[at]?.status === 'rejected');
    if (mute.length === able.length) {
      throw badGateway(
        mute.length === 1
          ? `«${mute[0]!.name}» non ha risposto`
          : `Non ha risposto nessuno di «${scene.name}»`,
      );
    }
    if (mute.length) {
      throw badGateway(
        `${mute.map((device) => `«${device.name}»`).join(', ')}: nessuna risposta. Gli altri sono partiti.`,
      );
    }
  }

  /** Ogni dispositivo dev'essere suo: un insieme non comanda roba d'altri. */
  #check(tx: Parameters<Parameters<typeof store.transaction>[0]>[0], ownerId: string, deviceIds: string[]): string[] {
    const devices = new DeviceRepository(tx);
    if (deviceIds.some((id) => !devices.owns(ownerId, id))) throw badRequest('dispositivo inesistente');
    return deviceIds;
  }
}

export const sceneManager = new SceneManager();
