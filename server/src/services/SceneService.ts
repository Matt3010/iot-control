import type { SceneDto } from '../dto/scene.dto.js';
import type { SceneView } from '../dto/views.js';
import { toSceneView } from '../dto/views.js';
import { badGateway } from '../errors/HttpError.js';
import { hub } from '../iot/hub.js';
import { sceneManager } from '../managers/SceneManager.js';
import type { Scope } from '../types.js';

export class SceneService {
  async list(scope: Scope): Promise<SceneView[]> {
    // con quelle che stanno andando, per chi apre la pagina a metà di un'attesa
    return (await sceneManager.list(scope)).map((scene) => {
      const corre = hub.corsaDi(scene.id);
      return { ...toSceneView(scene), ...(corre ? { corre } : {}) };
    });
  }

  async create(scope: Scope, dto: SceneDto): Promise<SceneView> {
    const scene = toSceneView(await sceneManager.create(scope, dto));
    hub.changed(scope.ownerId, { kind: 'scene', id: scene.id, value: scene });
    return scene;
  }

  async update(scope: Scope, id: string, dto: SceneDto): Promise<SceneView> {
    const scene = toSceneView(await sceneManager.update(scope, id, dto));
    hub.changed(scope.ownerId, { kind: 'scene', id: scene.id, value: scene });
    return scene;
  }

  /** Tolta lei, e cambiate quelle che la chiamavano: le altre schede lo sanno tutte e due. */
  async remove(scope: Scope, id: string): Promise<void> {
    const toccate = await sceneManager.remove(scope, id);
    hub.changed(scope.ownerId, { kind: 'scene', id, value: null });
    for (const one of toccate) hub.changed(scope.ownerId, { kind: 'scene', id: one.id, value: toSceneView(one) });
  }

  /**
   * Come per un dispositivo solo: un agente che non risponde è un guasto fra
   * noi e lui, non una richiesta sbagliata.
   */
  async run(scope: Scope, id: string, who?: string): Promise<void> {
    try {
      await sceneManager.run(scope, id, who);
    } catch (error) {
      if (error instanceof Error && !('status' in error)) throw badGateway(error.message);
      throw error;
    }
  }
}

export const sceneService = new SceneService();
