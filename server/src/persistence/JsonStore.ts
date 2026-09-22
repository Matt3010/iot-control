import fs from 'node:fs/promises';
import { config, dataFile } from '../config.js';
import { randomUUID } from 'node:crypto';
import { slugify, uniqueSlug } from '../auth/slug.js';
import type {
  Agent,
  Category,
  Database,
  Device,
  Group,
  MapEditor,
  Place,
  PlaceMap,
  Scene,
  User,
} from '../types.js';

/** Chi si era registrato prima che esistessero i link pubblici. */
function migrateHandles(users: User[]): User[] {
  const taken = new Set(users.map((user) => user.handle).filter(Boolean));
  return users.map((user) => {
    const counted = {
      ...user,
      profileViews: user.profileViews ?? 0,
      profileViewers: user.profileViewers ?? 0,
      profileFollowed: user.profileFollowed ?? 0,
    };
    if (counted.handle) return counted;
    const handle = uniqueSlug(user.email.split('@')[0] ?? 'io', (candidate) => taken.has(candidate));
    taken.add(handle);
    return { ...counted, handle };
  });
}

/**
 * Le prime scene tenevano un elenco di dispositivi e le azioni che avevano in
 * comune. Adesso tengono delle righe, e ogni riga ha la sua azione: da un
 * elenco di nomi non si ricava quale — «Tende» non dice se apre o chiude.
 * Quindi la scena resta, con il suo nome, e vuota: si riscrive in due clic, e
 * indovinare avrebbe voluto dire far partire qualcosa che nessuno ha chiesto.
 */
function migrateScene(scene: Scene & { deviceIds?: string[] }): Scene {
  const { deviceIds: _vecchi, ...rest } = scene;
  return { ...rest, steps: Array.isArray(scene.steps) ? scene.steps : [] };
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
      viewers: map.viewers ?? 0,
      viewsFromProfile: map.viewsFromProfile ?? 0,
      // mappe nate prima che si potessero tenere in due: nessuno ha la chiave.
      // E le prime chiavi erano solo indirizzi, senza regole: valevano per
      // tutta la mappa, che e' esattamente un editor senza `only`.
      editors: Array.isArray(map.editors)
        ? map.editors.map((editor) =>
            typeof editor === 'string' ? { email: editor } : (editor as MapEditor),
          )
        : [],
    };
    if (counted.slug) return counted;
    const slug = uniqueSlug(slugify(map.name), (candidate) => taken.has(key(map.ownerId, candidate)));
    taken.add(key(map.ownerId, slug));
    return { ...counted, slug };
  });
}

/**
 * Un luogo scritto quando poteva stare in un gruppo solo, o quando di agenti
 * ne teneva uno solo. Le due cose sono indipendenti: si sistemano entrambe.
 */
function migratePlace(place: Place & { groupId?: string; agentId?: string; locked?: boolean }): Place {
  // `locked` era l'interruttore per pin: adesso le regole stanno sulla persona,
  // e quel campo non lo legge più nessuno. Si toglie, invece di restare lì a
  // far credere a chi apre il file che significhi ancora qualcosa.
  const { groupId, agentId, locked, ...rest } = place;
  return {
    ...rest,
    groupIds: Array.isArray(place.groupIds) ? place.groupIds : groupId ? [groupId] : [],
    agentIds: Array.isArray(place.agentIds) ? place.agentIds : agentId ? [agentId] : [],
  };
}

/**
 * Dati scritti quando l'indice era uno solo: diventano la prima mappa del
 * primo che si era registrato, e le categorie passano a lui. I gruppi, che per
 * un po' sono stati di una mappa, passano a chi quella mappa ce l'aveva.
 */
function migrateToMaps(data: Database): Database {
  const orphans =
    data.places.some((place) => !place.mapId) ||
    data.groups.some((group) => !group.ownerId) ||
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
    viewers: 0,
    viewsFromProfile: 0,
    createdAt: new Date().toISOString(),
  };

  return {
    users: data.users,
    agents: data.agents,
    devices: data.devices,
    scenes: data.scenes,
    log: data.log,
    maps: data.maps.length ? data.maps : [first],
    categories: data.categories.map((category: Category) => ({ ...category, ownerId: category.ownerId ?? owner })),
    groups: data.groups.map((group: Group & { mapId?: string }) => {
      const { mapId, ...rest } = group;
      const casa = data.maps.find((map) => map.id === mapId);
      return { ...rest, ownerId: group.ownerId ?? casa?.ownerId ?? owner };
    }),
    places: data.places.map((place: Place) => ({ ...place, mapId: place.mapId ?? first.id })),
  };
}

const empty = (): Database => ({
  users: [],
  maps: [],
  categories: [],
  groups: [],
  places: [],
  agents: [],
  devices: [],
  scenes: [],
  log: [],
});

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
        // le scene sono arrivate dopo: chi non le ha non ne ha
        scenes: Array.isArray(parsed.scenes) ? parsed.scenes.map(migrateScene) : [],
        // e il registro pure: si riempie da solo, da adesso in avanti
        log: Array.isArray(parsed.log) ? parsed.log : [],
        places: Array.isArray(parsed.places) ? parsed.places.map(migratePlace) : [],
        // Chi aveva l'indice prima che gli agenti esistessero: niente agenti, niente dispositivi.
        agents: Array.isArray(parsed.agents) ? parsed.agents : [],
        devices: Array.isArray(parsed.devices) ? parsed.devices : [],
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
