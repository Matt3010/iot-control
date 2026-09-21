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
      ui.openPlace({ lat: event.latlng.lat, lng: event.latlng.lng, groupId: store.activeGroup ?? '' });
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
    const living = new Set(store.places.map((place) => place.key));

    for (const [key, marker] of markers) {
      if (!living.has(key)) {
        clusters.removeLayer(marker);
        markers.delete(key);
      }
    }

    for (const place of store.places) {
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
