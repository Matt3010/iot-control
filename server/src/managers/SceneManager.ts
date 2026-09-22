import type { Capability, DeviceValue } from '../../../shared/protocol.js';
import type { SceneDto, SceneStepDto } from '../dto/scene.dto.js';
import { badGateway, badRequest, notFound } from '../errors/HttpError.js';
import { hub } from '../iot/hub.js';
import type { Transaction } from '../persistence/JsonStore.js';
import { store } from '../persistence/JsonStore.js';
import { DeviceRepository } from '../repositories/DeviceRepository.js';
import { SceneRepository } from '../repositories/SceneRepository.js';
import type { Device, Scene, SceneStep } from '../types.js';

/**
 * Un valore va bene per quella capacità? Non è pignoleria: una scena si
 * scrive una volta e si preme per mesi, e un valore storto dentro si scopre
 * la sera che serviva.
 */
function check(capability: Capability, value: DeviceValue): void {
  if (capability.kind === 'sensor') throw badRequest('un sensore si legge, non si comanda');

  if (capability.kind === 'switch') {
    if (typeof value !== 'boolean') throw badRequest(`«${capability.label}» si accende o si spegne`);
    return;
  }

  if (capability.kind === 'enum') {
    if (typeof value !== 'string' || !capability.values.includes(value)) {
      throw badRequest(`«${capability.label}» non sa fare «${String(value)}»`);
    }
    return;
  }

  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw badRequest(`«${capability.label}» vuole un numero`);
  }
  if (value < capability.min || value > capability.max) {
    throw badRequest(`«${capability.label}» sta fra ${capability.min} e ${capability.max}`);
  }
}

export class SceneManager {
  list(ownerId: string): Promise<Scene[]> {
    return store.transaction((tx) => new SceneRepository(tx).findAllOf(ownerId));
  }

  create(ownerId: string, dto: SceneDto): Promise<Scene> {
    return store.transaction((tx) => {
      const steps = this.#clean(tx, ownerId, dto.steps ?? []);
      return new SceneRepository(tx).insert(ownerId, dto.name, steps);
    });
  }

  update(ownerId: string, id: string, dto: SceneDto): Promise<Scene> {
    return store.transaction((tx) => {
      const scenes = new SceneRepository(tx);
      if (!scenes.owns(ownerId, id)) throw notFound('scena inesistente');

      const patch: Partial<Scene> = { name: dto.name };
      if (dto.steps) patch.steps = this.#clean(tx, ownerId, dto.steps);
      return scenes.update(id, patch) as Scene;
    });
  }

  remove(ownerId: string, id: string): Promise<void> {
    return store.transaction((tx) => {
      const scenes = new SceneRepository(tx);
      if (!scenes.owns(ownerId, id)) throw notFound('scena inesistente');
      scenes.delete(id);
    });
  }

  /**
   * La scena, tutta insieme.
   *
   * Le righe partono in parallelo, non una dopo l'altra: due tende che si
   * chiudono a mezzo secondo di distanza si vedono, ed è proprio quello che
   * si voleva evitare mettendole nella stessa scena.
   *
   * Poi si conta chi non ha risposto, e lo si dice con i nomi: «Tenda 1 non
   * ha risposto» è una frase su cui si può fare qualcosa, «errore» no. Se non
   * ha risposto nessuno è un guasto; se è partita a metà, la scena non si
   * riavvolge — quello che si è mosso resta mosso, e si dice cosa manca.
   */
  async run(ownerId: string, id: string): Promise<void> {
    const { scene, steps } = await store.transaction((tx) => {
      const found = new SceneRepository(tx).findById(id);
      if (!found || found.ownerId !== ownerId) throw notFound('scena inesistente');

      const devices = new DeviceRepository(tx).findAllOf(ownerId);
      const ready = found.steps
        .map((step) => ({ step, device: devices.find((one) => one.id === step.deviceId) }))
        .filter((pair): pair is { step: SceneStep; device: Device } => !!pair.device);
      return { scene: found, steps: ready };
    });

    if (!steps.length) throw badRequest(`«${scene.name}» è vuota: non c'è niente da fare`);

    const results = await Promise.allSettled(
      steps.map(({ step, device }) =>
        hub.command(device.agentId, device.externalId, step.code, step.value),
      ),
    );

    const mute = steps.filter((_pair, at) => results[at]?.status === 'rejected');
    if (!mute.length) return;

    const names = [...new Set(mute.map(({ device }) => `«${device.name}»`))].join(', ');
    throw badGateway(
      mute.length === steps.length
        ? `Non ha risposto niente di «${scene.name}»`
        : `${names}: nessuna risposta. Il resto è partito.`,
    );
  }

  /**
   * Ogni riga dev'essere possibile: il dispositivo è suo, quella cosa la sa
   * fare, e il valore ha senso. Un dispositivo può comparire più volte — una
   * lampadina che si accende e si porta al 30% sono due righe, ed è giusto.
   */
  #clean(tx: Transaction, ownerId: string, steps: SceneStepDto[]): SceneStep[] {
    const devices = new DeviceRepository(tx);

    return steps.map((step) => {
      const device = devices.findById(step.deviceId);
      if (!device || device.ownerId !== ownerId) throw badRequest('dispositivo inesistente');

      const capability = device.capabilities.find((entry) => entry.code === step.code);
      if (!capability) throw badRequest(`«${device.name}» non sa fare questa cosa`);

      const kind = typeof step.value;
      if (kind !== 'string' && kind !== 'number' && kind !== 'boolean') throw badRequest('valore non valido');
      check(capability, step.value);

      return { deviceId: step.deviceId, code: step.code, value: step.value };
    });
  }
}

export const sceneManager = new SceneManager();
