<script lang="ts">
  import L, { type Marker } from 'leaflet';
  import { clusterGroup, createMap, DEFAULT_COLOR, pinIcon } from '../lib/mapkit';
  import { publicApi, type PublicMapPayload } from '../lib/publicApi';
  import { mapPath, profileUrl } from '../lib/routing';
  import Icon from './Icon.svelte';
  import Button from './Button.svelte';

  let { handle, slug }: { handle?: string; slug: string } = $props();

  let data = $state<PublicMapPayload | null>(null);
  let failed = $state('');
  let container = $state<HTMLDivElement>();
  /** Il posto scelto dalla lista: si vede quale, anche dopo il volo. */
  let picked = $state('');

  let live: { map: L.Map; clusters: L.MarkerClusterGroup; pins: Map<string, Marker> } | null = null;

  const sorted = $derived([...(data?.places ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'it')));

  /** Dalla riga al pin: se sta in un grappolo, prima lo si apre. */
  function reveal(id: string): void {
    picked = id;
    const pin = live?.pins.get(id);
    if (!live || !pin) return;
    live.clusters.zoomToShowLayer(pin, () => {
      live?.map.setView(pin.getLatLng(), Math.max(live.map.getZoom(), 16));
      pin.openPopup();
    });
  }

  const categoryOf = (id: string) => data?.categories.find((category) => category.id === id);

  publicApi
    .map(handle, slug)
    .then((payload) => {
      data = payload;
      // arrivato da un /m/<slug> di prima: l'indirizzo giusto lo prende ora
      if (!handle) history.replaceState(null, '', mapPath(payload.handle, payload.map.slug));
    })
    .catch((error: Error) => (failed = error.message));

  /** Sola lettura: niente modifica, niente eliminazione, solo il posto e le indicazioni. */
  function popupFor(place: PublicMapPayload['places'][number]): HTMLElement {
    const category = categoryOf(place.categoryId);
    const node = document.createElement('div');

    const badge = document.createElement('span');
    badge.className = 'pop-cat';
    badge.style.setProperty('--c', category?.color ?? '#6b7280');
    const emoji = document.createElement('span');
    emoji.className = 'emo';
    emoji.textContent = category?.emoji ?? '📍';
    const label = document.createElement('span');
    label.textContent = category?.name ?? '';
    badge.append(emoji, label);

    const name = document.createElement('h3');
    name.className = 'pop-name';
    name.textContent = place.name;

    const note = document.createElement('p');
    note.className = 'pop-note';
    note.textContent = place.note || '';
    note.hidden = !place.note;

    const actions = document.createElement('div');
    actions.className = 'pop-actions';
    const directions = document.createElement('a');
    directions.target = '_blank';
    directions.rel = 'noreferrer';
    directions.href = `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`;
    directions.textContent = 'Indicazioni';
    actions.append(directions);

    node.append(badge, name, note, actions);
    return node;
  }

  $effect(() => {
    if (!container || !data) return;

    const map = createMap(container);
    const clusters = clusterGroup().addTo(map);

    const markers: Marker[] = [];
    const pins = new Map<string, Marker>();
    for (const place of data.places) {
      const category = categoryOf(place.categoryId);
      const marker = L.marker([place.lat, place.lng], {
        icon: pinIcon({ color: category?.color, emoji: category?.emoji }),
        colour: category?.color ?? DEFAULT_COLOR,
      } as L.MarkerOptions);
      marker.bindPopup(() => popupFor(place), { closeButton: false, offset: [0, 2] });
      marker.on('popupopen', () => (picked = place.id));
      markers.push(marker);
      pins.set(place.id, marker);
      clusters.addLayer(marker);
    }
    map.on('popupclose', () => (picked = ''));
    live = { map, clusters, pins };

    if (markers.length) map.fitBounds(L.latLngBounds(data.places.map((p) => [p.lat, p.lng])), { padding: [60, 60] });
    else map.setView([41.9, 12.5], 5);

    return () => {
      live = null;
      map.remove();
    };
  });
</script>

