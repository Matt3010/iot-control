<script lang="ts">
  import { auth } from '../lib/auth.svelte';
  import { DEFAULT_EMOJI, normalise, SUGGESTED } from '../lib/format';
  import { mapUrl, profileUrl } from '../lib/routing';
  import { fadeEdges } from '../lib/overflow';
  import { store } from '../lib/store.svelte';
  import type { PlaceMap } from '../lib/types';
  import { toast } from '../lib/toast.svelte';
  import { swipeToClose } from '../lib/swipe';
  import { ui } from '../lib/ui.svelte';
  import { viewport } from '../lib/viewport.svelte';
  import AddRow from './AddRow.svelte';
  import Icon from './Icon.svelte';
  import LinkRow from './LinkRow.svelte';
  import Row from './Row.svelte';
  import Switch from './Switch.svelte';
  import Tabs from './Tabs.svelte';
  import ShareField from './ShareField.svelte';
  import Button from './Button.svelte';

  /** Una volta sola, perché le domande parlino tutte la stessa lingua. */
  const conta = (n: number): string => (n === 1 ? 'un luogo' : `${n} luoghi`);

  /**
   * Eliminare una mappa porta via i suoi posti, e nient'altro: categorie e
   * gruppi sono tuoi e valgono su tutte. La domanda lo dice per nome, che è
   * l'unico modo perché una conferma serva a qualcosa.
   */
  function portaVia(mapId: string): string | undefined {
    const luoghi = store.places.filter((place) => place.mapId === mapId).length;
    if (!luoghi) return undefined;
    return `Se ne ${luoghi === 1 ? 'va' : 'vanno'} con lei ${conta(luoghi)}. Categorie e gruppi restano.`;
  }

  let newEmoji = $state(DEFAULT_EMOJI);
  let newColor = $state<string>(SUGGESTED[0]!);
  let newCategoryName = $state('');
  let newGroupName = $state('');
  let newMapName = $state('');

  /**
   * Le visite arrivano mentre guardi altro: aprendo questa scheda si rileggono,
   * altrimenti resteresti al numero di quando sei entrato.
   */
  $effect(() => {
    if (ui.manageTab !== 'maps') return;
    void auth.refresh();
    void store.refreshMaps();
  });

  /**
   * Due numeri, due domande: quante volte il link è stato usato, e quanta
   * gente diversa l'ha usato. La frase si costruisce qui perché è la stessa
   * per le mappe e per il profilo, a parte l'ultimo pezzo.
   */
  const many = (count: number, one: string, more: string) =>
    `${count} ${count === 1 ? one : more}`;

  const visitsOfMap = (map: PlaceMap) => {
    if (!map.views && !map.viewers) return 'Ancora nessuna visita.';
    const parts = [many(map.views, 'apertura', 'aperture'), many(map.viewers, 'persona', 'persone')];
    if (map.viewsFromProfile) parts.push(`${map.viewsFromProfile} dal profilo`);
    return parts.join(' · ');
  };

  /**
   * Di chi è l'indirizzo pubblico di quello che si sta guardando. Dentro
   * l'indice di un altro le mappe sono sue, quindi i link sono suoi: mettere
   * il proprio handle davanti alle mappe di qualcun altro darebbe indirizzi
   * che non esistono.
   */
  const handle = $derived(auth.account?.actingAs?.handle ?? auth.account?.handle ?? '');
  /** I conti delle visite sono di chi possiede: in casa d'altri non li abbiamo. */
  const atHome = $derived(!auth.account?.actingAs);

  const visitsOfProfile = () => {
    const me = auth.account;
    if (!me || (!me.profileViews && !me.profileViewers)) return 'Ancora nessuna visita.';
    const parts = [
      many(me.profileViews, 'apertura', 'aperture'),
      many(me.profileViewers, 'persona', 'persone'),
    ];
    if (me.profileFollowed) {
      parts.push(
        me.profileFollowed === 1
          ? '1 ha aperto una mappa'
          : `${me.profileFollowed} hanno aperto una mappa`,
      );
    }
    return parts.join(' · ');
  };

  /** Come si conta, detto una volta sola e appeso a ogni numero. */
  const COUNT_NOTE =
    'Le aperture sono quante volte il link è stato usato, senza contare le ricariche ' +
    'dei primi minuti. Le persone sono le impronte diverse in una giornata, e chi ' +
    'torna domani conta di nuovo. Chi sei lo indoviniamo da indirizzo e browser ' +
    'mescolati a un numero che cambia ogni giorno, non lo conserviamo, e dalla ' +
    'stessa rete con lo stesso browser sei sempre la stessa persona, anche in ' +
    'incognito. Le visite fatte mentre sei entrato nel tuo account non contano.';

  /** Oltre una decina di voci scorrerle non basta più: serve poterle cercare. */
  const MANY = 8;
  let categoryFilter = $state('');
  let categoryInput = $state<HTMLInputElement>();
  let groupInput = $state<HTMLInputElement>();

  /** Arrivando dal + il cursore è già nel campo; su telefono no, aprirebbe la tastiera. */
  $effect(() => {
    if (ui.manageIntent !== 'add' || viewport.narrow) return;
    (ui.manageTab === 'groups' ? groupInput : categoryInput)?.focus();
  });
  let groupFilter = $state('');

  const match = (name: string, needle: string) =>
    normalise(name).includes(normalise(needle.trim()));

  const visibleCategories = $derived(
    categoryFilter.trim() ? store.categories.filter((c) => match(c.name, categoryFilter)) : store.categories,
  );
  /** I gruppi sono tuoi: qui ci sono tutti, non solo quelli della mappa aperta. */
  const mapGroups = $derived(store.groups);
  const visibleGroups = $derived(
    groupFilter.trim() ? mapGroups.filter((g) => match(g.name, groupFilter)) : mapGroups,
  );

  async function addCategory(name: string) {
    try {
      const created = await store.createCategory(name, newEmoji, newColor);
      newCategoryName = '';
      newEmoji = DEFAULT_EMOJI;
      // leave the next colour ready instead of offering the same one again
      newColor = SUGGESTED[(SUGGESTED.indexOf(newColor as never) + 1) % SUGGESTED.length]!;
      if (ui.draft) ui.draft.categoryId = created.id;
      toast.show(`Categoria "${created.name}" creata`);
    } catch (error) {
      toast.show((error as Error).message);
    }
  }

  async function addMap(name: string) {
    try {
      const created = await store.createMap(name);
      newMapName = '';
      toast.show(`"${created.name}" è la mappa selezionata`);
    } catch (error) {
      toast.show((error as Error).message);
    }
  }

  async function goInto(handle: string) {
    try {
      await auth.goInto(handle);
    } catch (error) {
      toast.show((error as Error).message);
    }
  }

  async function addGroup(name: string) {
    try {
      const created = await store.createGroup(name);
      newGroupName = '';
      if (ui.draft) ui.draft.groupIds = [...(ui.draft.groupIds ?? []), created.id];
      toast.show(`Gruppo "${created.name}" creato`);
    } catch (error) {
      toast.show((error as Error).message);
    }
  }
