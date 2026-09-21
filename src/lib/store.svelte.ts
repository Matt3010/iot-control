import { api } from './api';
import { COLORS, DEFAULT_EMOJI } from './format';
import { readJSON, writeJSON } from './storage';
import { toast, UNDO_MS } from './toast.svelte';
import type { Category, Draft, Group, LocalPlace, Place, Snapshot } from './types';

const withKey = (place: Place): LocalPlace => ({ ...place, key: crypto.randomUUID() });

/** What the server is allowed to see of a place. */
const placePayload = (draft: Required<Pick<Draft, 'lat' | 'lng'>> & Partial<Draft>) => ({
  name: draft.name ?? '',
  note: draft.note ?? '',
  categoryId: draft.categoryId ?? '',
  groupId: draft.groupId ?? '',
  lat: draft.lat,
  lng: draft.lng,
});

interface PendingDelete {
  commit: (options?: RequestInit) => void;
}

class Store {
  categories = $state<Category[]>([]);
  groups = $state<Group[]>([]);
  places = $state<LocalPlace[]>([]);

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

  /* ----------------------------------------------------------------- reads */

  categoryOf(id: string): Category | undefined {
    return this.categories.find((category) => category.id === id);
  }

  groupOf(id: string): Group | undefined {
    return this.groups.find((group) => group.id === id);
  }

  colorOf(place: Place): string {
    return this.categoryOf(place.categoryId)?.color ?? '#6b7280';
  }

  inScope(place: Place): boolean {
    return !this.activeGroup || place.groupId === this.activeGroup;
  }

  /** Two filters, one question: is this place on the map right now? */
  visible(place: Place): boolean {
    return !this.hiddenCategories.includes(place.categoryId) && this.inScope(place);
  }

  countIn(categoryId: string): number {
    return this.places.filter((place) => place.categoryId === categoryId && this.inScope(place)).length;
  }

  countGroup(groupId: string): number {
    return this.places.filter((place) => place.groupId === groupId).length;
  }

  async load(): Promise<void> {
    const snapshot = await api.get<Snapshot>('/state');
    this.categories = snapshot.categories;
    this.groups = snapshot.groups ?? [];
    this.places = snapshot.places.map(withKey);
  }

  /* ---------------------------------------------------------------- filters */

  toggleCategory(id: string): void {
    this.hiddenCategories = this.hiddenCategories.includes(id)
      ? this.hiddenCategories.filter((hidden) => hidden !== id)
      : [...this.hiddenCategories, id];
    writeJSON('pi.hidden', this.hiddenCategories);
  }

  setGroup(id: string | null): void {
    this.activeGroup = id;
    writeJSON('pi.group', id);
  }

  /** Whatever is hiding this place, stop hiding it. */
  reveal(place: Place): void {
    if (this.hiddenCategories.includes(place.categoryId)) this.toggleCategory(place.categoryId);
    if (this.activeGroup && place.groupId !== this.activeGroup) this.setGroup(null);
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
      color: color || COLORS[0],
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
    const created = await api.post<Group>('/groups', { name });
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

  /** A group is a label: deleting it leaves its places behind, unlabelled. */
  deleteGroup(group: Group): void {
    const index = this.groups.indexOf(group);
    const members = this.places.filter((place) => place.groupId === group.id);
    this.groups.splice(index, 1);
    for (const place of members) place.groupId = '';
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
          for (const place of members) place.groupId = group.id;
        },
      },
    );
  }

  /* ----------------------------------------------------------------- places */

  /** Shown immediately; the server's answer replaces it in place. */
  async savePlace(draft: Draft): Promise<void> {
    const payload = placePayload(draft);
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
