import { rimpiazza, ritira } from './rimpiazza';
import { api } from './api';
import { DEFAULT_MARK, SUGGESTED } from './format';
import { forgetJSON, readJSON, writeJSON } from './storage';
import { toast, UNDO_MS } from './toast.svelte';
import type { Category, Draft, Group, LocalPlace, Place, PlaceMap, Snapshot } from './types';

/** Quello che il filo aperto racconta di cambiato. `null` vuol dire sparito. */
type LiveChange =
  | { kind: 'place'; id: string; value: Place | null }
  | { kind: 'map'; id: string; value: PlaceMap | null }
  | { kind: 'category'; id: string; value: Category | null }
  | { kind: 'group'; id: string; value: Group | null };

/**
 * Un luogo con la sua chiave del browser.
 *
 * Quella di un luogo già noto resta la sua. La chiave è quello che tiene
 * attaccati il pin e la scheda aperta al loro luogo, e ogni rilettura — a
 * ogni ritorno della rete — ne inventava una nuova: la scheda non trovava
 * più il suo luogo, si chiudeva, e quello che ci avevi scritto se ne andava.
 */
const withKey = (place: Place, known?: Map<string, string>): LocalPlace => ({
  ...place,
  key: known?.get(place.id) ?? crypto.randomUUID(),
});

/** «un luogo», «3 luoghi»: con uno solo il numero si legge male. */
const luoghi = (quanti: number): string => (quanti === 1 ? 'un luogo' : `${quanti} luoghi`);

/**
 * Mettere nell'elenco una cosa che il server ha confermato, senza farne due.
 *
 * Il filo aperto porta anche le modifiche nostre: se l'evento arriva prima
 * della risposta — e succede, sono due strade diverse per la stessa rete — la
 * cosa è già dentro. Chi arriva secondo non aggiunge: sovrascrive.
 */
function absorb<T extends { id: string }>(list: T[], fresh: T): T {
  const at = list.findIndex((one) => one.id === fresh.id);
  if (at >= 0) {
    rimpiazza(list[at]!, fresh);
    return list[at]!;
  }
  list.push(fresh);
  return fresh;
}

/** What the server is allowed to see of a place. */
const placePayload = (mapId: string, draft: Required<Pick<Draft, 'lat' | 'lng'>> & Partial<Draft>) => ({
  mapId,
  name: draft.name ?? '',
  note: draft.note ?? '',
  categoryId: draft.categoryId ?? '',
  groupIds: draft.groupIds ?? [],
  lat: draft.lat,
  lng: draft.lng,
  agentIds: draft.agentIds ?? [],
});

interface PendingDelete {
  commit: (options?: RequestInit) => Promise<unknown>;
}

