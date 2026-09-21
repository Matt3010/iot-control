<script lang="ts">
  import L, { type Marker } from 'leaflet';
  import { here } from '../lib/here.svelte';
  import { mapBridge } from '../lib/mapBridge.svelte';
  import { clusterGroup, createMap, DEFAULT_COLOR, glyph, meIcon, pinIcon } from '../lib/mapkit';
  import { readJSON, writeJSON } from '../lib/storage';
  import { store } from '../lib/store.svelte';
  import type { Category, LocalPlace } from '../lib/types';
  import { ui } from '../lib/ui.svelte';

  let container: HTMLDivElement;
  let map: L.Map;
  let clusters: L.MarkerClusterGroup;
  const markers = new Map<string, Marker>();
  let draftMarker: Marker | null = null;

  /** Il pin di un posto: colore ed emoji della sua categoria. */
  const lookOf = (category: Category | undefined, extra = '', locked = false) => ({
    color: category?.color,
    emoji: category?.emoji,
    extra,
    locked,
  });

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

    if (place.private) {
      const closed = document.createElement('span');
      closed.className = 'pop-lock';
      closed.title = 'Resta fuori dalla mappa pubblica';
      closed.append(glyph('lock'), document.createTextNode('Privato'));
      badge.after(closed);
    }

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
    edit.append(glyph('edit'), document.createTextNode('Modifica'));
    edit.addEventListener('click', () => {
      map.closePopup();
      ui.openPlace({ ...place });
    });

    const directions = document.createElement('a');
    directions.target = '_blank';
    directions.rel = 'noreferrer';
    directions.href = `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`;
    directions.append(glyph('directions'), document.createTextNode('Indicazioni'));

    actions.append(edit, directions);
    node.append(badge, name, note, actions);
    return node;
  }

  $effect(() => {
    const saved = readJSON('pi.view', { lat: 41.9, lng: 12.5, zoom: 6 });
    map = createMap(container, {}, () =>
      here.locate((spot) => map.setView([spot.lat, spot.lng], Math.max(map.getZoom(), 14))),
    ).setView([saved.lat, saved.lng], saved.zoom);
    clusters = clusterGroup().addTo(map);

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
      mapBridge.detach(map);
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

      const colour = category?.color ?? DEFAULT_COLOR;

      if (!marker) {
        marker = L.marker([place.lat, place.lng], {
          icon: pinIcon(lookOf(category, '', place.private)),
          riseOnHover: true,
          colour,
        } as L.MarkerOptions);
        markers.set(place.key, marker);
      } else {
        marker.setLatLng([place.lat, place.lng]);
        marker.setIcon(pinIcon(lookOf(category, '', place.private)));
        // il grappolo legge il colore da qui: se cambia categoria deve saperlo
        (marker.options as { colour?: string }).colour = colour;
      }
      marker.bindPopup(() => popupFor(place), { closeButton: false, offset: [0, 2], key: place.key } as L.PopupOptions);

      // The pin being edited steps aside for the draggable draft standing in for it.
      const onMap = store.visible(place) && ui.draft?.key !== place.key;
      if (onMap && !clusters.hasLayer(marker)) clusters.addLayer(marker);
      if (!onMap && clusters.hasLayer(marker)) clusters.removeLayer(marker);
    }
  });

  /** Il puntino di dove sei, con l'alone dell'incertezza intorno. */
  $effect(() => {
    const spot = here.spot;
    if (!map || !spot) return;

    const me = L.marker([spot.lat, spot.lng], {
      icon: meIcon(),
      interactive: false,
      zIndexOffset: -500,
    }).addTo(map);
    const halo = L.circle([spot.lat, spot.lng], {
      radius: spot.accuracy,
      className: 'me-halo',
      interactive: false,
    }).addTo(map);

    return () => {
      me.remove();
      halo.remove();
    };
  });

  /** Mentre cerca, il tasto lo dice: la classe sta sul body come le altre. */
  $effect(() => {
    document.body.classList.toggle('finding-me', here.asking);
    document.body.classList.toggle('found-me', !!here.spot);
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
        icon: pinIcon(lookOf(category, draft.id ? '' : 'draft', draft.private ?? false)),
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
      draftMarker.setIcon(pinIcon(lookOf(category, draft.id ? '' : 'draft', draft.private ?? false)));
    }
  });
</script>

<div id="map" bind:this={container}></div>

<!--
  Finche' non sai dove sei, le distanze partono dal centro di quello che
  guardi: tanto vale che quel centro si veda. Sparisce appena arriva il
  puntino blu, che da quel momento e' lui l'origine.
-->
{#if !here.spot && store.currentPlaces.length}
  <span id="centre-mark" aria-hidden="true"></span>
{/if}
