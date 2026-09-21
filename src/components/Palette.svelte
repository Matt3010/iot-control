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
      else if (normalise(store.groupOf(place.groupId)?.name ?? '').includes(needle)) rank = 3;
      else if (normalise(place.note ?? '').includes(needle)) rank = 4;
      if (rank === Number.POSITIVE_INFINITY) continue;
      scored.push({ place, rank, distance: mapBridge.distanceFromCentre(place.lat, place.lng) });
    }

    return scored.sort((a, b) => a.rank - b.rank || a.distance - b.distance).slice(0, 8);
  });

  const placeRows = $derived<Row[]>(
    matches.map(({ place, distance }) => {
      const category = store.categoryOf(place.categoryId);
      const group = store.groupOf(place.groupId);
      return {
        color: category?.color,
        emoji: category?.emoji ?? '📍',
        name: place.name,
        note: [group?.name, place.note || category?.name].filter(Boolean).join(' · '),
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
        meta: 'nuovo',
        pick: () => {
          ui.paletteOpen = false;
          const lat = Number(hit.lat);
          const lng = Number(hit.lon);
          mapBridge.goTo(lat, lng, 16);
          ui.openPlace({ lat, lng, name: label, note: hit.display_name, groupId: store.activeGroup ?? '' });
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
