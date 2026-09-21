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
