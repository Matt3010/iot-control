<script lang="ts">
  import { formatDistance } from '../lib/format';
  import { fadeEdges } from '../lib/overflow';
  import { mapBridge } from '../lib/mapBridge.svelte';
  import { ui } from '../lib/ui.svelte';
  import { viewport } from '../lib/viewport.svelte';
  import { store } from '../lib/store.svelte';
  import type { LocalPlace } from '../lib/types';
  import Icon from './Icon.svelte';

  let {
    rows,
    near = false,
  }: { rows: { place: LocalPlace; distance: number }[]; near?: boolean } = $props();

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
    <li class="row-empty">
      {near
        ? 'Nessun posto: i filtri qui sopra li stanno escludendo tutti.'
        : 'Nessun posto in questa parte di mappa.'}
    </li>
  {:else}
    {#each rows as { place, distance } (place.key)}
      {@const category = store.categoryOf(place.categoryId)}
      {@const from = store.shownMaps.length > 1 ? store.maps.find((m) => m.id === place.mapId) : undefined}
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
          onclick={() => {
            // la scheda del posto si apre dove c'è il pannello: fagli spazio
            if (viewport.narrow) ui.panelWish = 'closed';
            mapBridge.focus(place);
          }}
        >
          <span class="row-dot">{category?.emoji ?? '📍'}</span>
          <span class="row-body">
            <span class="row-name">{place.name}</span>
            <span class="row-note">
              {#if from}<span class="row-map">{from.name}</span>{/if}
              {place.note || category?.name || ''}
            </span>
          </span>
          {#if place.private}
            <span class="row-lock" title="Privato: resta fuori dalla mappa pubblica">
              <Icon name="lock" />
            </span>
          {/if}
          <span
            class="row-dist"
            title={formatDistance(distance) + (near ? ' da dove sei' : ' dal centro della mappa')}
          >
            {formatDistance(distance)}
          </span>
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

/* con più mappe accese, ogni posto dice da quale viene */
.row-map {
  padding: 1px 6px;
  margin-right: 5px;
  border-radius: 99px;
  background: var(--sunken-hover);
  font-size: 10.5px;
  font-weight: 560;
  color: var(--ink-2);
}

.row-lock {
  display: inline-flex;
  flex: none;
  color: var(--ink-3);
}

.row-lock :global(.ico) { width: 12px; height: 12px; }

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

/* il corpo si prende quello che avanza, così le distanze finiscono tutte
   incolonnate a destra invece di seguire la lunghezza del nome */
.row-body { display: grid; flex: 1; min-width: 0; }

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
  margin-left: auto;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  text-align: right;
  color: var(--ink-3);
}

.row-empty {
  padding: 6px 8px 8px;
  font-size: 12.5px;
  color: var(--ink-3);
}
</style>
