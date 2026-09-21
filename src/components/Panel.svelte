<script lang="ts">
  import { mapBridge } from '../lib/mapBridge.svelte';
  import { auth } from '../lib/auth.svelte';
  import { here } from '../lib/here.svelte';
  import { store } from '../lib/store.svelte';
  import { ui } from '../lib/ui.svelte';
  import { viewport } from '../lib/viewport.svelte';
  import Chip from './Chip.svelte';
  import EmptyState from './EmptyState.svelte';
  import Icon from './Icon.svelte';
  import MapSwitcher from './MapSwitcher.svelte';
  import PanelSkeleton from './PanelSkeleton.svelte';
  import PlaceList from './PlaceList.svelte';
  import SearchTrigger from './SearchTrigger.svelte';

  /**
   * Su uno schermo stretto il pannello e una sheet non ci stanno insieme:
   * aprendo una sheet il pannello si fa piccolo da solo, e resta come lo
   * lasci se lo apri o lo chiudi a mano.
   */
  /**
   * Oltre una certa soglia i chip diventano un muro: si mostrano i primi e
   * il resto sta dietro a un "+N", che resta aperto se lo apri.
   */
  const CAP = { groups: 6, categories: 8 };
  let allGroups = $state(false);
  let allCategories = $state(false);

  const shownGroups = $derived(allGroups ? store.currentGroups : store.currentGroups.slice(0, CAP.groups));
  const shownCategories = $derived(
    allCategories ? store.categories : store.categories.slice(0, CAP.categories),
  );
  const hiddenGroups = $derived(store.currentGroups.length - shownGroups.length);
  const hiddenCategories = $derived(store.categories.length - shownCategories.length);
  const everythingVisible = $derived(store.hiddenCategories.length === 0);

  const collapsed = $derived(
    viewport.narrow && (ui.panelWish === 'closed' || (ui.panelWish === 'auto' && ui.sheet !== 'none')),
  );

  /** The index itself: what is on screen right now, nearest first. */
  const rows = $derived.by(() => {
    mapBridge.view.moves; // re-read whenever the map settles somewhere new
    return store.currentPlaces
      .filter((place) => store.visible(place) && mapBridge.contains(place.lat, place.lng))
      .map((place) => ({ place, distance: mapBridge.distanceFrom(place.lat, place.lng) }))
      .sort((a, b) => a.distance - b.distance);
  });

  function pickGroup(id: string | null) {
    store.setGroup(id === store.activeGroup ? null : id);
    if (!store.activeGroup) return;
    const points = store.currentPlaces
      .filter(
        (place) =>
          place.groupIds.includes(store.activeGroup!) && !store.hiddenCategories.includes(place.categoryId),
      )
      .map((place) => [place.lat, place.lng] as [number, number]);
    mapBridge.flyToPoints(points);
  }
</script>

