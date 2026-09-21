import fs from 'node:fs/promises';
import { config, dataFile } from '../config.js';
import type { Database } from '../types.js';

const empty = (): Database => ({ categories: [], groups: [], places: [] });

/**
 * The working copy a unit of work mutates. Nothing reaches the disk until the
 * transaction commits, so throwing halfway through is a rollback.
 */
export class Transaction {
  private touched = false;

  constructor(readonly data: Database) {}

  markDirty(): void {
    this.touched = true;
  }

  get isDirty(): boolean {
    return this.touched;
  }
}

export class JsonStore {
  /** Transactions take turns: no two read-modify-writes overlap. */
  private queue: Promise<unknown> = Promise.resolve();

  async transaction<T>(work: (tx: Transaction) => Promise<T> | T): Promise<T> {
    const run = this.queue.then(async () => {
      const tx = new Transaction(await this.load());
      const result = await work(tx);
      if (tx.isDirty) await this.commit(tx.data);
      return result;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  /** Read fresh every time: the copy is private, and edits made to the file are seen. */
  private async load(): Promise<Database> {
    try {
      const parsed = JSON.parse(await fs.readFile(dataFile, 'utf8')) as Partial<Database>;
      return {
        categories: Array.isArray(parsed.categories) ? parsed.categories : [],
        groups: Array.isArray(parsed.groups) ? parsed.groups : [],
        places: Array.isArray(parsed.places) ? parsed.places : [],
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      await this.commit(empty());
      return empty();
    }
  }

  /** Written to a neighbour and renamed, so a crash cannot leave half a file. */
  private async commit(data: Database): Promise<void> {
    await fs.mkdir(config.dataDir, { recursive: true });
    const scratch = `${dataFile}.tmp`;
    await fs.writeFile(scratch, JSON.stringify(data, null, 2), 'utf8');
    await fs.rename(scratch, dataFile);
  }
}

export const store = new JsonStore();
