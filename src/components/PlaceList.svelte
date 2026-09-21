<script lang="ts">
  import { formatDistance } from '../lib/format';
  import { mapBridge } from '../lib/mapBridge.svelte';
  import { store } from '../lib/store.svelte';
  import type { LocalPlace } from '../lib/types';

  let { rows }: { rows: { place: LocalPlace; distance: number }[] } = $props();

  /** Keep the row of the open popup in sight without stealing the scroll. */
  function followActive(node: HTMLLIElement) {
    $effect(() => {
      if (mapBridge.activeKey && node.dataset.key === mapBridge.activeKey) {
        node.scrollIntoView({ block: 'nearest' });
      }
    });
  }
</script>

<ul id="place-list">
  {#if rows.length === 0}
    <li class="row-empty">Nessun posto in questa parte di mappa.</li>
  {:else}
    {#each rows as { place, distance } (place.key)}
      {@const category = store.categoryOf(place.categoryId)}
      <li data-key={place.key} use:followActive>
        <button
          type="button"
          class="row"
          class:is-active={mapBridge.activeKey === place.key}
          style:--c={category?.color ?? '#6b7280'}
          onpointerenter={() => mapBridge.highlight(place, true)}
          onpointerleave={() => mapBridge.highlight(place, false)}
          onfocus={() => mapBridge.highlight(place, true)}
          onblur={() => mapBridge.highlight(place, false)}
          onclick={() => mapBridge.focus(place)}
        >
          <span class="row-dot">{category?.emoji ?? '📍'}</span>
          <span class="row-body">
            <span class="row-name">{place.name}</span>
            <span class="row-note">{place.note || category?.name || ''}</span>
          </span>
          <span class="row-dist">{formatDistance(distance)}</span>
        </button>
      </li>
    {/each}
  {/if}
</ul>
