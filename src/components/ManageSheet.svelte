<script lang="ts">
  import { auth } from '../lib/auth.svelte';
  import { DEFAULT_EMOJI, normalise, SUGGESTED } from '../lib/format';
  import { mapUrl, profileUrl } from '../lib/routing';
  import { fadeEdges } from '../lib/overflow';
  import { store } from '../lib/store.svelte';
  import { toast } from '../lib/toast.svelte';
  import { swipeToClose } from '../lib/swipe';
  import { ui } from '../lib/ui.svelte';
  import { viewport } from '../lib/viewport.svelte';
  import Icon from './Icon.svelte';
  import LinkRow from './LinkRow.svelte';
  import Switch from './Switch.svelte';

  let newEmoji = $state(DEFAULT_EMOJI);
  let newColor = $state<string>(SUGGESTED[0]!);
  let newCategoryName = $state('');
  let newGroupName = $state('');
  let newMapName = $state('');

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
  const visibleGroups = $derived(
    groupFilter.trim() ? store.currentGroups.filter((g) => match(g.name, groupFilter)) : store.currentGroups,
  );

  async function addCategory(event: SubmitEvent) {
    event.preventDefault();
    const name = newCategoryName.trim();
    if (!name) return;
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

  async function addMap(event: SubmitEvent) {
    event.preventDefault();
    const name = newMapName.trim();
    if (!name) return;
    try {
      const created = await store.createMap(name);
      newMapName = '';
      toast.show(`"${created.name}" è la mappa aperta`);
    } catch (error) {
      toast.show((error as Error).message);
    }
  }

  async function addGroup(event: SubmitEvent) {
    event.preventDefault();
    const name = newGroupName.trim();
    if (!name) return;
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
      {ui.manageTab === 'maps' ? 'Mappe e link' : ui.manageTab === 'groups' ? 'Gruppi' : 'Categorie'}
    </h2>
    <button class="ghost-icon" type="button" title="Chiudi" onclick={() => ui.closeManage()}>
      <Icon name="close" />
    </button>
  </header>

  <div class="tabs" role="tablist">
    <button
      class="tab"
      class:is-on={ui.manageTab === 'categories'}
      type="button"
      role="tab"
      onclick={() => (ui.manageTab = 'categories')}
    >
      Categorie
    </button>
    <button
      class="tab"
      class:is-on={ui.manageTab === 'groups'}
      type="button"
      role="tab"
      onclick={() => (ui.manageTab = 'groups')}
    >
      Gruppi
    </button>
    <button
      class="tab"
      class:is-on={ui.manageTab === 'maps'}
      type="button"
      role="tab"
      onclick={() => (ui.manageTab = 'maps')}
    >
      Mappe
    </button>
  </div>

  {#if ui.manageTab === 'categories'}
    <div class="tab-panel">
      {#if store.categories.length > MANY}
        <input class="list-filter" type="search" placeholder="Filtra le categorie" bind:value={categoryFilter} />
      {/if}
      <ul id="category-list" data-fade="none" use:fadeEdges>
        {#each visibleCategories as category (category.id)}
          <li>
            <button
              type="button"
              class="emoji-btn"
              title="Cambia emoji"
              onclick={(event) =>
                ui.askEmoji(event.currentTarget, (emoji) => store.patchCategory(category, { emoji }))}
            >
              {category.emoji}
            </button>
            <input
              type="text"
              maxlength="40"
              value={category.name}
              onchange={(event) => store.patchCategory(category, { name: event.currentTarget.value })}
            />
            <button
              type="button"
              class="swatch"
              title="Colore"
              style:--c={category.color}
              aria-label="Colore"
              onclick={(event) =>
                ui.askColor(event.currentTarget, category.color, (color) =>
                  store.patchCategory(category, { color }),
                )}
            ></button>
            <span class="count">{store.countIn(category.id) || ''}</span>
            <button
              type="button"
              class="ghost-icon"
              title="Elimina categoria"
              onclick={() => store.deleteCategory(category)}
            >
              <Icon name="trash" />
            </button>
          </li>
        {/each}
        {#if store.categories.length && !visibleCategories.length}
          <li class="list-empty">Nessuna categoria con questo nome.</li>
        {/if}
      </ul>

      <form id="category-form" class="add-row" class:is-ready={newCategoryName.trim()} onsubmit={addCategory}>
        <button
          type="button"
          class="emoji-btn"
          title="Scegli emoji"
          onclick={(event) => ui.askEmoji(event.currentTarget, (emoji) => (newEmoji = emoji))}
        >
          {newEmoji}
        </button>
        <input
          name="name"
          required
          maxlength="40"
          placeholder="Nuova categoria"
          bind:this={categoryInput}
          bind:value={newCategoryName}
        />
        <button
          type="button"
          class="swatch"
          title="Colore"
          style:--c={newColor}
          aria-label="Colore"
          onclick={(event) => ui.askColor(event.currentTarget, newColor, (color) => (newColor = color))}
        ></button>
        <button type="submit" class="ghost-icon add-go" title="Aggiungi categoria">
          <Icon name="plus" />
        </button>
      </form>
    </div>
  {:else if ui.manageTab === 'maps'}
    <div class="tab-panel">
      <ul id="map-list" data-fade="none" use:fadeEdges>
        {#each store.maps as map (map.id)}
          {@const open = map.id === store.activeMap?.id}
          {@const places = store.places.filter((place) => place.mapId === map.id).length}
          {@const url = mapUrl(auth.account?.handle ?? '', map.slug)}
          <li class="map-card" class:is-open={open} class:is-public={map.published}>
            <div class="map-top">
              <button
                type="button"
                class="map-open"
                title={open ? 'È la mappa aperta' : 'Apri questa mappa'}
                aria-pressed={open}
                onclick={() => store.openMap(map.id)}
              >
                <Icon name="pin" />
              </button>
              <input
                class="map-name"
                type="text"
                maxlength="40"
                value={map.name}
                onchange={(event) => store.patchMap(map, { name: event.currentTarget.value })}
              />
              <button
                type="button"
                class="ghost-icon"
                title="Elimina mappa"
                disabled={store.maps.length <= 1}
                onclick={() => store.deleteMap(map)}
              >
                <Icon name="trash" />
              </button>
            </div>

            <div class="map-foot">
              <span class="map-meta">
                {places}
                {places === 1 ? 'posto' : 'posti'}{open ? ' · aperta' : ''}
              </span>
              <Switch
                checked={map.published}
                onchange={(published) => store.patchMap(map, { published })}
                label={map.published ? 'Pubblica' : 'Solo tua'}
                title={map.published ? 'Smetti di pubblicarla' : 'Pubblicala'}
              />
            </div>

            {#if map.published}
              <LinkRow
                prefix={'/u/' + (auth.account?.handle ?? '') + '/'}
                value={map.slug}
                {url}
                onchange={(slug) => store.patchMap(map, { slug })}
              />
            {/if}
          </li>
        {/each}
      </ul>

      <form id="map-form" class="add-row" class:is-ready={newMapName.trim()} onsubmit={addMap}>
        <input name="name" required maxlength="40" placeholder="Nuova mappa — Islanda, Ristoranti…" bind:value={newMapName} />
        <button type="submit" class="ghost-icon add-go" title="Aggiungi mappa">
          <Icon name="plus" />
        </button>
      </form>

      {#if store.maps.some((map) => map.published)}
        <div class="profile-link">
          <span class="eyebrow">Un link per tutte</span>
          <p>Le mappe pubblicate stanno insieme qui: è l'indirizzo da mettere in bio.</p>
          <LinkRow
            prefix="/u/"
            value={auth.account?.handle ?? ''}
            url={profileUrl(auth.account?.handle ?? '')}
            title="Copia il link del profilo"
          />
        </div>
      {/if}

      <p class="sheet-note">
        Ogni mappa è un indice a sé: i suoi posti, i suoi gruppi. Le categorie invece sono tue e
        valgono su tutte. Quella che pubblichi la vede chi ha il link: i posti segnati come privati
        restano fuori.
      </p>
    </div>
  {:else}
    <div class="tab-panel">
      {#if store.currentGroups.length > MANY}
        <input class="list-filter" type="search" placeholder="Filtra i gruppi" bind:value={groupFilter} />
      {/if}
      <ul id="group-list" data-fade="none" use:fadeEdges>
        {#each visibleGroups as group (group.id)}
          <li>
            <input
              type="text"
              maxlength="40"
              value={group.name}
              onchange={(event) => store.patchGroup(group, { name: event.currentTarget.value })}
            />
            <span class="count">{store.countGroup(group.id) || ''}</span>
            <button
              type="button"
              class="ghost-icon"
              title="Elimina gruppo"
              onclick={() => store.deleteGroup(group)}
            >
              <Icon name="trash" />
            </button>
          </li>
        {/each}
        {#if store.currentGroups.length && !visibleGroups.length}
          <li class="list-empty">Nessun gruppo con questo nome.</li>
        {/if}
      </ul>

      <form id="group-form" class="add-row" class:is-ready={newGroupName.trim()} onsubmit={addGroup}>
        <input
          name="name"
          required
          maxlength="40"
          placeholder="Nuovo gruppo — Padova, Islanda…"
          bind:this={groupInput}
          bind:value={newGroupName}
        />
        <button type="submit" class="ghost-icon add-go" title="Aggiungi gruppo">
          <Icon name="plus" />
        </button>
      </form>

      <p class="sheet-note">
        Un gruppo è dove stanno i posti: una città, un viaggio, una lista. Un posto ne può portare
        quanti ne vuoi.
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

/* tabs -------------------------------------------------------------------- */

.tabs {
  display: flex;
  gap: 2px;
  padding: 3px;
  margin-bottom: 12px;
  border-radius: 99px;
  background: var(--sunken);
}

.tab {
  flex: 1 1 50%;
  min-width: 0;
  padding: 7px 12px;
  border: 0;
  border-radius: 99px;
  background: none;
  color: var(--ink-3);
  font-size: 12.5px;
  font-weight: 540;
  transition: background 0.16s, color 0.16s, box-shadow 0.16s;
}

.tab:hover { color: var(--ink-2); }

.tab.is-on {
  background: var(--glass-strong);
  color: var(--ink);
  /* a wide blur would bleed past the 3px gutter and read as less padding below */
  box-shadow: 0 1px 2px rgb(10 13 18 / 0.18);
}

/* the row that adds one more ----------------------------------------------- */

.add-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px;
  border: 1px dashed var(--hairline);
  border-radius: var(--r-md);
  transition: border-color 0.16s, background 0.16s, box-shadow 0.16s;
}

.add-row input[name="name"] {
  background: none;
  border-color: transparent;
  padding: 6px 8px;
}

/* the row shows the focus for the whole group; the field must not add a second */
.add-row input[name="name"]:hover,
.add-row input[name="name"]:focus {
  background: none;
  border-color: transparent;
  box-shadow: none;
}

.add-row:focus-within {
  border-style: solid;
  border-color: color-mix(in srgb, var(--accent) 40%, transparent);
  box-shadow: 0 0 0 3.5px color-mix(in srgb, var(--accent) 10%, transparent);
}

.add-go { color: var(--ink-3); }

.add-row.is-ready .add-go {
  background: var(--accent);
  color: var(--on-accent);
}

.add-row .emoji-btn { width: 32px; height: 32px; font-size: 16px; }

.add-row .swatch { width: 24px; height: 24px; margin: 0 2px; }

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

/* ogni mappa è una cosa sola: il nome, quanto contiene, il suo link */
.map-card {
  display: grid;
  gap: 6px;
  padding: 8px 8px 9px;
  border-radius: var(--r-md);
  background: var(--sunken);
  box-shadow: inset 0 0 0 1px var(--hairline-soft);
  transition: background 0.16s, box-shadow 0.16s;
}

.map-card:hover { background: var(--sunken-hover); }

/* quella aperta porta il segno, non una parola in più */
.map-card.is-open {
  background: var(--sunken-hover);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ink) 20%, transparent);
}

.map-top { display: flex; align-items: center; gap: 4px; }

.map-open {
  display: grid;
  place-items: center;
  flex: none;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 50%;
  background: none;
  color: var(--ink-3);
  transition: background 0.14s, color 0.14s;
}

.map-open:hover { background: var(--glass-strong); color: var(--ink-2); }
.map-open :global(.ico) { width: 15px; height: 15px; }
.map-card.is-open .map-open { color: var(--ink); }

/* il nome è un titolo finché non lo tocchi */
.map-name {
  flex: 1;
  min-width: 0;
  padding: 5px 7px;
  background: none;
  border-color: transparent;
  box-shadow: none;
  font-size: 13.5px;
  font-weight: 560;
  letter-spacing: -0.012em;
}

.map-name:hover { background: var(--glass-strong); }
.map-name:focus { background: var(--glass-strong); box-shadow: 0 0 0 1px var(--hairline); }

.map-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 0 4px 0 8px;
}

.map-meta {
  font-size: 11.5px;
  color: var(--ink-3);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

#map-list .ghost-icon:disabled { opacity: 0.3; cursor: default; }

.profile-link {
  display: grid;
  gap: 6px;
  margin-top: 4px;
  padding-top: 12px;
  border-top: 1px solid var(--hairline-soft);
}

.profile-link p { margin: 0; font-size: 11.5px; line-height: 1.45; color: var(--ink-3); }

/* lì dentro la riga sta su una scheda, non su una card: si smorza */
.profile-link :global(.link-row) { background: var(--sunken); box-shadow: none; }

#group-list:empty { display: none; }

#group-list li {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px;
  border-radius: var(--r-md);
  transition: background 0.15s;
}

#group-list li:hover { background: var(--sunken); }

#group-list .count {
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--ink-3);
  white-space: nowrap;
}

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

#category-list li {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px;
  border-radius: var(--r-md);
  transition: background 0.15s;
}

#category-list li:hover { background: var(--sunken); }

/* un campo deve sembrare un campo anche prima che ci passi sopra il mouse */
#category-list input[type="text"], #group-list input {
  background: var(--sunken);
  border-color: transparent;
  padding: 6px 8px;
  font-weight: 500;
}

#category-list li:hover input[type="text"],
#group-list li:hover input { background: var(--sunken-hover); }

#category-list .count {
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--ink-3);
  white-space: nowrap;
}

/* the list is a dense row of controls; the form below is the roomy one */
#category-list .emoji-btn { width: 32px; height: 32px; font-size: 16px; }

#category-list .swatch { width: 24px; height: 24px; margin: 0 2px; }
</style>
