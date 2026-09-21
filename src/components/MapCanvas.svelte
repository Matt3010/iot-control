<script lang="ts">
  import L, { type Marker } from 'leaflet';
  import 'leaflet.markercluster';
  import { createElement } from 'lucide';
  import { ICONS } from '../lib/icons';
  import { CLUSTER_OFF_AT, mapBridge } from '../lib/mapBridge.svelte';
  import { readJSON, writeJSON } from '../lib/storage';
  import { store } from '../lib/store.svelte';
  import type { Category, LocalPlace } from '../lib/types';
  import { ui } from '../lib/ui.svelte';

  let container: HTMLDivElement;
  let map: L.Map;
  let clusters: L.MarkerClusterGroup;
  const markers = new Map<string, Marker>();
  let draftMarker: Marker | null = null;

  const DEFAULT_COLOR = '#6b7280';

  function pinIcon(category: Category | undefined, extra = ''): L.DivIcon {
    return L.divIcon({
      className: '',
      html: `<div class="pin ${extra}" style="--c:${category?.color ?? DEFAULT_COLOR}"><span>${category?.emoji ?? '📍'}</span></div>`,
      iconSize: [36, 36],
      iconAnchor: [18, 36],
      popupAnchor: [0, -34],
    });
  }

  /** A cluster wears the colours of what it hides: one arc per category. */
  function clusterIcon(cluster: L.MarkerCluster): L.DivIcon {
    const children = cluster.getAllChildMarkers();
    const tally = new Map<string, number>();
    for (const marker of children) {
      const place = (marker.options as { place?: LocalPlace }).place;
      const color = place ? store.colorOf(place) : DEFAULT_COLOR;
      tally.set(color, (tally.get(color) ?? 0) + 1);
    }

    let at = 0;
    const stops: string[] = [];
    for (const [color, count] of tally) {
      const end = at + (count / children.length) * 100;
      stops.push(`${color} ${at}% ${end}%`);
      at = end;
    }

    return L.divIcon({
      className: '',
      html: `<div class="cluster" style="background:conic-gradient(${stops.join(',')})"><span>${children.length}</span></div>`,
      iconSize: [44, 44],
    });
  }

  function icon(name: keyof typeof ICONS): SVGElement {
    const svg = createElement(ICONS[name]);
    svg.setAttribute('class', 'ico');
    return svg;
  }

  /** The popup stays imperative: Leaflet owns its lifecycle, not Svelte. */
  function popupFor(place: LocalPlace): HTMLElement {
    const category = store.categoryOf(place.categoryId);
    const node = document.createElement('div');

    const badge = document.createElement('span');
    badge.className = 'pop-cat';
    badge.style.setProperty('--c', category?.color ?? DEFAULT_COLOR);
    const emoji = document.createElement('span');
    emoji.className = 'emo';
    emoji.textContent = category?.emoji ?? '📍';
    const label = document.createElement('span');
    label.textContent = category?.name ?? 'Senza categoria';
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

    const edit = document.createElement('button');
    edit.type = 'button';
    edit.append(icon('edit'), document.createTextNode('Modifica'));
    edit.addEventListener('click', () => {
      map.closePopup();
      ui.openPlace({ ...place });
    });

    const directions = document.createElement('a');
    directions.target = '_blank';
    directions.rel = 'noreferrer';
    directions.href = `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`;
    directions.append(icon('directions'), document.createTextNode('Indicazioni'));

    actions.append(edit, directions);
    node.append(badge, name, note, actions);
    return node;
  }

  $effect(() => {
    const saved = readJSON('pi.view', { lat: 41.9, lng: 12.5, zoom: 6 });
    map = L.map(container, { zoomControl: false, attributionControl: false }).setView(
      [saved.lat, saved.lng],
      saved.zoom,
    );

    // Plain OSM tiles (no key, no third party): the muted look and the dark
    // variant are CSS filters on the tile pane, see .leaflet-tile-pane.
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    // Both controls live bottom-left so the add button owns the bottom-right corner.
    L.control.zoom({ position: 'bottomleft' }).addTo(map);
    L.control.attribution({ position: 'bottomleft', prefix: false }).addTo(map);

    clusters = L.markerClusterGroup({
      maxClusterRadius: 54,
      disableClusteringAtZoom: CLUSTER_OFF_AT,
      spiderfyOnMaxZoom: false,
      showCoverageOnHover: false,
      iconCreateFunction: clusterIcon,
    }).addTo(map);

    mapBridge.attach(map, markers);

    // The counter lives outside the reactive value on purpose: reading
    // mapBridge.view here would make this effect depend on what it writes.
    let moves = 0;
    const publishView = () => {
      const centre = map.getCenter();
      writeJSON('pi.view', { lat: centre.lat, lng: centre.lng, zoom: map.getZoom() });
      mapBridge.view = { lat: centre.lat, lng: centre.lng, zoom: map.getZoom(), moves: (moves += 1) };
    };
    publishView();

    map.on('moveend', publishView);
    map.on('click', (event: L.LeafletMouseEvent) => {
      if (!ui.picking) return;
      ui.openPlace({
        lat: event.latlng.lat,
        lng: event.latlng.lng,
        groupIds: store.activeGroup ? [store.activeGroup] : [],
      });
    });
    map.on('popupopen', (event: L.PopupEvent) => {
      mapBridge.activeKey = (event.popup.options as { key?: string }).key ?? null;
    });
    map.on('popupclose', () => {
      mapBridge.activeKey = null;
    });

    return () => {
      map.remove();
      markers.clear();
    };
  });

  /** Markers follow the places, the filters, and whatever is being edited. */
  $effect(() => {
    if (!clusters) return;
    const living = new Set(store.currentPlaces.map((place) => place.key));

    for (const [key, marker] of markers) {
      if (!living.has(key)) {
        clusters.removeLayer(marker);
        markers.delete(key);
      }
    }

    for (const place of store.currentPlaces) {
      const category = store.categoryOf(place.categoryId);
      let marker = markers.get(place.key);

      if (!marker) {
        marker = L.marker([place.lat, place.lng], {
          icon: pinIcon(category),
          riseOnHover: true,
          place,
        } as L.MarkerOptions);
        markers.set(place.key, marker);
      } else {
        marker.setLatLng([place.lat, place.lng]);
        marker.setIcon(pinIcon(category));
      }
      marker.bindPopup(() => popupFor(place), { closeButton: false, offset: [0, 2], key: place.key } as L.PopupOptions);

      // The pin being edited steps aside for the draggable draft standing in for it.
      const onMap = store.visible(place) && ui.draft?.key !== place.key;
      if (onMap && !clusters.hasLayer(marker)) clusters.addLayer(marker);
      if (!onMap && clusters.hasLayer(marker)) clusters.removeLayer(marker);
    }
  });

  /** The draft pin: draggable, and tinted like the category chosen in the form. */
  $effect(() => {
    if (!map) return;
    const draft = ui.draft;

    if (!draft) {
      draftMarker?.remove();
      draftMarker = null;
      return;
    }

    const category = store.categoryOf(draft.categoryId ?? '');
    if (!draftMarker) {
      draftMarker = L.marker([draft.lat, draft.lng], {
        icon: pinIcon(category, draft.id ? '' : 'draft'),
        draggable: true,
        zIndexOffset: 1000,
      }).addTo(map);
      draftMarker.on('dragend', () => {
        const { lat, lng } = draftMarker!.getLatLng();
        if (ui.draft) {
          ui.draft.lat = lat;
          ui.draft.lng = lng;
        }
      });
    } else {
      draftMarker.setLatLng([draft.lat, draft.lng]);
      draftMarker.setIcon(pinIcon(category, draft.id ? '' : 'draft'));
    }
  });
