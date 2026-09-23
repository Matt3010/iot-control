import { randomUUID } from 'node:crypto';
import type { Transaction } from '../persistence/JsonStore.js';
import type { Scene, SceneStep } from '../types.js';

export class SceneRepository {
  constructor(private readonly tx: Transaction) {}

  /** Le scene sono di chi le ha fatte, come gli agenti. */
  findAllOf(ownerId: string): Scene[] {
    return this.tx.data.scenes.filter((scene) => scene.ownerId === ownerId);
  }

  findById(id: string): Scene | undefined {
    return this.tx.data.scenes.find((scene) => scene.id === id);
  }

  owns(ownerId: string, id: string): boolean {
    return this.findById(id)?.ownerId === ownerId;
  }

  insert(ownerId: string, name: string, steps: SceneStep[]): Scene {
    const scene: Scene = { id: `scn-${randomUUID()}`, ownerId, name, steps };
    this.tx.data.scenes.push(scene);
    this.tx.markDirty();
    return scene;
  }

  update(id: string, patch: Partial<Pick<Scene, 'name' | 'steps' | 'when'>>): Scene | undefined {
    const current = this.findById(id);
    if (!current) return undefined;
    Object.assign(current, patch);
    this.tx.markDirty();
    return current;
  }

  /**
   * Si prende il turno di questo minuto, se nessuno l'ha gia' preso.
   *
   * L'orologio non esegue mai di sua iniziativa: prima scrive che quella
   * scena e' partita in quel minuto, e solo se la scrittura ha vinto la fa
   * partire davvero. Oggi vince sempre, perche' il processo e' uno; domani,
   * con un archivio condiviso, la stessa riga diventa la gara fra due server
   * senza che l'orologio debba saperne niente.
   */
  claim(id: string, minute: string): boolean {
    const scene = this.findById(id);
    if (!scene || scene.lastRunAt === minute) return false;

    scene.lastRunAt = minute;
    this.tx.markDirty();
    return true;
  }

  delete(id: string): boolean {
    const at = this.tx.data.scenes.findIndex((scene) => scene.id === id);
    if (at < 0) return false;
    this.tx.data.scenes.splice(at, 1);
    this.tx.markDirty();
    return true;
  }

  /**
   * Un dispositivo che non esiste più si porta via le righe che lo nominavano.
   *
   * Succede quando un agente smette di raccontarlo — l'hai staccato, l'hai
   * tolto da Home Assistant. Lasciarle lì vorrebbe dire una scena che prova a
   * comandare un fantasma, e non si capirebbe perché non parte.
   *
   * Torna quante scene ne hanno risentito.
   */
  pruneDevices(gone: Set<string>): number {
    let touched = 0;
    for (const scene of this.tx.data.scenes) {
      const kept = scene.steps.filter((step) => !gone.has(step.deviceId));
      if (kept.length === scene.steps.length) continue;
      scene.steps = kept;
      touched += 1;
    }
    if (touched) this.tx.markDirty();
    return touched;
  }
}
