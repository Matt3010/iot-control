import fs from 'node:fs/promises';
import { config, dataFile } from '../config.js';
import { randomUUID } from 'node:crypto';
import { slugify, uniqueSlug } from '../auth/slug.js';
import type { Category, Database, Group, Place, PlaceMap, User } from '../types.js';

/** Chi si era registrato prima che esistessero i link pubblici. */
function migrateHandles(users: User[]): User[] {
  const taken = new Set(users.map((user) => user.handle).filter(Boolean));
  return users.map((user) => {
    const counted = {
      ...user,
      profileViews: user.profileViews ?? 0,
      profileFollowed: user.profileFollowed ?? 0,
    };
    if (counted.handle) return counted;
    const handle = uniqueSlug(user.email.split('@')[0] ?? 'io', (candidate) => taken.has(candidate));
    taken.add(handle);
    return { ...counted, handle };
  });
}

/** Mappe nate prima che si potessero pubblicare. Lo slug basta sia tuo. */
function migrateSlugs(maps: PlaceMap[]): PlaceMap[] {
  const key = (ownerId: string, slug: string) => `${ownerId}/${slug}`;
  const taken = new Set(maps.filter((map) => map.slug).map((map) => key(map.ownerId, map.slug)));
  return maps.map((map) => {
    const counted = {
      ...map,
      published: map.published ?? false,
      views: map.views ?? 0,
      viewsFromProfile: map.viewsFromProfile ?? 0,
    };
    if (counted.slug) return counted;
    const slug = uniqueSlug(slugify(map.name), (candidate) => taken.has(key(map.ownerId, candidate)));
    taken.add(key(map.ownerId, slug));
    return { ...counted, slug };
  });
}

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
    slug: 'la-mia-mappa',
    published: false,
    views: 0,
    viewsFromProfile: 0,
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
        users: migrateHandles(Array.isArray(parsed.users) ? parsed.users : []),
        maps: migrateSlugs(Array.isArray(parsed.maps) ? parsed.maps : []),
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
