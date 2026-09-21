import { api } from './api';
import { DEFAULT_EMOJI, SUGGESTED } from './format';
import { readJSON, writeJSON } from './storage';
import { toast, UNDO_MS } from './toast.svelte';
import type { Category, Draft, Group, LocalPlace, Place, PlaceMap, Snapshot } from './types';

const withKey = (place: Place): LocalPlace => ({ ...place, key: crypto.randomUUID() });

/** What the server is allowed to see of a place. */
const placePayload = (mapId: string, draft: Required<Pick<Draft, 'lat' | 'lng'>> & Partial<Draft>) => ({
  mapId,
  name: draft.name ?? '',
  note: draft.note ?? '',
  categoryId: draft.categoryId ?? '',
  groupIds: draft.groupIds ?? [],
  lat: draft.lat,
  lng: draft.lng,
  private: draft.private ?? false,
});

interface PendingDelete {
  commit: (options?: RequestInit) => void;
}

class Store {
  maps = $state<PlaceMap[]>([]);
  /** Quale mappa stai guardando: è una scelta di questo browser. */
  activeMapId = $state<string | null>(readJSON('pi.map', null));
  categories = $state<Category[]>([]);
  groups = $state<Group[]>([]);
  places = $state<LocalPlace[]>([]);

  /** True until the first snapshot lands: the panel must not claim "zero". */
  loading = $state(true);

  /** Per-browser view preferences, not server state. */
  hiddenCategories = $state<string[]>(readJSON('pi.hidden', []));
  activeGroup = $state<string | null>(readJSON('pi.group', null));

  /** Deletes shown as done but not yet sent, so "Annulla" costs nothing. */
  #pending = new Set<PendingDelete>();

