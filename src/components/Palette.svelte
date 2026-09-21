<script lang="ts">
  import { formatDistance, normalise } from '../lib/format';
  import { mapBridge } from '../lib/mapBridge.svelte';
  import { store } from '../lib/store.svelte';
  import type { LocalPlace } from '../lib/types';
  import { ui } from '../lib/ui.svelte';
  import Icon from './Icon.svelte';

  interface Hit {
    lat: string;
    lon: string;
    name?: string;
    display_name: string;
  }

  interface Row {
    color?: string;
    emoji?: string;
    name: string;
    note: string;
    meta: string;
    pick: () => void;
  }

  let query = $state('');
  let addresses = $state<Hit[]>([]);
  let searching = $state(false);
  let selected = $state(0);
  let input = $state<HTMLInputElement>();
  let results = $state<HTMLDivElement>();

  /** Your own places, ranked: name first, then category, then group, then notes. */
  const matches = $derived.by(() => {
    const needle = normalise(query.trim());
    const scored: { place: LocalPlace; rank: number; distance: number }[] = [];

    for (const place of store.places) {
      const name = normalise(place.name);
      let rank = Number.POSITIVE_INFINITY;
      if (!needle) rank = 5;
      else if (name.startsWith(needle)) rank = 0;
      else if (name.includes(needle)) rank = 1;
      else if (normalise(store.categoryOf(place.categoryId)?.name ?? '').includes(needle)) rank = 2;
      else if (place.groupIds.some((id) => normalise(store.groupOf(id)?.name ?? '').includes(needle))) rank = 3;
      else if (normalise(place.note ?? '').includes(needle)) rank = 4;
      if (rank === Number.POSITIVE_INFINITY) continue;
      scored.push({ place, rank, distance: mapBridge.distanceFromCentre(place.lat, place.lng) });
    }

    return scored.sort((a, b) => a.rank - b.rank || a.distance - b.distance).slice(0, 8);
  });

  const placeRows = $derived<Row[]>(
    matches.map(({ place, distance }) => {
      const category = store.categoryOf(place.categoryId);
      const groups = place.groupIds.map((id) => store.groupOf(id)?.name).filter(Boolean);
      return {
        color: category?.color,
        emoji: category?.emoji ?? '📍',
        name: place.name,
        note: [groups.join(', '), place.note || category?.name].filter(Boolean).join(' · '),
        meta: formatDistance(distance),
        pick: () => {
          ui.paletteOpen = false;
          store.reveal(place);
          mapBridge.focus(place);
        },
      };
    }),
  );

  const addressRows = $derived<Row[]>(
    addresses.map((hit) => {
      const label = hit.name || hit.display_name.split(',')[0]!;
      return {
        name: label,
        note: hit.display_name,
        meta: 'aggiungi qui',
        pick: () => {
          ui.paletteOpen = false;
          const lat = Number(hit.lat);
          const lng = Number(hit.lon);
          mapBridge.goTo(lat, lng, 16);
          ui.openPlace({
            lat,
            lng,
            name: label,
            note: hit.display_name,
            groupIds: store.activeGroup ? [store.activeGroup] : [],
          });
        },
      };
    }),
  );

  const rows = $derived([...placeRows, ...addressRows]);

  $effect(() => {
    // keep the cursor inside the list as it grows and shrinks
    if (selected >= rows.length) selected = Math.max(0, rows.length - 1);
  });

  /** Addresses cost a round trip, so they follow the typing at a distance. */
  $effect(() => {
    const needle = query.trim();
    if (needle.length < 3) {
      addresses = [];
      searching = false;
      return;
    }

    searching = true;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const url = new URL('https://nominatim.openstreetmap.org/search');
        url.search = new URLSearchParams({
          q: needle,
          format: 'jsonv2',
          limit: '5',
          'accept-language': 'it',
        }).toString();
        const response = await fetch(url, { headers: { accept: 'application/json' }, signal: controller.signal });
        addresses = response.ok ? ((await response.json()) as Hit[]) : [];
      } catch (error) {
        if ((error as Error).name === 'AbortError') return;
        addresses = [];
      }
      searching = false;
    }, 350);

    return () => {
      clearTimeout(timer);
      controller.abort();
      searching = false;
    };
  });

  $effect(() => {
    input?.focus();
  });

  function move(step: number) {
    if (!rows.length) return;
    selected = (selected + step + rows.length) % rows.length;
    results?.querySelector<HTMLElement>('.palette-row.is-sel')?.scrollIntoView({ block: 'nearest' });
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      move(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      move(-1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      rows[selected]?.pick();
    }
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div
  id="palette"
  onpointerdown={(event) => {
    if (event.target === event.currentTarget) ui.paletteOpen = false;
  }}
>
  <div class="palette-card surface">
    <div class="palette-field">
      <Icon name="search" />
      <input
        id="palette-input"
        type="text"
        autocomplete="off"
        spellcheck="false"
        placeholder="Cerca tra i tuoi posti, o un indirizzo"
        bind:this={input}
        bind:value={query}
        onkeydown={onKeydown}
      />
      {#if searching}<span id="palette-spinner"></span>{/if}
      <kbd>Esc</kbd>
    </div>

    <div id="palette-results" bind:this={results}>
      {#if placeRows.length}
        <div class="palette-section">
          <span class="eyebrow">I tuoi posti</span>
          {#if !query.trim()}<span class="palette-meta">i più vicini</span>{/if}
        </div>
      {/if}

      {#each rows as row, index (row.name + index)}
        {#if index === placeRows.length}
          <div class="palette-section">
            <span class="eyebrow">Indirizzi</span>
            <span class="palette-meta">da OpenStreetMap</span>
          </div>
        {/if}
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <div
          class="palette-row"
          class:is-sel={index === selected}
          style:--c={row.color}
          onpointerenter={() => (selected = index)}
          onclick={row.pick}
        >
          <span class="palette-dot">
            {#if row.emoji}{row.emoji}{:else}<Icon name="pin" />{/if}
          </span>
          <span class="palette-body">
            <span class="palette-name">{row.name}</span>
            <span class="palette-note">{row.note}</span>
          </span>
          <span class="palette-meta">{row.meta}</span>
        </div>
      {/each}

      {#if rows.length === 0}
        <p class="palette-empty">
          {query.trim().length < 3
            ? 'Scrivi almeno tre lettere per cercare anche tra gli indirizzi.'
            : 'Nessun posto e nessun indirizzo con questo nome.'}
        </p>
      {/if}
    </div>

    <div class="palette-foot">
      <span><kbd>↑</kbd><kbd>↓</kbd> muoviti</span>
      <span><kbd>↵</kbd> apri</span>
    </div>
  </div>
</div>

<style>
/* Palette
   ⌘K. One field over a dimmed map: your own places first, addresses after. */

#palette {
  position: absolute;
  inset: 0;
  z-index: var(--z-palette);
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 12vh 16px 16px;
  background: rgb(8 10 14 / 0.3);
  -webkit-backdrop-filter: blur(3px);
  backdrop-filter: blur(3px);
  animation: fade 0.18s var(--ease);
}

.palette-card {
  width: min(560px, 100%);
  padding: 0;
  overflow: hidden;
  box-shadow: var(--shadow-3), inset 0 1px 0 var(--highlight);
  animation: rise 0.24s var(--ease);
}

/* field ------------------------------------------------------------------- */

.palette-field {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 15px 16px;
  border-bottom: 1px solid var(--hairline-soft);
}

.palette-field > :global(.ico) { color: var(--ink-3); }

.palette-field input {
  flex: 1;
  min-width: 0;
  padding: 0;
  border: 0;
  background: none;
  font-size: 15.5px;
  letter-spacing: -0.012em;
}

.palette-field input:hover, .palette-field input:focus {
  background: none;
  box-shadow: none;
  outline: 0;
}

#palette-spinner {
  flex: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 1.8px solid var(--hairline);
  border-top-color: var(--ink-3);
  animation: spin 0.7s linear infinite;
}

/* results ----------------------------------------------------------------- */

#palette-results {
  max-height: min(52vh, 430px);
  padding: 6px;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.palette-section {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 8px 5px;
}

.palette-section + .palette-row { margin-top: 0; }

.palette-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 9px;
  border-radius: var(--r-md);
  cursor: pointer;
}

.palette-row.is-sel { background: var(--sunken-hover); }

.palette-row.is-sel .palette-meta { color: var(--ink-2); }

.palette-dot {
  display: grid;
  place-items: center;
  flex: none;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--c, var(--ink-3)) 16%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--c, var(--ink-3)) 32%, transparent);
  font-family: var(--emoji);
  font-size: 14px;
  line-height: 1;
}

.palette-dot :global(.ico) { width: 15px; height: 15px; color: var(--ink-2); }

.palette-body { display: grid; min-width: 0; flex: 1; }

.palette-name {
  font-size: 13.5px;
  font-weight: 540;
  letter-spacing: -0.008em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.palette-note {
  font-size: 11.5px;
  color: var(--ink-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.palette-meta {
  flex: none;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--ink-3);
}

.palette-empty {
  padding: 14px 10px 16px;
  font-size: 12.5px;
  color: var(--ink-3);
  text-align: center;
}

/* foot -------------------------------------------------------------------- */

.palette-foot {
  display: flex;
  gap: 16px;
  padding: 9px 16px;
  border-top: 1px solid var(--hairline-soft);
  font-size: 11px;
  color: var(--ink-3);
}

.palette-foot span { display: inline-flex; align-items: center; gap: 5px; }

#palette kbd {
  font: inherit;
  font-size: 10.5px;
  min-width: 18px;
  padding: 1px 5px;
  border-radius: 5px;
  text-align: center;
  background: var(--sunken);
  box-shadow: inset 0 0 0 1px var(--hairline);
  color: var(--ink-3);
}

@media (max-width: 600px) {
  #palette { padding: 8vh 12px 12px; }

  #palette-results { max-height: 58vh; }

  .palette-foot { display: none; }
}
</style>
