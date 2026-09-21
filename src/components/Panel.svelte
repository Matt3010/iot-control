<script lang="ts">
  import { mapBridge } from '../lib/mapBridge.svelte';
  import { store } from '../lib/store.svelte';
  import { ui } from '../lib/ui.svelte';
  import Chip from './Chip.svelte';
  import Icon from './Icon.svelte';
  import PlaceList from './PlaceList.svelte';
  import SearchTrigger from './SearchTrigger.svelte';

  /** The index itself: what is on screen right now, nearest first. */
  const rows = $derived.by(() => {
    mapBridge.view.moves; // re-read whenever the map settles somewhere new
    return store.places
      .filter((place) => store.visible(place) && mapBridge.contains(place.lat, place.lng))
      .map((place) => ({ place, distance: mapBridge.distanceFromCentre(place.lat, place.lng) }))
      .sort((a, b) => a.distance - b.distance);
  });

  function pickGroup(id: string | null) {
    store.setGroup(id === store.activeGroup ? null : id);
    if (!store.activeGroup) return;
    const points = store.places
      .filter((place) => place.groupId === store.activeGroup && !store.hiddenCategories.includes(place.categoryId))
      .map((place) => [place.lat, place.lng] as [number, number]);
    mapBridge.flyToPoints(points);
  }
</script>

<div id="panel" class="surface">
  <div class="panel-head">
    <span class="wordmark"><Icon name="pin" /> Place Index</span>
    <span id="place-count" class="tally">{store.places.length}</span>
  </div>

  <SearchTrigger />

  {#if store.groups.length}
    <div class="panel-row" id="group-head">
      <span class="eyebrow">Gruppi</span>
    </div>
    <div id="group-filters">
      <Chip
        label="Tutti"
        count={store.places.length}
        look={store.activeGroup === null ? 'sel' : 'off'}
        onclick={() => pickGroup(null)}
      />
      {#each store.groups as group (group.id)}
        <Chip
          label={group.name}
          count={store.countGroup(group.id)}
          look={store.activeGroup === group.id ? 'sel' : 'off'}
          onclick={() => pickGroup(group.id)}
        />
      {/each}
    </div>
  {/if}

  <div class="panel-row">
    <span class="eyebrow">Categorie</span>
    <button
      id="manage-btn"
      class="ghost-icon"
      type="button"
      title="Gestisci categorie e gruppi"
      onclick={() => ui.toggleManage()}
    >
      <Icon name="filters" />
    </button>
  </div>

  <div id="filters">
    {#each store.categories as category (category.id)}
      <Chip
        color={category.color}
        emoji={category.emoji}
        label={category.name}
        count={store.countIn(category.id)}
        look={store.hiddenCategories.includes(category.id) ? 'off' : 'on'}
        onclick={() => store.toggleCategory(category.id)}
      />
    {/each}
  </div>

  {#if store.places.length}
    <div class="panel-row" id="list-head">
      <span class="eyebrow">In vista</span>
      <span id="list-count" class="tally">{rows.length}</span>
    </div>
    <PlaceList {rows} />
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
  padding: 2px 4px 0 6px;
}

.wordmark {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 13.5px;
  font-weight: 620;
  letter-spacing: -0.02em;
}

.wordmark :global(.ico) { width: 16px; height: 16px; color: var(--ink-2); }

.tally {
  font-size: 11.5px;
  font-weight: 560;
  font-variant-numeric: tabular-nums;
  color: var(--ink-3);
  background: var(--sunken);
  border-radius: 99px;
  padding: 2px 9px;
}

.panel-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-left: 6px;
  margin-bottom: -4px;
}

/* filters ----------------------------------------------------------------- */

#filters, #group-filters { display: flex; flex-wrap: wrap; gap: 6px; }

#filters:empty::before {
  content: "Nessuna categoria. Creane una per iniziare.";
  font-size: 12.5px;
  color: var(--ink-3);
  padding: 2px 6px 4px;
}

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