  constructor() {
    // Leaving the page confirms whatever is still waiting: the UI already said it was gone.
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', () => {
        for (const entry of this.#pending) entry.commit({ keepalive: true });
        this.#pending.clear();
      });
    }
  }

  /* ------------------------------------------------------------------ maps */

  get activeMap(): PlaceMap | undefined {
    return this.maps.find((map) => map.id === this.activeMapId) ?? this.maps[0];
  }

  /** Gruppi e posti della mappa aperta: il resto esiste, ma non adesso. */
  get currentGroups(): Group[] {
    return this.groups.filter((group) => group.mapId === this.activeMap?.id);
  }

  get currentPlaces(): LocalPlace[] {
    return this.places.filter((place) => place.mapId === this.activeMap?.id);
  }

  openMap(id: string): void {
    this.activeMapId = id;
    writeJSON('pi.map', id);
    this.setGroup(null);
  }

  async createMap(name: string): Promise<PlaceMap> {
    const created = await api.post<PlaceMap>('/maps', { name });
    this.maps.push(created);
    this.openMap(created.id);
    return created;
  }

  async patchMap(map: PlaceMap, patch: { name?: string; slug?: string; published?: boolean }): Promise<void> {
    const before = { ...map };
    Object.assign(map, patch);
    try {
      Object.assign(map, await api.put<PlaceMap>(`/maps/${map.id}`, { name: map.name, ...patch }));
    } catch (error) {
      Object.assign(map, before);
      toast.show((error as Error).message);
    }
  }

  /** Una mappa si porta via i suoi gruppi e i suoi posti: l'undo li rimette. */
  deleteMap(map: PlaceMap): void {
    if (this.maps.length <= 1) {
      toast.show('Una mappa deve restare');
      return;
    }

    const index = this.maps.indexOf(map);
    const groups = this.groups.filter((group) => group.mapId === map.id);
    const places = this.places.filter((place) => place.mapId === map.id);

    this.maps.splice(index, 1);
    this.groups = this.groups.filter((group) => group.mapId !== map.id);
    this.places = this.places.filter((place) => place.mapId !== map.id);
    if (this.activeMap) this.openMap(this.activeMap.id);

    const cancel = this.#defer((options) => api.delete(`/maps/${map.id}`, options).catch(() => undefined));

    toast.show(places.length ? `"${map.name}" e ${places.length} posti eliminati` : `"${map.name}" eliminata`, {
      label: 'Annulla',
      run: () => {
        cancel();
        this.maps.splice(index, 0, map);
        this.groups = [...this.groups, ...groups];
        this.places = [...this.places, ...places];
        this.openMap(map.id);
      },
    });
  }

  /* ----------------------------------------------------------------- reads */

  categoryOf(id: string): Category | undefined {
    return this.categories.find((category) => category.id === id);
  }

  groupOf(id: string): Group | undefined {
    return this.groups.find((group) => group.id === id);
  }

  inScope(place: Place): boolean {
    return !this.activeGroup || place.groupIds.includes(this.activeGroup);
  }

  /** Tre domande in una: è di questa mappa, la sua categoria è accesa, è nel gruppo scelto? */
  visible(place: Place): boolean {
    return (
      place.mapId === this.activeMap?.id &&
      !this.hiddenCategories.includes(place.categoryId) &&
      this.inScope(place)
    );
  }

  countIn(categoryId: string): number {
    return this.currentPlaces.filter((place) => place.categoryId === categoryId && this.inScope(place)).length;
  }

  countGroup(groupId: string): number {
    return this.currentPlaces.filter((place) => place.groupIds.includes(groupId)).length;
  }

  async load(): Promise<void> {
    try {
      const snapshot = await api.get<Snapshot>('/state');
      this.maps = snapshot.maps ?? [];
      this.categories = snapshot.categories;
      this.groups = snapshot.groups ?? [];
      this.places = snapshot.places.map(withKey);

      // la mappa scelta l'altra volta potrebbe non esserci più
      if (!this.maps.some((map) => map.id === this.activeMapId)) {
        this.activeMapId = this.maps[0]?.id ?? null;
        writeJSON('pi.map', this.activeMapId);
      }
    } finally {
      this.loading = false;
    }
  }

  /* ---------------------------------------------------------------- filters */

  toggleCategory(id: string): void {
    this.hiddenCategories = this.hiddenCategories.includes(id)
      ? this.hiddenCategories.filter((hidden) => hidden !== id)
      : [...this.hiddenCategories, id];
    writeJSON('pi.hidden', this.hiddenCategories);
  }

  /** Tutte o nessuna: con trenta categorie spegnerle a una a una non è un lavoro. */
  showAllCategories(): void {
    this.hiddenCategories = [];
    writeJSON('pi.hidden', this.hiddenCategories);
  }

  hideAllCategories(): void {
    this.hiddenCategories = this.categories.map((category) => category.id);
    writeJSON('pi.hidden', this.hiddenCategories);
  }

  setGroup(id: string | null): void {
    this.activeGroup = id;
    writeJSON('pi.group', id);
  }

  /** Whatever is hiding this place, stop hiding it. */
  reveal(place: Place): void {
    if (this.hiddenCategories.includes(place.categoryId)) this.toggleCategory(place.categoryId);
    if (this.activeGroup && !place.groupIds.includes(this.activeGroup)) this.setGroup(null);
  }

  /* ----------------------------------------------- deletes, with a way back */

  #defer(commit: (options?: RequestInit) => void): () => void {
    const entry: PendingDelete = { commit };
    this.#pending.add(entry);
    const timer = setTimeout(() => {
      this.#pending.delete(entry);
      commit();
    }, UNDO_MS);

    return () => {
      clearTimeout(timer);
      this.#pending.delete(entry);
    };
  }

  /* ------------------------------------------------------------- categories */

  async createCategory(name: string, emoji: string, color: string): Promise<Category> {
    // Awaited, not optimistic: a place cannot be saved against a category id
    // the server has never seen.
    const created = await api.post<Category>('/categories', {
      name,
      emoji: emoji || DEFAULT_EMOJI,
      color: color || SUGGESTED[0]!,
    });
    this.categories.push(created);
    return created;
  }

  /** Category edits are safe to apply first: the id never changes. */
  async patchCategory(category: Category, patch: Partial<Category>): Promise<void> {
    const before = { ...category };
    Object.assign(category, patch);
    try {
      Object.assign(category, await api.put<Category>(`/categories/${category.id}`, patch));
    } catch (error) {
      Object.assign(category, before);
      toast.show((error as Error).message);
    }
  }

  deleteCategory(category: Category): void {
    const index = this.categories.indexOf(category);
    const orphans = this.places.filter((place) => place.categoryId === category.id);
    this.categories.splice(index, 1);
    this.places = this.places.filter((place) => place.categoryId !== category.id);

    const cancel = this.#defer((options) =>
      api.delete(`/categories/${category.id}`, options).catch(() => undefined),
    );

    const swept = orphans.length === 1 ? 'un posto' : `${orphans.length} posti`;
    toast.show(
      orphans.length ? `"${category.name}" e ${swept} eliminati` : `"${category.name}" eliminata`,
      {
        label: 'Annulla',
        run: () => {
          cancel();
          this.categories.splice(index, 0, category);
          this.places = [...this.places, ...orphans];
        },
      },
    );
  }

  /* ----------------------------------------------------------------- groups */

  async createGroup(name: string): Promise<Group> {
    const created = await api.post<Group>('/groups', { name, mapId: this.activeMap?.id });
    this.groups.push(created);
    return created;
  }

  async patchGroup(group: Group, patch: Partial<Group>): Promise<void> {
    const before = { ...group };
    Object.assign(group, patch);
    try {
      Object.assign(group, await api.put<Group>(`/groups/${group.id}`, patch));
    } catch (error) {
      Object.assign(group, before);
      toast.show((error as Error).message);
    }
  }

  /** A group is a label: deleting it leaves its places, minus that one label. */
  deleteGroup(group: Group): void {
    const index = this.groups.indexOf(group);
    const members = this.places.filter((place) => place.groupIds.includes(group.id));
    this.groups.splice(index, 1);
    for (const place of members) place.groupIds = place.groupIds.filter((id) => id !== group.id);
    if (this.activeGroup === group.id) this.setGroup(null);

    const cancel = this.#defer((options) =>
      api.delete(`/groups/${group.id}`, options).catch(() => undefined),
    );

    const freed = members.length === 1 ? 'un posto resta' : `${members.length} posti restano`;
    toast.show(members.length ? `"${group.name}" sciolto, ${freed}` : `"${group.name}" eliminato`,
      {
        label: 'Annulla',
        run: () => {
          cancel();
          this.groups.splice(index, 0, group);
          for (const place of members) place.groupIds = [...place.groupIds, group.id];
        },
      },
    );
  }

  /* ----------------------------------------------------------------- places */

  /** Shown immediately; the server's answer replaces it in place. */
  async savePlace(draft: Draft): Promise<void> {
    const mapId = this.activeMap?.id ?? '';
    const payload = placePayload(mapId, draft);
    const existing = draft.key ? this.places.find((place) => place.key === draft.key) : undefined;

    if (existing) {
      const before = { ...existing };
      Object.assign(existing, payload);
      try {
        Object.assign(existing, await api.put<Place>(`/places/${existing.id}`, payload));
      } catch (error) {
        Object.assign(existing, before);
        toast.show((error as Error).message);
      }
      return;
    }

    const optimistic: LocalPlace = {
      ...payload,
      id: `tmp-${crypto.randomUUID()}`,
      createdAt: new Date().toISOString(),
      key: crypto.randomUUID(),
    };
    this.places.push(optimistic);

    try {
      Object.assign(optimistic, await api.post<Place>('/places', payload));
    } catch (error) {
      const index = this.places.indexOf(optimistic);
      if (index >= 0) this.places.splice(index, 1);
      toast.show((error as Error).message);
    }
  }

  deletePlace(place: LocalPlace): void {
    const index = this.places.indexOf(place);
    if (index < 0) return;
    this.places.splice(index, 1);

    const cancel = this.#defer((options) =>
      api.delete(`/places/${place.id}`, options).catch(() => undefined),
    );

    toast.show(`"${place.name}" eliminato`, {
      label: 'Annulla',
      run: () => {
        cancel();
        this.places.splice(index, 0, place);
      },
    });
  }
}

export const store = new Store();
