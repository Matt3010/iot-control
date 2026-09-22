<script lang="ts">
  import L, { type Marker } from 'leaflet';
  import { mount, unmount } from 'svelte';
  import { devices } from '../lib/devices.svelte';
  import { here } from '../lib/here.svelte';
  import { mapBridge } from '../lib/mapBridge.svelte';
  import { clusterGroup, createMap, DEFAULT_COLOR, glyph, meIcon, pinIcon } from '../lib/mapkit';
  import { readJSON, writeJSON } from '../lib/storage';
  import { store } from '../lib/store.svelte';
  import type { Category, LocalPlace } from '../lib/types';
  import { ui } from '../lib/ui.svelte';
  import AgentStack from './AgentStack.svelte';

  let container: HTMLDivElement;
  let map: L.Map;
  let clusters: L.MarkerClusterGroup;
  const markers = new Map<string, Marker>();
  let draftMarker: Marker | null = null;
  /**
   * I controlli dentro un popup sono un componente vero, montato a mano:
   * Leaflet possiede quel DOM, ma da lì in giù torna a comandare Svelte — e
   * così il cursore della luce è lo stesso della scheda, non una copia.
   */
  let popupControls: Record<string, unknown> | null = null;

  function closeControls(): void {
    if (!popupControls) return;
    void unmount(popupControls);
    popupControls = null;
  }

  /** Il pin di un posto: colore ed emoji della sua categoria. */
  const lookOf = (
    category: Category | undefined,
    extra = '',
    locked = false,
    count = 0,
    health: string | null = null,
  ) => ({
    color: category?.color,
    emoji: category?.emoji,
    extra,
    locked,
    count,
    ...(health ? { health } : {}),
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

    // quello che si accende sta sopra ai comandi: è la cosa per cui hai aperto
    const agentIds = place.agentIds ?? [];
    const live = document.createElement('div');
    if (agentIds.length) {
      live.className = 'pop-live';
      closeControls();
      popupControls = mount(AgentStack, { target: live, props: { agentIds } });
    }

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
    node.append(badge, name, note);
    if (agentIds.length) node.append(live);
    node.append(actions);
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
      closeControls();
    });

    return () => {
      mapBridge.detach(map);
      closeControls();
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
      // un agente sotto cui è rimasto acceso qualcosa si vede da lontano
      const lit = devices.anyOn(place.agentIds) ? 'lit' : '';
      // quanti agenti stanno a questo indirizzo: il numero nell'altro angolo.
      // Sono loro e non i dispositivi, perché un agente appena creato non ne
      // ha ancora nessuno, e un bollino che compare due giorni dopo non serve.
      const count = place.agentIds?.length ?? 0;
      const health = devices.health(place.agentIds);

      if (!marker) {
        marker = L.marker([place.lat, place.lng], {
          icon: pinIcon(lookOf(category, lit, place.private, count, health)),
          riseOnHover: true,
          colour,
        } as L.MarkerOptions);
        markers.set(place.key, marker);
      } else {
        marker.setLatLng([place.lat, place.lng]);
        marker.setIcon(pinIcon(lookOf(category, lit, place.private, count, health)));
        // il grappolo legge il colore da qui: se cambia categoria deve saperlo
        (marker.options as { colour?: string }).colour = colour;
      }
      // con degli agenti dentro il popup si allarga: quella card ha
      // interruttori e cursori, e a 232px vivrebbe stretta
      // Il popup si lega una volta sola. Rilegarlo a ogni giro — e questo
      // effetto gira a ogni interruttore premuto in casa — butta via quello
      // aperto e lo rifà da capo: i comandi dentro tornavano in cima, e chi
      // stava scorrendo si perdeva.
      const wide = (place.agentIds ?? []).length > 0;
      const bound = (marker.options as { wide?: boolean }).wide;

      if (!marker.getPopup() || bound !== wide) {
        (marker.options as { wide?: boolean }).wide = wide;
        marker.bindPopup(() => popupFor(place), {
          closeButton: false,
          offset: [0, 2],
          key: place.key,
          className: wide ? 'with-agents' : '',
        } as L.PopupOptions);
      }

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
    // Il pin della bozza prende il posto di quello vero mentre la scheda è
    // aperta: deve dire le stesse cose, se no aprendo un luogo i suoi agenti
    // sembrano spariti.
    const look = lookOf(
      category,
      [draft.id ? '' : 'draft', devices.anyOn(draft.agentIds) ? 'lit' : ''].filter(Boolean).join(' '),
      draft.private ?? false,
      draft.agentIds?.length ?? 0,
      devices.health(draft.agentIds),
    );

    if (!draftMarker) {
      draftMarker = L.marker([draft.lat, draft.lng], {
        icon: pinIcon(look),
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
      draftMarker.setIcon(pinIcon(look));
    }
  });
</script>

<div id="map" bind:this={container}></div>

<!--
  In "in vista" le distanze partono dal centro del riquadro: tanto vale che
  quel centro si veda. In "vicino a me" l'origine e' il puntino blu, e qui non
  serve piu' niente.
-->
{#if (store.listMode !== 'near' || !here.spot) && store.currentPlaces.length}
  <span id="centre-mark" aria-hidden="true"></span>
{/if}