{#if failed}
  <div class="notice surface">
    <h1>Questa mappa non c'è</h1>
    <p>Forse chi l'ha fatta non l'ha ancora pubblicata, o l'indirizzo è cambiato.</p>
    <Button look="primary" href="/" extra="start">Fai la tua</Button>
  </div>
{:else if data}
  <div id="map" bind:this={container}></div>

  <div class="side">
    <div class="card surface">
      <span class="eyebrow">La mappa di {data.handle}</span>
      <h1>{data.map.name}</h1>
      <p class="count">
        {data.places.length}
        {data.places.length === 1 ? 'posto' : 'posti'}
        {#if data.categories.length}
          · {data.categories.length}
          {data.categories.length === 1 ? 'categoria' : 'categorie'}
        {/if}
      </p>
      <a class="other" href={profileUrl(data.handle)}>Le altre mappe di {data.handle} →</a>
    </div>

    {#if sorted.length}
      <ul class="list surface">
        {#each sorted as place (place.id)}
          <li>
            <button
              type="button"
              class="row"
              class:is-on={picked === place.id}
              onclick={() => reveal(place.id)}
            >
              <span class="dot" style:--c={categoryOf(place.categoryId)?.color ?? '#6b7280'}>
                {categoryOf(place.categoryId)?.emoji ?? '📍'}
              </span>
              <span class="row-text">
                <span class="row-name">{place.name}</span>
                {#if place.note}<span class="row-note">{place.note}</span>{/if}
              </span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>

  <Button look="primary" href="/" extra="made">
    <Icon name="pin" /> Fai la tua
  </Button>
{/if}

<style>
  /* la colonna di sinistra: chi l'ha fatta, e cosa c'è dentro */
  .side {
    position: absolute;
    top: 14px;
    left: 14px;
    z-index: var(--z-panel);
    width: min(300px, calc(100vw - 28px));
    max-height: calc(100% - 28px);
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 10px;
    animation: rise 0.5s var(--ease);
  }

  .card {
    padding: var(--card-pad);
    display: grid;
    gap: 4px;
  }

  .list {
    list-style: none;
    margin: 0;
    padding: 6px;
    display: grid;
    gap: 2px;
    align-content: start;
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
    transition: background 0.14s;
  }

  .row:hover { background: var(--sunken); }
  .row.is-on { background: var(--sunken-hover); }

  /* lo stesso colore del pin sulla mappa: la riga e il puntino sono la stessa cosa */
  .dot {
    display: grid;
    place-items: center;
    flex: none;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--c) 22%, transparent);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--c) 45%, transparent);
    font-size: 13px;
    line-height: 1;
  }

  .row-text { display: grid; gap: 1px; min-width: 0; }

  .row-name {
    font-size: 13px;
    font-weight: 540;
    letter-spacing: -0.012em;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .row-note {
    font-size: 11.5px;
    color: var(--ink-3);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  h1 {
    margin: 0;
    font-size: 19px;
    font-weight: 640;
    letter-spacing: -0.024em;
  }

  .count {
    margin: 0;
    font-size: 12.5px;
    color: var(--ink-3);
    font-variant-numeric: tabular-nums;
  }

  .other {
    margin-top: 6px;
    font-size: 12.5px;
    color: var(--ink-2);
    text-decoration: none;
  }

  .other:hover { color: var(--ink); text-decoration: underline; }

  :global(.made) {
    position: absolute;
    right: 18px;
    bottom: calc(22px + env(safe-area-inset-bottom));
    z-index: var(--z-panel);
    display: inline-flex;
    align-items: center;
    gap: 8px;
    height: 44px;
    padding: 0 20px;
    border-radius: 99px;
    font-size: 14px;
    text-decoration: none;
    box-shadow: var(--shadow-3), inset 0 1px 0 rgb(255 255 255 / 0.16);
  }

  :global(.made .ico) { width: 16px; height: 16px; }

  .notice {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(360px, calc(100vw - 32px));
    padding: 22px;
    display: grid;
    gap: 8px;
    text-align: center;
  }

  .notice p {
    margin: 0;
    font-size: 13px;
    color: var(--ink-3);
    line-height: 1.5;
  }

  .notice :global(.start) {
    justify-self: center;
    margin-top: 6px;
  }

  @media (max-width: 600px) {
    /* sotto resta il posto per il tasto: la lista si ferma prima */
    .side { left: 12px; right: 12px; top: 12px; width: auto; max-height: calc(100% - 92px); }
    :global(.made) { left: 12px; right: 12px; bottom: calc(12px + env(safe-area-inset-bottom)); justify-content: center; }
  }
</style>