class Store {
  maps = $state<PlaceMap[]>([]);
  /** Quella selezionata: dove finisce quello che aggiungi. Scelta di questo browser. */
  activeMapId = $state<string | null>(readJSON('pi.map', null));
  /** Le altre accese accanto: si vedono, ma non è lì che stai scrivendo. */
  extraMapIds = $state<string[]>(readJSON('pi.maps', []));
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
        // la pagina se ne va: a un rifiuto non c'è più nessuno a cui dirlo
        for (const entry of this.#pending) entry.commit({ keepalive: true }).catch(() => undefined);
        this.#pending.clear();
      });
    }
  }

  /* ------------------------------------------------------------------ maps */

  get activeMap(): PlaceMap | undefined {
    return this.maps.find((map) => map.id === this.activeMapId) ?? this.maps[0];
  }

  /** Tutte quelle accese, nell'ordine in cui stanno nell'elenco. */
  get shownMaps(): PlaceMap[] {
    return this.maps.filter((map) => this.shows(map.id));
  }

  shows(id: string): boolean {
    return id === this.activeMap?.id || this.extraMapIds.includes(id);
  }

  /**
   * I gruppi sono tuoi e valgono su tutte le mappe: qui restano quelli che
   * hanno almeno un posto fra quelli che stai guardando, se no l'elenco si
   * riempirebbe di nomi che adesso non tagliano niente.
   */
  get currentGroups(): Group[] {
    const usati = new Set(this.currentPlaces.flatMap((place) => place.groupIds));
    return this.groups.filter((group) => usati.has(group.id));
  }

  get currentPlaces(): LocalPlace[] {
    return this.places.filter((place) => this.shows(place.mapId));
  }

  /** Sceglierne una vuol dire guardare solo quella, e scrivere lì dentro. */
  openMap(id: string): void {
    this.activeMapId = id;
    this.extraMapIds = [];
    writeJSON('pi.map', id);
    writeJSON('pi.maps', []);
    this.setGroup(null);
  }

  /** Accendere una mappa accanto: quella selezionata resta, e non si spegne. */
  toggleShown(id: string): void {
    if (id === this.activeMap?.id) return;
    this.extraMapIds = this.extraMapIds.includes(id)
      ? this.extraMapIds.filter((other) => other !== id)
      : [...this.extraMapIds, id];
    writeJSON('pi.maps', this.extraMapIds);
    // un gruppo si vede se qualcosa ci sta dentro: cambiando cosa guardi può
    // restare senza posti, e allora smette di essere un filtro
    // un gruppo scelto resta scelto anche se è vuoto: sparisce solo quando
    // sparisce lui, non quando non ha ancora niente dentro
    if (this.activeGroup && !this.groups.some((group) => group.id === this.activeGroup)) {
      this.setGroup(null);
    }
  }

  /** Solo le mappe, per rileggere i conteggi senza ricaricare tutto l'indice. */
  async refreshMaps(): Promise<void> {
    const fresh = await api.get<PlaceMap[]>('/maps').catch(() => null);
    if (fresh) this.maps = fresh;
  }

  async createMap(name: string): Promise<PlaceMap> {
    const created = absorb(this.maps, await api.post<PlaceMap>('/maps', { name }));
    this.openMap(created.id);
    return created;
  }

  async patchMap(map: PlaceMap, patch: { name?: string }): Promise<void> {
    const before = { ...map };
    Object.assign(map, patch);
    try {
      rimpiazza(map, await api.put<PlaceMap>(`/maps/${map.id}`, { name: map.name, ...patch }));
    } catch (error) {
      ritira(map, patch, before);
      toast.show((error as Error).message);
    }
  }

  /**
   * Un link d'invito nuovo. Torna il link completo, che il server fa vedere
   * una volta sola: chi lo perde ne crea un altro.
   */
  async invite(map: PlaceMap, label: string): Promise<string> {
    const { map: dopo, link } = await api.post<{ map: PlaceMap; link: string }>(`/maps/${map.id}/invites`, { label });
    rimpiazza(map, dopo);
    return link;
  }

  /** Chi può modificare una mappa: un invito revocato, un editor ristretto o tolto. Torna la mappa com'è dopo. */
  async share(map: PlaceMap, cosa: { revoke: string } | { restrict: string; only: string[] | null } | { drop: string }): Promise<void> {
    try {
      const dopo =
        'revoke' in cosa
          ? await api.delete<PlaceMap>(`/maps/${map.id}/invites/${cosa.revoke}`)
          : 'restrict' in cosa
            ? await api.put<PlaceMap>(`/maps/${map.id}/editors/${cosa.restrict}`, { only: cosa.only })
            : await api.delete<PlaceMap>(`/maps/${map.id}/editors/${cosa.drop}`);
      rimpiazza(map, dopo);
    } catch (error) {
      toast.show((error as Error).message);
    }
  }

  /** Una mappa si porta via i suoi posti, e nient'altro: l'undo li rimette. */
  deleteMap(map: PlaceMap): void {
    if (this.maps.length <= 1) {
      toast.show('Non puoi eliminare la tua unica mappa');
      return;
    }

    const index = this.maps.indexOf(map);
    const places = this.places.filter((place) => place.mapId === map.id);
    // annullare deve riportare la schermata com'era, comprese le mappe accese
    const wasActive = this.activeMapId;
    const wasExtra = [...this.extraMapIds];

    // se ne va la mappa e se ne vanno i suoi posti: i gruppi sono tuoi e restano
    this.maps.splice(index, 1);
    this.places = this.places.filter((place) => place.mapId !== map.id);
    this.#forget(map.id);
    if (this.activeMap && this.activeMapId !== this.activeMap.id) {
      this.activeMapId = this.activeMap.id;
      writeJSON('pi.map', this.activeMapId);
    }

    const rimetti = () => {
      if (!this.maps.some((one) => one.id === map.id)) this.maps.splice(Math.min(index, this.maps.length), 0, map);
      this.places = [...this.places, ...places];
      this.activeMapId = wasActive;
      this.extraMapIds = wasExtra;
      writeJSON('pi.map', wasActive);
      writeJSON('pi.maps', wasExtra);
    };
    const cancel = this.#defer((options) => api.delete(`/maps/${map.id}`, options), {
      rimetti,
      frase: `La mappa «${map.name}» non si è potuta eliminare, ed è tornata al suo posto.`,
    });

    toast.show(
      places.length
        ? `Mappa «${map.name}» eliminata, e con lei ${luoghi(places.length)}`
        : `Mappa «${map.name}» eliminata`,
      {
        label: 'Annulla',
        run: () => {
          cancel();
          rimetti();
        },
      },
    );
  }

  #forget(id: string): void {
    if (!this.extraMapIds.includes(id)) return;
    this.extraMapIds = this.extraMapIds.filter((other) => other !== id);
    writeJSON('pi.maps', this.extraMapIds);
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

  /** Tre domande in una: la sua mappa è accesa, la categoria pure, è nel gruppo scelto? */
  visible(place: Place): boolean {
    return (
      this.shows(place.mapId) &&
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

  /**
   * Una cosa cambiata da un'altra parte — un'altra scheda, il telefono, una
   * cancellazione andata a buon fine. Si applica per `id`, e chi l'ha
   * cambiata la riceve indietro senza danno: applicare due volte la stessa
   * cosa la lascia com'è.
   *
   * Delle cascate non arrivano eventi: che una categoria si porti via i suoi
   * luoghi lo sappiamo già, ed è la stessa regola che applichiamo quando
   * siamo noi a eliminarla.
   */
  apply(event: LiveChange): void {
    switch (event.kind) {
      case 'place': {
        const at = this.places.findIndex((place) => place.id === event.id);
        if (!event.value) {
          if (at >= 0) this.places.splice(at, 1);
          return;
        }
        // il `key` non si tocca: è quello che tiene un marker attaccato al suo luogo
        if (at >= 0) rimpiazza(this.places[at]!, event.value, ['key']);
        else this.places.push(withKey(event.value));
        return;
      }

      case 'map': {
        if (!event.value) {
          this.maps = this.maps.filter((map) => map.id !== event.id);
          this.places = this.places.filter((place) => place.mapId !== event.id);
          if (this.activeMapId === event.id) this.openMap(this.maps[0]?.id ?? '');
          this.extraMapIds = this.extraMapIds.filter((id) => id !== event.id);
          return;
        }
        const map = this.maps.find((candidate) => candidate.id === event.id);
        if (map) rimpiazza(map, event.value);
        else this.maps.push(event.value);
        return;
      }

      case 'category': {
        if (!event.value) {
          this.categories = this.categories.filter((category) => category.id !== event.id);
          this.places = this.places.filter((place) => place.categoryId !== event.id);
          return;
        }
        const category = this.categories.find((candidate) => candidate.id === event.id);
        if (category) rimpiazza(category, event.value);
        else this.categories.push(event.value);
        return;
      }

      case 'group': {
        if (!event.value) {
          this.groups = this.groups.filter((group) => group.id !== event.id);
          for (const place of this.places) place.groupIds = place.groupIds.filter((id) => id !== event.id);
          if (this.activeGroup === event.id) this.setGroup(null);
          return;
        }
        const group = this.groups.find((candidate) => candidate.id === event.id);
        if (group) rimpiazza(group, event.value);
        else this.groups.push(event.value);
        return;
      }
    }
  }

  /**
   * Di quale indice è la roba che questo browser si ricorda: quale mappa
   * guardavi, quali categorie avevi spento, dov'era la vista.
   *
   * Sono scelte che hanno senso dentro un indice e nessuno fuori. Cambiando
   * persona — un altro accesso dallo stesso browser, o l'ingresso in casa di
   * qualcuno — restavano lì e raccontavano di gente che non c'è più. Quando
   * l'indice cambia, si dimentica.
   */
  settle(where: string): void {
    if (readJSON<string | null>('pi.where', null) === where) return;
    writeJSON('pi.where', where);

    this.activeMapId = null;
    this.extraMapIds = [];
    this.hiddenCategories = [];
    this.activeGroup = null;
    // si tolgono, non si azzerano: chi le rilegge ha il suo valore di partenza
    // e non un `null` scritto apposta, che e' un'altra cosa
    for (const key of ['pi.map', 'pi.maps', 'pi.hidden', 'pi.group', 'pi.view']) forgetJSON(key);
  }

  async load(): Promise<void> {
    try {
      const snapshot = await api.get<Snapshot>('/state');
      this.maps = snapshot.maps ?? [];
      this.categories = snapshot.categories;
      this.groups = snapshot.groups ?? [];
      const known = new Map(this.places.map((place) => [place.id, place.key]));
      this.places = snapshot.places.map((place) => withKey(place, known));

      // le mappe scelte l'altra volta potrebbero non esserci più
      const alive = new Set(this.maps.map((map) => map.id));
      if (!alive.has(this.activeMapId ?? '')) {
        this.activeMapId = this.maps[0]?.id ?? null;
        writeJSON('pi.map', this.activeMapId);
      }
      const extras = this.extraMapIds.filter((id) => alive.has(id) && id !== this.activeMapId);
      if (extras.length !== this.extraMapIds.length) {
        this.extraMapIds = extras;
        writeJSON('pi.maps', extras);
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

  /**
   * Una cancellazione che parte quando «Annulla» non c'è più.
   *
   * Se il server dice di no, la cosa torna dov'era e si dice perché: prima
   * l'errore si perdeva, lo schermo diceva «eliminato» e alla prima
   * rilettura il luogo ricompariva, senza una parola.
   */
  #defer(
    commit: (options?: RequestInit) => Promise<unknown>,
    fallita: { rimetti: () => void; frase: string },
  ): () => void {
    const entry: PendingDelete = { commit };
    this.#pending.add(entry);
    const timer = setTimeout(() => {
      this.#pending.delete(entry);
      commit().catch((error: Error) => {
        fallita.rimetti();
        toast.show(`${fallita.frase} ${error.message}`);
      });
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
      emoji: emoji || DEFAULT_MARK,
      color: color || SUGGESTED[0]!,
    });
    return absorb(this.categories, created);
  }

  /** Category edits are safe to apply first: the id never changes. */
  async patchCategory(category: Category, patch: Partial<Category>): Promise<void> {
    const before = { ...category };
    Object.assign(category, patch);
    try {
      rimpiazza(category, await api.put<Category>(`/categories/${category.id}`, patch));
    } catch (error) {
      ritira(category, patch, before);
      toast.show((error as Error).message);
    }
  }

  deleteCategory(category: Category): void {
    const index = this.categories.indexOf(category);
    const orphans = this.places.filter((place) => place.categoryId === category.id);
    this.categories.splice(index, 1);
    this.places = this.places.filter((place) => place.categoryId !== category.id);

    const rimetti = () => {
      this.categories.splice(Math.min(index, this.categories.length), 0, category);
      this.places = [...this.places, ...orphans];
    };
    const cancel = this.#defer((options) => api.delete(`/categories/${category.id}`, options), {
      rimetti,
      frase: `La categoria «${category.name}» non si è potuta eliminare, ed è tornata al suo posto.`,
    });

    toast.show(
      orphans.length
        ? `Categoria «${category.name}» eliminata, e con lei ${luoghi(orphans.length)}`
        : `Categoria «${category.name}» eliminata`,
      {
        label: 'Annulla',
        run: () => {
          cancel();
          rimetti();
        },
      },
    );
  }

  /* ----------------------------------------------------------------- groups */

  async createGroup(name: string): Promise<Group> {
    return absorb(this.groups, await api.post<Group>('/groups', { name }));
  }

  async patchGroup(group: Group, patch: Partial<Group>): Promise<void> {
    const before = { ...group };
    Object.assign(group, patch);
    try {
      rimpiazza(group, await api.put<Group>(`/groups/${group.id}`, patch));
    } catch (error) {
      ritira(group, patch, before);
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

    const rimetti = () => {
      this.groups.splice(Math.min(index, this.groups.length), 0, group);
      for (const place of members) {
        if (!place.groupIds.includes(group.id)) place.groupIds = [...place.groupIds, group.id];
      }
    };
    const cancel = this.#defer((options) => api.delete(`/groups/${group.id}`, options), {
      rimetti,
      frase: `Il gruppo «${group.name}» non si è potuto eliminare, ed è tornato al suo posto.`,
    });

    const freed = members.length === 1 ? 'un luogo resta' : `${members.length} luoghi restano`;
    toast.show(
      members.length ? `Gruppo «${group.name}» sciolto, ${freed}` : `Gruppo «${group.name}» eliminato`,
      {
        label: 'Annulla',
        run: () => {
          cancel();
          rimetti();
        },
      },
    );
  }

  /* ----------------------------------------------------------------- places */

  /**
   * Sposta un agente da un luogo a un altro, o lo lascia senza.
   *
   * Un agente sta su un luogo solo, quindi «su questo» vuol dire anche «via
   * da quell'altro»: farlo in un colpo evita di lasciarlo appeso a due, che
   * è uno stato che non vuol dire niente.
   */
  async moveAgent(agentId: string, placeId: string | null): Promise<void> {
    const prima = this.places.filter((place) => (place.agentIds ?? []).includes(agentId));
    const dopo = placeId ? this.places.find((place) => place.id === placeId) : undefined;

    for (const place of prima) {
      if (place.id === placeId) return;
      await this.#setAgents(place, (place.agentIds ?? []).filter((id) => id !== agentId));
    }
    if (dopo) await this.#setAgents(dopo, [...(dopo.agentIds ?? []), agentId]);
  }

  /** Il luogo si riscrive per intero: il server vuole la scheda, non la toppa. */
  async #setAgents(place: Place, agentIds: string[]): Promise<void> {
    const before = { ...place };
    Object.assign(place, { agentIds });
    try {
      Object.assign(place, await api.put<Place>(`/places/${place.id}`, placePayload(place.mapId, { ...place, agentIds })));
    } catch (error) {
      Object.assign(place, before);
      toast.show((error as Error).message);
    }
  }

  /**
   * Si vede subito, e la risposta del server ci si scrive sopra. Se il
   * server dice di no, l'elenco torna com'era e l'errore sale a chi ha
   * chiamato: è la scheda che sa cosa fare di quello che era scritto.
   */
  async savePlace(draft: Draft): Promise<void> {
    // se il posto c'era già resta dov'era: solo i nuovi nascono in quella selezionata
    const mapId = draft.mapId ?? this.activeMap?.id ?? '';
    const payload = placePayload(mapId, draft);
    const existing = draft.key ? this.places.find((place) => place.key === draft.key) : undefined;

    if (existing) {
      const before = { ...existing };
      Object.assign(existing, payload);
      try {
        Object.assign(existing, await api.put<Place>(`/places/${existing.id}`, payload));
      } catch (error) {
        Object.assign(existing, before);
        // cosa dire, e cosa fare di quello che era scritto, lo sa la scheda
        throw error;
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

    // Da qui in poi si cerca per `key` e mai per identita': quello che sta
    // nell'elenco e' una copia osservata, non questo stesso oggetto, e
    // `indexOf` con l'originale non lo troverebbe.
    const key = optimistic.key;
    const mine = () => this.places.findIndex((one) => one.key === key);

    try {
      const saved = await api.post<Place>('/places', payload);
      // Fino a un attimo fa l'ottimistico aveva un id inventato, quindi il
      // filo aperto non poteva riconoscerlo: se l'evento e' arrivato prima
      // della risposta, nell'elenco c'e' gia' un gemello vero. Si tiene
      // quello e si butta il nostro, se no restano due pin per un posto solo.
      const twin = this.places.find((one) => one.key !== key && one.id === saved.id);
      const at = mine();
      if (twin) {
        if (at >= 0) this.places.splice(at, 1);
        Object.assign(twin, saved);
        return;
      }
      if (at >= 0) Object.assign(this.places[at]!, saved);
    } catch (error) {
      const at = mine();
      if (at >= 0) this.places.splice(at, 1);
      throw error;
    }
  }

  deletePlace(place: LocalPlace): void {
    const index = this.places.indexOf(place);
    if (index < 0) return;
    this.places.splice(index, 1);

    const rimetti = () => {
      if (!this.places.some((one) => one.id === place.id)) this.places.splice(Math.min(index, this.places.length), 0, place);
    };
    const cancel = this.#defer((options) => api.delete(`/places/${place.id}`, options), {
      rimetti,
      frase: `Il luogo «${place.name}» non si è potuto eliminare, ed è tornato al suo posto.`,
    });

    toast.show(`Luogo «${place.name}» eliminato`, {
      label: 'Annulla',
      run: () => {
        cancel();
        rimetti();
      },
    });
  }
}

export const store = new Store();