</script>

<div id="map" bind:this={container}></div>

<style>
:global(.picking #map) { cursor: crosshair; }

:global(.pin) {
  position: relative;
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 50% 50% 50% 6px;
  transform: rotate(-45deg);
  background: var(--c, #6b7280);
  background-image: linear-gradient(135deg, rgb(255 255 255 / 0.32), rgb(255 255 255 / 0) 55%);
  border: 2px solid rgb(255 255 255 / 0.92);
  box-shadow: 0 5px 14px -4px rgb(10 13 18 / 0.55), inset 0 -2px 6px rgb(0 0 0 / 0.14);
  transition: transform 0.2s var(--ease), box-shadow 0.2s;
  will-change: transform;
}

:global(.pin span) {
  font-family: var(--emoji);
  transform: rotate(45deg);
  font-size: 18px;
  line-height: 1;
  text-shadow: 0 1px 2px rgb(0 0 0 / 0.2);
}

:global(.leaflet-marker-icon:hover .pin), :global(.pin.is-hover) {
  transform: rotate(-45deg) scale(1.12);
  box-shadow: 0 10px 22px -5px rgb(10 13 18 / 0.6), inset 0 -2px 6px rgb(0 0 0 / 0.14);
}

:global(.pin.is-hover) { box-shadow: 0 10px 22px -5px rgb(10 13 18 / 0.6), 0 0 0 5px color-mix(in srgb, var(--c) 24%, transparent); }

:global(.pin.draft) {
  animation: pin-drop 0.42s var(--ease);
  box-shadow: 0 10px 22px -6px rgb(10 13 18 / 0.6), 0 0 0 6px color-mix(in srgb, var(--c, #6b7280) 22%, transparent);
}

@media (prefers-color-scheme: dark) {
  :global(.pin) { border-color: rgb(255 255 255 / 0.8); }
}

:global(.cluster) {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  box-shadow: 0 6px 16px -5px rgb(10 13 18 / 0.5);
  transition: transform 0.18s var(--ease);
}

:global(.cluster span) {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: var(--glass-strong);
  -webkit-backdrop-filter: blur(10px);
  backdrop-filter: blur(10px);
  color: var(--ink);
  font-size: 13px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
}

:global(.leaflet-marker-icon:hover .cluster) { transform: scale(1.07); }

:global(.leaflet-container) {
  font-family: var(--font);
  background: #e8ebef;
}

:global(.leaflet-tile-pane) { filter: saturate(0.4) brightness(1.05) contrast(0.94); }

@media (prefers-color-scheme: dark) {
  :global(.leaflet-container) { background: #0b0d10; }

  :global(.leaflet-tile-pane) {
      filter: invert(1) hue-rotate(180deg) saturate(0.4) brightness(0.92) contrast(0.9);
    }
}

:global(.leaflet-bottom.leaflet-left) { margin-bottom: env(safe-area-inset-bottom); }

:global(.leaflet-control-zoom) {
  border: 1px solid var(--hairline) !important;
  border-radius: var(--r-md) !important;
  overflow: hidden;
  background: var(--glass);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  backdrop-filter: blur(20px) saturate(180%);
  box-shadow: var(--shadow-1), inset 0 1px 0 var(--highlight) !important;
}

:global(.leaflet-control-zoom a) {
  width: 32px;
  height: 32px;
  line-height: 30px;
  background: none;
  color: var(--ink-2);
  font-size: 17px;
  font-weight: 400;
  border-bottom: 1px solid var(--hairline-soft);
  transition: background 0.14s, color 0.14s;
}

:global(.leaflet-control-zoom a:last-child) { border-bottom: 0; }

:global(.leaflet-control-zoom a:hover) { background: var(--sunken-hover); color: var(--ink); }

:global(.leaflet-control-attribution) {
  /* Leaflet glues it to the corner; as a floating pill it needs its own room */
  margin: 0 10px 8px !important;
  padding: 2px 8px !important;
  border-radius: 99px;
  background: var(--glass) !important;
  -webkit-backdrop-filter: blur(12px);
  backdrop-filter: blur(12px);
  color: var(--ink-3) !important;
  font-size: 10px !important;
  box-shadow: var(--shadow-1);
}

:global(.leaflet-control-attribution a) { color: var(--ink-2) !important; }

:global(.leaflet-popup-content-wrapper) {
  padding: 0;
  border-radius: var(--r-lg) !important;
  background: var(--glass-strong);
  -webkit-backdrop-filter: blur(28px) saturate(180%);
  backdrop-filter: blur(28px) saturate(180%);
  border: 1px solid var(--hairline);
  color: var(--ink);
  box-shadow: var(--shadow-3), inset 0 1px 0 var(--highlight) !important;
}

:global(.leaflet-popup-content) { margin: 0; padding: 14px 16px 12px; width: 232px !important; }

:global(.leaflet-popup-tip) {
  background: var(--glass-strong);
  border: 1px solid var(--hairline);
  box-shadow: none;
}

:global(.leaflet-popup-close-button) { display: none; }

:global(.pop-cat .emo) { font-family: var(--emoji); }

:global(.pop-cat) {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 7px;
  padding: 2px 9px 2px 7px;
  border-radius: 99px;
  background: color-mix(in srgb, var(--c, var(--ink-3)) 14%, transparent);
  border: 1px solid color-mix(in srgb, var(--c, var(--ink-3)) 34%, transparent);
  font-size: 11px;
  font-weight: 500;
}

:global(.pop-name) { margin: 0; font-size: 15.5px; font-weight: 620; letter-spacing: -0.018em; }

:global(.pop-note) {
  margin: 6px 0 0;
  font-size: 12.5px;
  line-height: 1.45;
  color: var(--ink-2);
  white-space: pre-wrap;
}

:global(.pop-actions) {
  display: flex;
  gap: 4px;
  margin: 12px -6px -4px;
  padding-top: 10px;
  border-top: 1px solid var(--hairline-soft);
}

:global(.pop-actions button), :global(.pop-actions a) {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border: 0;
  border-radius: var(--r-sm);
  background: none;
  color: var(--ink-2);
  font: inherit;
  font-size: 12.5px;
  text-decoration: none;
  transition: background 0.14s, color 0.14s;
}

:global(.pop-actions button:hover), :global(.pop-actions a:hover) { background: var(--sunken); color: var(--ink); }

:global(.pop-actions .ico) { width: 15px; height: 15px; }

@media (max-width: 600px) {
  :global(.leaflet-bottom.leaflet-left) { margin-bottom: calc(62px + env(safe-area-inset-bottom)); }

  :global(.sheet-open .leaflet-control-zoom) { display: none; }

  :global(.sheet-open .leaflet-bottom.leaflet-left) {
      margin-bottom: calc(var(--sheet-h, 0px) + 20px + env(safe-area-inset-bottom));
    }
}
</style>
