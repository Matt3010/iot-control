import { randomUUID } from 'node:crypto';
import type { Transaction } from '../persistence/JsonStore.js';
import type { Scene } from '../types.js';

export class SceneRepository {
  constructor(private readonly tx: Transaction) {}

  /** Gli insiemi sono di chi li ha fatti, come gli agenti. */
  findAllOf(ownerId: string): Scene[] {
    return this.tx.data.scenes.filter((scene) => scene.ownerId === ownerId);
  }

  findById(id: string): Scene | undefined {
    return this.tx.data.scenes.find((scene) => scene.id === id);
  }

  owns(ownerId: string, id: string): boolean {
    return this.findById(id)?.ownerId === ownerId;
  }

  insert(ownerId: string, name: string, deviceIds: string[]): Scene {
    const scene: Scene = { id: `ins-${randomUUID()}`, ownerId, name, deviceIds };
    this.tx.data.scenes.push(scene);
    this.tx.markDirty();
    return scene;
  }

  update(id: string, patch: Partial<Pick<Scene, 'name' | 'deviceIds'>>): Scene | undefined {
    const current = this.findById(id);
    if (!current) return undefined;
    Object.assign(current, patch);
    this.tx.markDirty();
    return current;
  }

  delete(id: string): boolean {
    const at = this.tx.data.scenes.findIndex((scene) => scene.id === id);
    if (at < 0) return false;
    this.tx.data.scenes.splice(at, 1);
    this.tx.markDirty();
    return true;
  }

  /**
   * Un dispositivo che non esiste più esce dagli insiemi che lo tenevano.
   *
   * Succede quando un agente smette di raccontarlo — l'hai staccato, l'hai
   * tolto da Home Assistant. Lasciarcelo dentro vorrebbe dire un insieme che
   * prova a comandare un fantasma, e non si capirebbe perché non va.
   *
   * Torna quanti insiemi ne hanno risentito.
   */
  pruneDevices(gone: Set<string>): number {
    let touched = 0;
    for (const scene of this.tx.data.scenes) {
      const kept = scene.deviceIds.filter((id) => !gone.has(id));
      if (kept.length === scene.deviceIds.length) continue;
      scene.deviceIds = kept;
      touched += 1;
    }
    if (touched) this.tx.markDirty();
    return touched;
  }
}
