<script lang="ts">
  import L, { type Marker } from 'leaflet';
  import 'leaflet.markercluster';
  import { formatDistance } from '../lib/format';
  import { publicApi, type PublicMapPayload } from '../lib/publicApi';
  import { profileUrl } from '../lib/routing';
  import Icon from './Icon.svelte';

  let { slug }: { slug: string } = $props();

  let data = $state<PublicMapPayload | null>(null);
  let failed = $state('');
  let container = $state<HTMLDivElement>();

  const categoryOf = (id: string) => data?.categories.find((category) => category.id === id);

  publicApi
    .map(slug)
    .then((payload) => (data = payload))
    .catch((error: Error) => (failed = error.message));

  function pinIcon(categoryId: string): L.DivIcon {
    const category = categoryOf(categoryId);
    return L.divIcon({
      className: '',
      html: `<div class="pin" style="--c:${category?.color ?? '#6b7280'}"><span>${category?.emoji ?? '📍'}</span></div>`,
      iconSize: [36, 36],
      iconAnchor: [18, 36],
      popupAnchor: [0, -34],
    });
  }

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

    const map = L.map(container, { zoomControl: false, attributionControl: false });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    L.control.zoom({ position: 'bottomleft' }).addTo(map);
    L.control.attribution({ position: 'bottomleft', prefix: false }).addTo(map);

    const clusters = L.markerClusterGroup({
      maxClusterRadius: 54,
      disableClusteringAtZoom: 17,
      spiderfyOnMaxZoom: false,
      showCoverageOnHover: false,
    }).addTo(map);

    const markers: Marker[] = [];
    for (const place of data.places) {
      const marker = L.marker([place.lat, place.lng], { icon: pinIcon(place.categoryId) });
      marker.bindPopup(() => popupFor(place), { closeButton: false, offset: [0, 2] });
      markers.push(marker);
      clusters.addLayer(marker);
    }

    if (markers.length) map.fitBounds(L.latLngBounds(data.places.map((p) => [p.lat, p.lng])), { padding: [60, 60] });
    else map.setView([41.9, 12.5], 5);

    return () => map.remove();
  });
</script>

{#if failed}
  <div class="notice surface">
    <h1>Questa mappa non c'è</h1>
    <p>Forse chi l'ha fatta non l'ha ancora pubblicata, o l'indirizzo è cambiato.</p>
    <a class="primary" href="/">Fai la tua</a>
  </div>
{:else if data}
  <div id="map" bind:this={container}></div>

  <div class="card surface">
    <span class="eyebrow">La mappa di {data.handle}</span>
    <h1>{data.map.name}</h1>
    <p class="count">
      {data.places.length}
      {data.places.length === 1 ? 'posto' : 'posti'}
      {#if data.categories.length}· {data.categories.length} categorie{/if}
    </p>
    <a class="other" href={profileUrl(data.handle)}>Le altre mappe di {data.handle} →</a>
  </div>

  <a class="made primary" href="/">
    <Icon name="pin" /> Fai la tua
  </a>
{/if}

<style>
  .card {
    position: absolute;
    top: 14px;
    left: 14px;
    z-index: var(--z-panel);
    width: min(300px, calc(100vw - 28px));
    padding: var(--card-pad);
    display: grid;
    gap: 4px;
    animation: rise 0.5s var(--ease);
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

  .made {
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

  .made :global(.ico) { width: 16px; height: 16px; }

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

  .notice .primary {
    justify-self: center;
    margin-top: 6px;
    text-decoration: none;
  }

  @media (max-width: 600px) {
    .card { left: 12px; right: 12px; top: 12px; width: auto; }
    .made { left: 12px; right: 12px; bottom: calc(12px + env(safe-area-inset-bottom)); justify-content: center; }
  }
</style>
