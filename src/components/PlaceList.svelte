<script lang="ts">
  import { formatDistance } from '../lib/format';
  import { fadeEdges } from '../lib/overflow';
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

<ul id="place-list" data-fade="none" use:fadeEdges>
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

<style>
/* index ------------------------------------------------------------------- */

:global(#place-list[data-fade='bottom']) {
  -webkit-mask-image: linear-gradient(180deg, #000 calc(100% - 22px), transparent);
  mask-image: linear-gradient(180deg, #000 calc(100% - 22px), transparent);
}

:global(#place-list[data-fade='top']) {
  -webkit-mask-image: linear-gradient(0deg, #000 calc(100% - 22px), transparent);
  mask-image: linear-gradient(0deg, #000 calc(100% - 22px), transparent);
}

:global(#place-list[data-fade='both']) {
  -webkit-mask-image: linear-gradient(180deg, transparent, #000 22px, #000 calc(100% - 22px), transparent);
  mask-image: linear-gradient(180deg, transparent, #000 22px, #000 calc(100% - 22px), transparent);
}

#place-list {
  list-style: none;
  margin: -4px -4px 0;
  padding: 0 4px 4px;
  display: grid;
  gap: 2px;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.row {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 7px 8px;
  border: 0;
  border-radius: var(--r-md);
  background: none;
  text-align: left;
  cursor: pointer;
  transition: background 0.14s;
}

.row:hover { background: var(--sunken); }

.row.is-active {
  background: color-mix(in srgb, var(--c) 13%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--c) 32%, transparent);
}

.row-dot {
  display: grid;
  place-items: center;
  flex: none;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--c) 16%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--c) 34%, transparent);
  font-family: var(--emoji);
  font-size: 13px;
  line-height: 1;
}

.row-body { display: grid; min-width: 0; }

.row-name {
  font-size: 13px;
  font-weight: 540;
  letter-spacing: -0.008em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.row-note {
  font-size: 11.5px;
  color: var(--ink-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.row-dist {
  flex: none;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--ink-3);
}

.row-empty {
  padding: 6px 8px 8px;
  font-size: 12.5px;
  color: var(--ink-3);
}
</style>
