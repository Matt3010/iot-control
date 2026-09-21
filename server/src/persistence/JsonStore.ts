import fs from 'node:fs/promises';
import { config, dataFile } from '../config.js';
import { randomUUID } from 'node:crypto';
import type { Category, Database, Group, Place, PlaceMap } from '../types.js';

/** Un posto scritto quando poteva stare in un gruppo solo. */
function migratePlace(place: Place & { groupId?: string }): Place {
  if (Array.isArray(place.groupIds)) return place;
  const { groupId, ...rest } = place;
  return { ...rest, groupIds: groupId ? [groupId] : [] };
}

/**
 * Dati scritti quando l'indice era uno solo: diventano la prima mappa del
 * primo che si era registrato, e le categorie passano a lui.
 */
function migrateToMaps(data: Database): Database {
  const orphans =
    data.places.some((place) => !place.mapId) ||
    data.groups.some((group) => !group.mapId) ||
    data.categories.some((category) => !category.ownerId);
  if (!orphans) return data;

  const owner = data.users[0]?.id ?? '';
  const first: PlaceMap = data.maps[0] ?? {
    id: `map-${randomUUID()}`,
    ownerId: owner,
    name: 'La mia mappa',
    createdAt: new Date().toISOString(),
  };

  return {
    users: data.users,
    maps: data.maps.length ? data.maps : [first],
    categories: data.categories.map((category: Category) => ({ ...category, ownerId: category.ownerId ?? owner })),
    groups: data.groups.map((group: Group) => ({ ...group, mapId: group.mapId ?? first.id })),
    places: data.places.map((place: Place) => ({ ...place, mapId: place.mapId ?? first.id })),
  };
}

const empty = (): Database => ({ users: [], maps: [], categories: [], groups: [], places: [] });

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
      return migrateToMaps({
        users: Array.isArray(parsed.users) ? parsed.users : [],
        maps: Array.isArray(parsed.maps) ? parsed.maps : [],
        categories: Array.isArray(parsed.categories) ? parsed.categories : [],
        groups: Array.isArray(parsed.groups) ? parsed.groups : [],
        places: Array.isArray(parsed.places) ? parsed.places.map(migratePlace) : [],
      });
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