<div id="panel" class="surface" class:is-collapsed={collapsed}>
  <div class="panel-head">
    <MapSwitcher />
    <span class="panel-head-end">
      {#if !store.loading}
        <span
          id="place-count"
          class="tally"
          title={store.shownMaps.length > 1
            ? 'Di ' + store.shownMaps.map((map) => map.name).join(' e ')
            : undefined}
        >
          {store.currentPlaces.length}
          {store.currentPlaces.length === 1 ? 'posto' : 'posti'}
        </span>
      {/if}
      <button
        class="ghost-icon share-btn"
        class:is-public={store.activeMap?.published}
        type="button"
        title={store.activeMap?.published
          ? 'Questa mappa è pubblica: copia o cambia il link'
          : 'Pubblica questa mappa e prendi il link'}
        onclick={() => ui.toggleManage('maps')}
      >
        <Icon name="link" />
      </button>
      <button
        class="ghost-icon"
        type="button"
        title={'Esci da ' + (auth.account?.email ?? '')}
        onclick={() => auth.leave()}
      >
        <Icon name="logout" />
      </button>
      {#if viewport.narrow}
        <button
          class="ghost-icon panel-toggle"
          type="button"
          aria-expanded={!collapsed}
          title={collapsed ? 'Mostra filtri ed elenco' : 'Riduci il pannello'}
          onclick={() => (ui.panelWish = collapsed ? 'open' : 'closed')}
        >
          <Icon name={collapsed ? 'expand' : 'collapse'} />
        </button>
      {/if}
    </span>
  </div>

  <SearchTrigger />

  {#if !collapsed}
    {#if store.categories.length && !store.loading}
      <div class="panel-row" id="group-head">
        <span class="eyebrow">Gruppi</span>
        <button
          id="add-group"
          class="ghost-icon"
          type="button"
          title="Aggiungi un gruppo"
          onclick={() => ui.toggleManage('groups', 'add')}
        >
          <Icon name="plus" />
        </button>
      </div>
      <div id="group-filters">
        {#if store.currentGroups.length}
          <Chip
            label="Tutti"
            count={store.currentPlaces.length}
            look={store.activeGroup === null ? 'sel' : 'off'}
            onclick={() => pickGroup(null)}
          />
        {:else}
          <p class="section-hint">Una città, un viaggio, una lista: i gruppi tagliano l'indice per dove stanno i posti.</p>
        {/if}
        {#each shownGroups as group (group.id)}
          <Chip
            label={group.name}
            count={store.countGroup(group.id)}
            look={store.activeGroup === group.id ? 'sel' : 'off'}
            onclick={() => pickGroup(group.id)}
          />
        {/each}
        {#if hiddenGroups > 0}
          <Chip label={'+' + hiddenGroups} look="off" onclick={() => (allGroups = true)} />
        {:else if allGroups && store.currentGroups.length > CAP.groups}
          <Chip label="meno" look="off" onclick={() => (allGroups = false)} />
        {/if}
      </div>
    {/if}

    {#if store.loading}
      <PanelSkeleton />
    {:else}
      {#if store.categories.length}
        <div class="panel-row">
          <span class="eyebrow">Categorie</span>
          <span class="row-actions">
            {#if store.categories.length > 1}
              <button
                class="link-btn"
                type="button"
                title={everythingVisible ? 'Nascondile tutte' : 'Mostrale tutte'}
                onclick={() =>
                  everythingVisible ? store.hideAllCategories() : store.showAllCategories()}
              >
                {everythingVisible ? 'nessuna' : 'tutte'}
              </button>
            {/if}
            <button
              id="add-category"
              class="ghost-icon"
              type="button"
              title="Aggiungi una categoria"
              onclick={() => ui.toggleManage('categories', 'add')}
            >
              <Icon name="plus" />
            </button>
          </span>
        </div>

        <div id="filters">
          {#each shownCategories as category (category.id)}
            <Chip
              color={category.color}
              emoji={category.emoji}
              label={category.name}
              count={store.countIn(category.id)}
              look={store.hiddenCategories.includes(category.id) ? 'off' : 'on'}
              onclick={() => store.toggleCategory(category.id)}
            />
          {/each}
          {#if hiddenCategories > 0}
            <Chip label={'+' + hiddenCategories} look="off" onclick={() => (allCategories = true)} />
          {:else if allCategories && store.categories.length > CAP.categories}
            <Chip label="meno" look="off" onclick={() => (allCategories = false)} />
          {/if}
        </div>
      {/if}

      {#if store.currentPlaces.length}
        <div class="panel-row" id="list-head">
          <span class="eyebrow">In vista</span>
          <span class="list-end">
            <!-- i chilometri partono da qualcosa: qui si dice da cosa, e
                 passandoci sopra quel qualcosa si illumina sulla mappa -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <span
              class="list-hint"
              title={here.spot
                ? 'Le distanze partono da dove sei'
                : 'Le distanze partono dal centro della mappa, il cerchietto chiaro'}
              onpointerenter={() => document.body.classList.add('centre-hint')}
              onpointerleave={() => document.body.classList.remove('centre-hint')}
            >
              {here.spot ? 'da dove sei' : 'dal centro'}
            </span>
            <span id="list-count" class="tally">{rows.length}</span>
          </span>
        </div>
        <PlaceList {rows} />
      {:else}
        <EmptyState />
      {/if}
    {/if}
  {/if}
</div>

<style>
/* Panel
   The left rail: wordmark, search, category filters and the index itself —
   the places currently on screen, nearest first. */

/* ------------------------------------------------------------------- panel */

#panel {
  position: absolute;
  top: 14px;
  left: 14px;
  z-index: var(--z-panel);
  width: min(326px, calc(100vw - 28px));
  max-height: calc(100vh - 116px);
  padding: var(--card-pad);
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: hidden;
  animation: rise 0.5s var(--ease);
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 2px 4px 0 6px;
}

/* il conteggio appartiene al titolo, non al mezzo: viaggia col chevron */
.panel-head-end {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: none;
}

.panel-toggle { margin-right: -4px; }

/* quando la mappa è pubblica il link si accende: lo stato si vede da lì */
.share-btn.is-public { color: var(--ink); background: var(--sunken-hover); }

.tally {
  font-size: 11.5px;
  font-weight: 560;
  font-variant-numeric: tabular-nums;
  color: var(--ink-3);
  background: var(--sunken);
  border-radius: 99px;
  padding: 2px 9px;
}

.list-end { display: flex; align-items: center; gap: 8px; }

.list-hint {
  font-size: 10.5px;
  letter-spacing: 0;
  text-transform: none;
  color: var(--ink-3);
}

.panel-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-left: 6px;
  margin-bottom: -4px;
}

.row-actions {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.link-btn {
  border: 0;
  border-radius: 99px;
  padding: 3px 8px;
  background: none;
  color: var(--ink-3);
  font-size: 11px;
  font-weight: 560;
  letter-spacing: 0.02em;
  transition: background 0.15s, color 0.15s;
}

.link-btn:hover { background: var(--sunken-hover); color: var(--ink); }

.section-hint {
  margin: 0;
  padding: 0 6px 2px;
  font-size: 12px;
  line-height: 1.45;
  color: var(--ink-3);
}

/* filters ----------------------------------------------------------------- */

#filters, #group-filters { display: flex; flex-wrap: wrap; gap: 6px; }

@media (max-width: 600px) {
  #panel {
    left: 12px;
    right: 12px;
    top: 12px;
    width: auto;
    max-height: 48vh;
  }
}
</style>