</script>

<aside id="manage-sheet" class="surface" use:swipeToClose={() => ui.closeManage()}>
  <header>
    <h2>
      {ui.manageTab === 'maps'
        ? 'Mappe e condivisione'
        : ui.manageTab === 'groups'
          ? 'Gruppi'
          : 'Categorie'}
    </h2>
    <Button look="icon" title="Chiudi" onclick={() => ui.closeManage()}>
      <Icon name="close" />
    </Button>
  </header>

  <Tabs
    value={ui.manageTab}
    onpick={(id) => (ui.manageTab = id)}
    options={[
      { id: 'categories', label: 'Categorie' },
      { id: 'groups', label: 'Gruppi' },
      { id: 'maps', label: 'Mappe' },
    ]}
    label="Cosa stai gestendo"
  />

  {#if ui.manageTab === 'categories'}
    <div class="tab-panel">
      {#if store.categories.length > MANY}
        <input class="list-filter" type="search" placeholder="Cerca categoria" bind:value={categoryFilter} />
      {/if}
      <ul id="category-list" data-fade="none" use:fadeEdges>
        {#each visibleCategories as category (category.id)}
          <li>
            <Row>
              {#snippet lead()}
                <button
                  type="button"
                  class="emoji-btn"
                  title="Cambia emoji"
                  onclick={(event) =>
                    ui.askEmoji(event.currentTarget, (emoji) => store.patchCategory(category, { emoji }))}
                >
                  {category.emoji}
                </button>
              {/snippet}

              <input
                type="text"
                maxlength="40"
                value={category.name}
                onchange={(event) => store.patchCategory(category, { name: event.currentTarget.value })}
              />

              {#snippet trail()}
                <button
                  type="button"
                  class="swatch"
                  title="Cambia colore"
                  style:--c={category.color}
                  aria-label="Colore"
                  onclick={(event) =>
                    ui.askColor(event.currentTarget, category.color, (color) =>
                      store.patchCategory(category, { color }),
                    )}
                ></button>
                <span class="count">{store.countIn(category.id) || ''}</span>
                <Button
                  look="icon"
                  tone="danger"
                  extra="kill"
                  title="Elimina categoria"
                  onclick={(event: MouseEvent) =>
                    ui.askSure(event.currentTarget as HTMLElement, {
                      title: `Eliminare “${category.name}”?`,
                      detail: store.countIn(category.id)
                        ? `Se ne vanno con lei anche ${conta(store.countIn(category.id))}.`
                        : undefined,
                      verb: 'Elimina',
                      onYes: () => store.deleteCategory(category),
                    })}
                >
                  <Icon name="trash" />
                </Button>
              {/snippet}
            </Row>
          </li>
        {/each}
        {#if store.categories.length && !visibleCategories.length}
          <li class="list-empty">Nessuna categoria con questo nome.</li>
        {/if}
      </ul>

      <AddRow
        id="category-form"
        placeholder="Nome categoria"
        title="Crea categoria"
        bind:value={newCategoryName}
        bind:field={categoryInput}
        onadd={addCategory}
      >
        {#snippet before()}
          <button
            type="button"
            class="emoji-btn"
            title="Scegli emoji"
            onclick={(event) => ui.askEmoji(event.currentTarget, (emoji) => (newEmoji = emoji))}
          >
            {newEmoji}
          </button>
        {/snippet}
        {#snippet after()}
          <button
            type="button"
            class="swatch"
            title="Scegli colore"
            style:--c={newColor}
            aria-label="Colore"
            onclick={(event) => ui.askColor(event.currentTarget, newColor, (color) => (newColor = color))}
          ></button>
          <!-- il posto del conteggio resta vuoto, ma resta: così il colore e il
               tasto cadono nella stessa colonna delle righe qui sopra -->
          <span class="count" aria-hidden="true"></span>
        {/snippet}
      </AddRow>
    </div>
  {:else if ui.manageTab === 'maps'}
    <div class="tab-panel">
      <ul id="map-list" data-fade="none" use:fadeEdges>
        {#each store.maps as map (map.id)}
          {@const open = map.id === store.activeMap?.id}
          {@const places = store.places.filter((place) => place.mapId === map.id).length}
          {@const url = mapUrl(handle, map.slug)}
          <li>
            <Row active={open} class={map.published ? 'is-public' : ''}>
              {#snippet lead()}
                <button
                  type="button"
                  class="map-open"
                  title={open ? 'Mappa selezionata' : 'Seleziona mappa'}
                  aria-pressed={open}
                  onclick={() => store.openMap(map.id)}
                >
                  <Icon name="pin" />
                </button>
              {/snippet}

              <input
                type="text"
                maxlength="40"
                value={map.name}
                onchange={(event) => store.patchMap(map, { name: event.currentTarget.value })}
              />

              {#snippet trail()}
                <Button
                  look="icon"
                  extra={'map-eye' + (store.shows(map.id) ? ' is-shown' : '')}
                  disabled={open}
                  title={open
                    ? 'Sempre in vista'
                    : store.shows(map.id)
                      ? 'Togli dalla vista'
                      : 'Mostra anche questa'}
                  onclick={() => store.toggleShown(map.id)}
                >
                  <Icon name={store.shows(map.id) ? 'eye' : 'eyeOff'} />
                </Button>
                <Button
                  look="icon"
                  tone="danger"
                  extra="kill"
                  title="Elimina mappa"
                  disabled={store.maps.length <= 1}
                  onclick={(event: MouseEvent) =>
                    ui.askSure(event.currentTarget as HTMLElement, {
                      title: `Eliminare “${map.name}”?`,
                      detail: portaVia(map.id) ?? 'È vuota: non porta via niente.',
                      verb: 'Elimina',
                      onYes: () => store.deleteMap(map),
                    })}
                >
                  <Icon name="trash" />
                </Button>
              {/snippet}

              {#snippet under()}
              <div class="map-foot">
                <span class="map-meta">
                  {places}
                  {places === 1 ? 'luogo' : 'luoghi'}{open
                    ? ' · selezionata'
                    : store.shows(map.id)
                      ? ' · in vista'
                      : ''}
                </span>
                <Switch
                  checked={map.published}
                  onchange={(published) => store.patchMap(map, { published })}
                  label={map.published ? 'Mappa pubblica' : 'Mappa privata'}
                  title={map.published ? 'Smetti di pubblicarla' : 'Pubblicala'}
                  side="end"
                />
              </div>

              {#if map.published}
                <LinkRow
                  prefix={'/u/' + handle + '/'}
                  value={map.slug}
                  {url}
                  onchange={(slug) => store.patchMap(map, { slug })}
                />
                <p class="visits" title={COUNT_NOTE}>{visitsOfMap(map)}</p>
              {/if}

              <!-- Le chiavi stanno sotto la mappa che aprono. Non e' un
                   permesso a meta': chi ce l'ha entra e lavora qui dentro
                   come chi la mappa l'ha fatta. Un ospite non le passa
                   avanti, quindi da ospite il riquadro non c'e'. -->
              {#if atHome}
                <div class="map-keys">
                  <ShareField
                    mapId={map.id}
                    editors={map.editors ?? []}
                    onchange={(editors) => store.patchMap(map, { editors })}
                  />
                </div>
              {/if}
              {/snippet}
            </Row>
          </li>
        {/each}
      </ul>

      <AddRow
        id="map-form"
        placeholder="Nome mappa — es. Islanda"
        title="Crea mappa"
        bind:value={newMapName}
        onadd={addMap}
      />

      {#if store.maps.some((map) => map.published)}
        <div class="profile-link">
          <span class="eyebrow">Link del profilo</span>
          <p>Raccoglie tutte le mappe che hai pubblicato. È l'indirizzo da mettere in bio.</p>
          <LinkRow
            prefix="/u/"
            value={handle}
            url={profileUrl(handle)}
            title="Copia link"
          />
          {#if atHome}
            <p class="visits" title={COUNT_NOTE}>{visitsOfProfile()}</p>
          {/if}
        </div>
      {/if}

      {#if auth.account?.actingAs}
        <div class="share">
          <span class="eyebrow">Non sei a casa tua</span>
          <p>
            Stai lavorando nelle mappe di <b>{auth.account.actingAs.handle}</b>: quello che cambi
            qui è suo. Le chiavi delle <i>tue</i> mappe le dai dal tuo.
          </p>
        </div>
      {/if}

      {#if (auth.account?.keys ?? []).length}
        <div class="share">
          <span class="eyebrow">Mappe aperte a te</span>
          <p>Ci entri e ci lavori come se fossero tue. Con la fascia in alto sai sempre dove sei.</p>
          <ul class="theirs">
            {#each auth.account?.keys ?? [] as key (key.mapId)}
              <li>
                <Row active={auth.account?.actingAs?.ownerId === key.ownerId}>
                  {#snippet lead()}
                    <span class="keys-mark" aria-hidden="true"><Icon name="key" /></span>
                  {/snippet}
                  <span class="theirs-name">{key.mapName}<em>di {key.handle}</em></span>
                  {#snippet trail()}
                    {#if auth.account?.actingAs?.ownerId === key.ownerId}
                      <span class="here">ci sei</span>
                    {:else}
                      <Button size="sm" onclick={() => void goInto(key.handle)}>Apri</Button>
                    {/if}
                  {/snippet}
                </Row>
              </li>
            {/each}
          </ul>
        </div>
      {/if}

      <p class="sheet-note">
        Ogni mappa tiene i suoi luoghi. Categorie e gruppi invece sono tuoi e valgono su tutte le
        mappe, quindi eliminare una mappa porta via soltanto i luoghi che ci stavano dentro. La
        mappa che pubblichi la vede chi ha il link, tranne i luoghi segnati come privati.
      </p>
    </div>
  {:else}
    <div class="tab-panel">
      {#if mapGroups.length > MANY}
        <input class="list-filter" type="search" placeholder="Cerca gruppo" bind:value={groupFilter} />
      {/if}
      <ul id="group-list" data-fade="none" use:fadeEdges>
        {#each visibleGroups as group (group.id)}
          <li>
            <Row>
              {#snippet lead()}
                <span class="group-mark" aria-hidden="true"><Icon name="tag" /></span>
              {/snippet}

              <input
                type="text"
                maxlength="40"
                value={group.name}
                onchange={(event) => store.patchGroup(group, { name: event.currentTarget.value })}
              />

              {#snippet trail()}
                <span class="count">{store.countGroup(group.id) || ''}</span>
                <Button
                  look="icon"
                  tone="danger"
                  extra="kill"
                  title="Elimina gruppo"
                  onclick={(event: MouseEvent) =>
                    ui.askSure(event.currentTarget as HTMLElement, {
                      title: `Sciogliere “${group.name}”?`,
                      detail: store.countGroup(group.id)
                        ? `${conta(store.countGroup(group.id))} resta${store.countGroup(group.id) === 1 ? '' : 'no'} dov'è, senza questo gruppo.`
                        : undefined,
                      verb: 'Sciogli',
                      onYes: () => store.deleteGroup(group),
                    })}
                >
                  <Icon name="trash" />
                </Button>
              {/snippet}
            </Row>
          </li>
        {/each}
        {#if mapGroups.length && !visibleGroups.length}
          <li class="list-empty">Nessun gruppo con questo nome.</li>
        {/if}
      </ul>

      <AddRow
        id="group-form"
        placeholder="Nome gruppo — es. Padova"
        title="Crea gruppo"
        bind:value={newGroupName}
        bind:field={groupInput}
        onadd={addGroup}
      />

      <p class="sheet-note">
        Un gruppo tiene insieme i luoghi di una città, di un viaggio, di una lista. Un luogo ne può
        portare quanti ne vuoi, anche da mappe diverse, perché i gruppi sono tuoi come le
        categorie.
      </p>
    </div>
  {/if}
</aside>

<style>
/* emoji button and colour swatch ------------------------------------------ */

.emoji-btn {
  display: grid;
  place-items: center;
  flex: none;
  width: 38px;
  height: 38px;
  padding: 0;
  border: 1px solid var(--hairline);
  border-radius: var(--r-md);
  background: var(--sunken);
  font-family: var(--emoji);
  font-size: 19px;
  line-height: 1;
  transition: background 0.15s, border-color 0.15s, transform 0.14s var(--ease);
}

.emoji-btn:hover { background: var(--sunken-hover); transform: translateY(-1px); }

/* the colour of a category, as a button that opens the palette */
.swatch {
  flex: none;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: var(--c, var(--ink-3));
  background-image: linear-gradient(160deg, rgb(255 255 255 / 0.28), rgb(255 255 255 / 0) 60%);
  box-shadow: inset 0 0 0 1px rgb(14 17 22 / 0.12), 0 1px 2px rgb(10 13 18 / 0.2);
  transition: transform 0.14s var(--ease), box-shadow 0.18s;
}

.swatch:hover {
  transform: scale(1.08);
  box-shadow: inset 0 0 0 1px rgb(14 17 22 / 0.12), 0 2px 8px rgb(10 13 18 / 0.3);
}

/* the row that adds one more ----------------------------------------------- */

/* la riga è di AddRow: qui si vestono solo i pezzi che ci mettiamo dentro */
:global(.row.is-dashed) .emoji-btn { width: 28px; height: 28px; font-size: 16px; }

:global(.row.is-dashed) .swatch { width: 22px; height: 22px; margin: 0 3px; }

.sheet-note {
  margin: 12px 2px 0;
  font-size: 11.5px;
  line-height: 1.45;
  color: var(--ink-3);
}

/* category manager -------------------------------------------------------- */

#group-list, #map-list {
  list-style: none;
  margin: 0 0 8px;
  padding: 0;
  display: grid;
  gap: 6px;
}

#map-list { gap: 8px; }

.map-open {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  /* zero, se no resta il padding dei bottoni: lo spazio dentro scenderebbe a
     dodici e il pin, che ne misura quindici, invece di centrarsi si
     appoggerebbe a sinistra di un pixel e mezzo */
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: none;
  color: var(--ink-3);
  transition: background 0.14s, color 0.14s;
}

.map-open:hover { background: var(--glass-strong); color: var(--ink-2); }

:global(.row.is-on) .map-open { color: var(--ink); }
.map-open :global(.ico) { width: 15px; height: 15px; }

/* la riga sotto vive nella stessa colonna del resto: niente rientro. I due
   pezzi poggiano in basso: il conto dei luoghi sta sul fondo dell'interruttore,
   non a mezz'aria in mezzo alla sua pista. */
.map-foot {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 10px;
  padding: 0;
}

.map-meta {
  font-size: 11.5px;
  color: var(--ink-3);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* l'occhio resta smorto finché la mappa non è accesa accanto */
#map-list :global(.map-eye) { color: var(--ink-3); }
#map-list :global(.map-eye.is-shown) { color: var(--ink); }

.profile-link {
  display: grid;
  gap: 6px;
  margin-top: 4px;
  padding-top: 12px;
  border-top: 1px solid var(--hairline-soft);
}

.profile-link p { margin: 0; font-size: 11.5px; line-height: 1.45; color: var(--ink-3); }

/* i due blocchi della condivisione: stessa aria del link del profilo */
.share {
  display: grid;
  gap: 8px;
  margin-top: 4px;
  padding-top: 12px;
  border-top: 1px solid var(--hairline-soft);
}

.share p { margin: 0; font-size: 11.5px; line-height: 1.45; color: var(--ink-3); }

.share p b { font-weight: 600; color: var(--ink-2); }

.theirs { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }

.theirs-name {
  flex: 1;
  min-width: 0;
  padding-left: 4px;
  font-size: 13.5px;
  font-weight: 560;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* di chi e' quella mappa: serve, perche' due persone la chiamano uguale */
.theirs-name em {
  font-style: normal;
  font-weight: 460;
  font-size: 11.5px;
  color: var(--ink-3);
}

.theirs-name em::before { content: ' '; }

/* le chiavi di una mappa stanno dentro la sua card, staccate da una riga */
.map-keys {
  margin-top: 4px;
  padding-top: 10px;
  border-top: 1px solid var(--hairline-soft);
}

.keys-mark {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: color-mix(in srgb, #b06c0c 16%, transparent);
  color: #b06c0c;
}

.keys-mark :global(.ico) { width: 13px; height: 13px; }

.here { padding: 0 8px; font-size: 11.5px; color: var(--ink-3); }

/* il conto sta sotto al link, smorzato: è una nota, non un titolo */
.visits {
  margin: 0;
  padding: 0;
  font-size: 11.5px;
  color: var(--ink-3);
  font-variant-numeric: tabular-nums;
}



/* lì dentro la riga sta su una scheda, non su una card: si smorza */
.profile-link :global(.link-row) { background: var(--sunken); box-shadow: none; }

#group-list:empty { display: none; }

/* la lista scorre dentro di sé: la riga che aggiunge resta sempre sotto gli occhi */
#category-list, #group-list, #map-list {
  max-height: min(46vh, 340px);
  overflow-y: auto;
  overscroll-behavior: contain;
}

:global(#category-list[data-fade='bottom']), :global(#group-list[data-fade='bottom']) {
  -webkit-mask-image: linear-gradient(180deg, #000 calc(100% - 20px), transparent);
  mask-image: linear-gradient(180deg, #000 calc(100% - 20px), transparent);
}

:global(#category-list[data-fade='top']), :global(#group-list[data-fade='top']) {
  -webkit-mask-image: linear-gradient(0deg, #000 calc(100% - 20px), transparent);
  mask-image: linear-gradient(0deg, #000 calc(100% - 20px), transparent);
}

:global(#category-list[data-fade='both']), :global(#group-list[data-fade='both']) {
  -webkit-mask-image: linear-gradient(180deg, transparent, #000 20px, #000 calc(100% - 20px), transparent);
  mask-image: linear-gradient(180deg, transparent, #000 20px, #000 calc(100% - 20px), transparent);
}

.list-filter {
  margin-bottom: 8px;
  font-size: 13px;
}

.list-empty {
  padding: 10px 8px;
  font-size: 12.5px;
  color: var(--ink-3);
}

#category-list {
  list-style: none;
  margin: 0 0 8px;
  padding: 0;
  display: grid;
  gap: 6px;
}

#category-list:empty { display: none; }

/* l'emoji della categoria è il suo ritratto: sta in un bollo come il pin
   della mappa, non in un tasto qualsiasi; nella riga che aggiunge è lo stesso
   bollo, se no la colonna si sposta all'ultima riga */
#category-list .emoji-btn {
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 50%;
  background: none;
  font-size: 16px;
}

#category-list .emoji-btn:hover { background: var(--glass-strong); transform: none; }

#category-list .swatch { width: 22px; height: 22px; margin: 0 3px; }

/* i gruppi non hanno un'emoji: al suo posto un segno smorto, per il ritmo */
.group-mark {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  color: var(--ink-3);
}

.group-mark :global(.ico) { width: 15px; height: 15px; }
</style>
