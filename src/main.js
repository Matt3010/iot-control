import '@fontsource-variable/inter/wght.css';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'emoji-picker-element';
// Emoji data is bundled and served locally: no CDN call at runtime.
import emojiDataUrl from 'emoji-picker-element-data/en/emojibase/data.json?url';
import L from 'leaflet';
import 'leaflet.markercluster';
import {
  ArrowRight,
  MapPin,
  Navigation,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  Undo2,
  X,
  createElement,
} from 'lucide';
import './styles/index.css';

const $ = (sel) => document.querySelector(sel);

const el = {
  map: $('#map'),
  searchTrigger: $('#search-trigger'),
  searchKey: $('#search-key'),
  palette: $('#palette'),
  paletteInput: $('#palette-input'),
  paletteSpinner: $('#palette-spinner'),
  paletteResults: $('#palette-results'),
  filters: $('#filters'),
  groupHead: $('#group-head'),
  groupFilters: $('#group-filters'),
  groupField: $('#group-field'),
  groupChoice: $('#group-choice'),
  groupList: $('#group-list'),
  groupForm: $('#group-form'),
  placeCount: $('#place-count'),
  listHead: $('#list-head'),
  listCount: $('#list-count'),
  list: $('#place-list'),
  manageBtn: $('#manage-btn'),
  addBtn: $('#add-btn'),
  addLabel: $('#add-btn .add-label'),
  hint: $('#hint'),
  placeSheet: $('#place-sheet'),
  placeTitle: $('#place-title'),
  placeForm: $('#place-form'),
  categoryChoice: $('#category-choice'),
  coords: $('#coords'),
  deleteBtn: $('#place-form [data-delete]'),
  manageSheet: $('#manage-sheet'),
  tabs: document.querySelectorAll('#manage-sheet .tab'),
  categoryList: $('#category-list'),
  categoryForm: $('#category-form'),
  newEmoji: $('#new-emoji'),
  newColor: $('#new-color'),
  colorPopover: $('#color-popover'),
  swatches: $('#swatches'),
  emojiPopover: $('#emoji-popover'),
  emojiPicker: $('#emoji-popover emoji-picker'),
  toast: $('#toast'),
};

const state = { categories: [], groups: [], places: [] };
/** Category ids hidden from the map; kept per-browser, not on the server. */
const hidden = new Set(readJSON('pi.hidden', []));
/** The group in scope, or null for all of them. Also per-browser. */
let activeGroup = readJSON('pi.group', null);
/** Draft place being created or edited: { id?, lat, lng }. */
let draft = null;
let draftMarker = null;
let picking = false;
/** place object -> marker. Keyed by object so a temporary id can be swapped in place. */
const markers = new Map();
let activePlace = null;

/* ------------------------------------------------------------------ icons */

const ICONS = {
  pin: MapPin,
  search: Search,
  submit: ArrowRight,
  filters: SlidersHorizontal,
  plus: Plus,
  close: X,
  trash: Trash2,
  edit: Pencil,
  directions: Navigation,
  undo: Undo2,
};

function icon(name) {
  const svg = createElement(ICONS[name]);
  svg.setAttribute('class', 'ico');
  svg.setAttribute('aria-hidden', 'true');
  return svg;
}

/** Swap every <i data-icon="…"> placeholder for its drawn icon. */
function drawIcons(root = document) {
  for (const node of root.querySelectorAll('[data-icon]')) node.replaceWith(icon(node.dataset.icon));
}

drawIcons();

/* ------------------------------------------------------------------ colour */

/** Sixteen colours that stay apart from each other on a map, light or dark. */
const COLORS = [
  '#e4572e', '#f3a712', '#d7263d', '#f26d85',
  '#b5179e', '#6a4c93', '#3a86ff', '#2274a5',
  '#00a6a6', '#2a9d8f', '#43aa8b', '#7cb518',
  '#8d6a4f', '#e07a5f', '#5c6672', '#264653',
];

const paintSwatch = (node, color) => node.style.setProperty('--c', color);

/* ---------------------------------------------------------------- storage */

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode: preferences just don't persist */
  }
}

/* -------------------------------------------------------------------- api */

async function api(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: options.body ? { 'content-type': 'application/json' } : undefined,
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.error || `errore ${res.status}`);
  }
  return res.status === 204 ? null : res.json();
}

/* ------------------------------------------------------------------ toast */

let toastTimer;

function toast(message, action) {
  el.toast.textContent = '';
  const text = document.createElement('span');
  text.textContent = message;
  el.toast.append(text);

  if (action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'toast-action';
    button.append(icon('undo'), action.label);
    button.addEventListener('click', () => {
      hideToast();
      action.onClick();
    });
    el.toast.append(button);
  }

  el.toast.hidden = false;
  // restart the entrance animation on a repeated toast
  el.toast.style.animation = 'none';
  void el.toast.offsetWidth;
  el.toast.style.animation = '';
  clearTimeout(toastTimer);
  // The button leaves the screen before the delete goes out, so a late click
  // cannot "undo" something the server has already been told to forget.
  toastTimer = setTimeout(hideToast, action ? UNDO_MS - 400 : 2600);
}

function hideToast() {
  clearTimeout(toastTimer);
  el.toast.hidden = true;
}

/* ------------------------------------------------- deletes, with a way back */

const UNDO_MS = 6000;
/** Deletes shown as done but not yet sent, so "Annulla" costs nothing. */
const pending = new Set();

function deferCommit(commit) {
  const entry = { commit };
  pending.add(entry);
  const timer = setTimeout(() => {
    pending.delete(entry);
    commit();
  }, UNDO_MS);
  return () => {
    clearTimeout(timer);
    pending.delete(entry);
  };
}

// Leaving the page confirms whatever is still waiting: the UI already said it was gone.
addEventListener('pagehide', () => {
  for (const entry of pending) entry.commit({ keepalive: true });
  pending.clear();
});

/* -------------------------------------------------------------------- map */

const saved = readJSON('pi.view', { lat: 41.9, lng: 12.5, zoom: 6 });
const map = L.map(el.map, { zoomControl: false, attributionControl: false }).setView(
  [saved.lat, saved.lng],
  saved.zoom,
);

// Plain OSM tiles (no key, no third party): the muted look and the dark
// variant are CSS filters on the tile pane, see .leaflet-tile-pane.
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(map);

const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
const syncPickerTheme = () => {
  el.emojiPicker.className = darkQuery.matches ? 'dark' : 'light';
};
syncPickerTheme();
darkQuery.addEventListener('change', syncPickerTheme);

// Both controls live bottom-left so the add button owns the bottom-right corner.
L.control.zoom({ position: 'bottomleft' }).addTo(map);
L.control.attribution({ position: 'bottomleft', prefix: false }).addTo(map);

const CLUSTER_OFF_AT = 17;

const clusters = L.markerClusterGroup({
  maxClusterRadius: 54,
  disableClusteringAtZoom: CLUSTER_OFF_AT,
  spiderfyOnMaxZoom: false,
  showCoverageOnHover: false,
  iconCreateFunction: clusterIcon,
}).addTo(map);

map.on('moveend', () => {
  const c = map.getCenter();
  writeJSON('pi.view', { lat: c.lat, lng: c.lng, zoom: map.getZoom() });
  renderList();
});

map.on('click', (event) => {
  if (!picking) return;
  setPicking(false);
  openPlaceSheet({ lat: event.latlng.lat, lng: event.latlng.lng });
});

map.on('popupopen', (event) => {
  activePlace = event.popup._source?.options.place ?? null;
  renderList();
});

map.on('popupclose', () => {
  activePlace = null;
  renderList();
});

const categoryOf = (id) => state.categories.find((c) => c.id === id);
const groupOf = (id) => state.groups.find((g) => g.id === id);
/** Two filters, one question: is this place on the map right now? */
const visible = (place) =>
  !hidden.has(place.categoryId) && (!activeGroup || place.groupId === activeGroup);
const colorOf = (place) => categoryOf(place.categoryId)?.color || '#6b7280';

/* ------------------------------------------------------------------- pins */

function pinIcon(category, extraClass = '') {
  const color = category?.color || '#6b7280';
  const emoji = category?.emoji || '📍';
  return L.divIcon({
    className: '',
    html: `<div class="pin ${extraClass}" style="--c:${color}"><span>${emoji}</span></div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    popupAnchor: [0, -34],
  });
}

/** A cluster wears the colours of what it hides: one arc per category. */
function clusterIcon(cluster) {
  const children = cluster.getAllChildMarkers();
  const tally = new Map();
  for (const marker of children) {
    const color = colorOf(marker.options.place);
    tally.set(color, (tally.get(color) || 0) + 1);
  }

  let at = 0;
  const stops = [];
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

function renderMarkers() {
  for (const [place, marker] of markers) {
    if (!state.places.includes(place)) {
      clusters.removeLayer(marker);
      markers.delete(place);
    }
  }

  for (const place of state.places) {
    const category = categoryOf(place.categoryId);
    let marker = markers.get(place);
    if (!marker) {
      marker = L.marker([place.lat, place.lng], {
        icon: pinIcon(category),
        riseOnHover: true,
        place,
      });
      markers.set(place, marker);
    } else {
      marker.setLatLng([place.lat, place.lng]);
      marker.setIcon(pinIcon(category));
    }
    // Rebind every render: the popup must read the place as it is now.
    marker.bindPopup(() => popupFor(place), { closeButton: false, offset: [0, 2] });

    const onMap = visible(place);
    if (onMap && !clusters.hasLayer(marker)) clusters.addLayer(marker);
    if (!onMap && clusters.hasLayer(marker)) clusters.removeLayer(marker);
  }
}

function popupFor(place) {
  const category = categoryOf(place.categoryId);
  const node = document.createElement('div');

  const badge = document.createElement('span');
  badge.className = 'pop-cat';
  badge.style.setProperty('--c', category?.color || '#6b7280');
  const emo = document.createElement('span');
  emo.className = 'emo';
  emo.textContent = category?.emoji || '📍';
  const catName = document.createElement('span');
  catName.textContent = category?.name || 'Senza categoria';
  badge.append(emo, catName);

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
  edit.append(icon('edit'), text('Modifica'));
  edit.addEventListener('click', () => {
    map.closePopup();
    openPlaceSheet(place);
  });

  const directions = document.createElement('a');
  directions.target = '_blank';
  directions.rel = 'noreferrer';
  directions.href = `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`;
  directions.append(icon('directions'), text('Indicazioni'));

  actions.append(edit, directions);
  node.append(badge, name, note, actions);
  return node;
}

const text = (value) => document.createTextNode(value);

/** Lift the pin that belongs to a row being pointed at. */
function highlight(place, on) {
  const marker = markers.get(place);
  const pin = marker?._icon?.firstElementChild;
  if (!pin) return;
  pin.classList.toggle('is-hover', on);
  marker.setZIndexOffset(on ? 900 : 0);
}

function focusPlace(place) {
  const marker = markers.get(place);
  if (!marker) return;
  // Past CLUSTER_OFF_AT every marker stands on its own, so the popup can open.
  map.flyTo([place.lat, place.lng], Math.max(map.getZoom(), CLUSTER_OFF_AT), { duration: 0.7 });
  map.once('moveend', () => clusters.zoomToShowLayer(marker, () => marker.openPopup()));
}

/* ------------------------------------------------------------------ panel */

function chipFor(category, { on, count }) {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = `chip ${on ? 'on' : 'off'}`;
  chip.style.setProperty('--c', category.color);
  chip.dataset.id = category.id;

  const emo = document.createElement('span');
  emo.className = 'emo';
  emo.textContent = category.emoji;
  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = category.name;
  chip.append(emo, name);

  if (count !== undefined) {
    const tally = document.createElement('span');
    tally.className = 'count';
    tally.textContent = count;
    chip.append(tally);
  }
  return chip;
}

const inScope = (place) => !activeGroup || place.groupId === activeGroup;
const countIn = (categoryId) =>
  state.places.filter((p) => p.categoryId === categoryId && inScope(p)).length;
const countGroup = (groupId) => state.places.filter((p) => p.groupId === groupId).length;

function renderFilters() {
  el.filters.textContent = '';
  el.placeCount.textContent = state.places.length;
  for (const category of state.categories) {
    const chip = chipFor(category, { on: !hidden.has(category.id), count: countIn(category.id) });
    chip.addEventListener('click', () => {
      if (hidden.has(category.id)) hidden.delete(category.id);
      else hidden.add(category.id);
      writeJSON('pi.hidden', [...hidden]);
      renderFilters();
      renderMarkers();
      renderList();
    });
    el.filters.append(chip);
  }
}

const formatDistance = (metres) =>
  metres < 950 ? `${Math.round(metres / 10) * 10} m` : `${(metres / 1000).toFixed(metres < 9500 ? 1 : 0)} km`;

/** The index itself: what is on screen right now, nearest first. */
function renderList() {
  el.listHead.hidden = !state.places.length;
  el.list.hidden = !state.places.length;
  el.list.textContent = '';
  if (!state.places.length) return;

  const bounds = map.getBounds();
  const centre = map.getCenter();
  const rows = state.places
    .filter((place) => visible(place) && bounds.contains([place.lat, place.lng]))
    .map((place) => ({ place, distance: centre.distanceTo([place.lat, place.lng]) }))
    .sort((a, b) => a.distance - b.distance);

  el.listCount.textContent = rows.length;

  if (!rows.length) {
    const empty = document.createElement('li');
    empty.className = 'row-empty';
    empty.textContent = 'Nessun posto in questa parte di mappa.';
    el.list.append(empty);
    return;
  }

  for (const { place, distance } of rows) {
    const category = categoryOf(place.categoryId);
    const row = document.createElement('li');
    row.className = `row${place === activePlace ? ' is-active' : ''}`;
    row.style.setProperty('--c', category?.color || '#6b7280');

    const dot = document.createElement('span');
    dot.className = 'row-dot';
    dot.textContent = category?.emoji || '📍';

    const body = document.createElement('span');
    body.className = 'row-body';
    const name = document.createElement('span');
    name.className = 'row-name';
    name.textContent = place.name;
    const note = document.createElement('span');
    note.className = 'row-note';
    note.textContent = place.note || category?.name || '';
    body.append(name, note);

    const away = document.createElement('span');
    away.className = 'row-dist';
    away.textContent = formatDistance(distance);

    row.append(dot, body, away);
    row.addEventListener('pointerenter', () => highlight(place, true));
    row.addEventListener('pointerleave', () => highlight(place, false));
    row.addEventListener('click', () => focusPlace(place));
    el.list.append(row);
  }

  el.list.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' });
}

/** Groups are a scope, not a mix: one at a time, or all of them. */
function renderGroups() {
  const has = state.groups.length > 0;
  el.groupHead.hidden = !has;
  el.groupFilters.hidden = !has;
  el.groupFilters.textContent = '';
  if (!has) return;

  const scopes = [{ id: null, name: 'Tutti', count: state.places.length }].concat(
    state.groups.map((group) => ({ id: group.id, name: group.name, count: countGroup(group.id) })),
  );

  for (const scope of scopes) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `chip${scope.id === activeGroup ? ' sel' : ''}`;
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = scope.name;
    const tally = document.createElement('span');
    tally.className = 'count';
    tally.textContent = scope.count;
    chip.append(name, tally);
    chip.addEventListener('click', () => {
      activeGroup = scope.id === activeGroup ? null : scope.id;
      writeJSON('pi.group', activeGroup);
      renderAll();
      if (activeGroup) flyToGroup(activeGroup);
    });
    el.groupFilters.append(chip);
  }
}

/** Picking "Padova" should take you to Padova, not leave you where you were. */
function flyToGroup(groupId) {
  const members = state.places.filter((place) => place.groupId === groupId && !hidden.has(place.categoryId));
  if (!members.length) return;
  const bounds = L.latLngBounds(members.map((place) => [place.lat, place.lng]));
  map.flyToBounds(bounds, { padding: [70, 70], maxZoom: 15, duration: 0.8 });
}

function renderGroupChoice(selectedId) {
  el.groupField.hidden = !state.groups.length;
  el.groupChoice.textContent = '';
  if (!state.groups.length) return;

  const scopes = [{ id: '', name: 'Nessuno' }].concat(state.groups);
  for (const scope of scopes) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `chip${scope.id === (selectedId || '') ? ' sel' : ''}`;
    chip.dataset.id = scope.id;
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = scope.name;
    chip.append(name);
    chip.addEventListener('click', () => renderGroupChoice(scope.id));
    el.groupChoice.append(chip);
  }
}

const selectedGroupId = () => el.groupChoice.querySelector('.chip.sel')?.dataset.id || '';

function renderGroupList() {
  el.groupList.textContent = '';
  for (const group of state.groups) {
    const count = countGroup(group.id);
    const li = document.createElement('li');

    const name = document.createElement('input');
    name.type = 'text';
    name.value = group.name;
    name.maxLength = 40;
    name.addEventListener('change', () => patchGroup(group, { name: name.value }));

    const tally = document.createElement('span');
    tally.className = 'count';
    tally.textContent = count || '';

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'ghost-icon';
    del.append(icon('trash'));
    del.title = 'Elimina gruppo';
    del.addEventListener('click', () => deleteGroup(group));

    li.append(name, tally, del);
    el.groupList.append(li);
  }
}

function renderCategoryChoice(selectedId) {
  el.categoryChoice.textContent = '';
  if (!state.categories.length) {
    const link = document.createElement('button');
    link.type = 'button';
    link.className = 'ghost';
    link.textContent = 'Crea la prima categoria';
    link.addEventListener('click', () => openManageSheet('categories'));
    el.categoryChoice.append(link);
    return;
  }

  for (const category of state.categories) {
    const chip = chipFor(category, { on: category.id === selectedId });
    chip.addEventListener('click', () => renderCategoryChoice(category.id));
    el.categoryChoice.append(chip);
  }
}

const selectedCategoryId = () => el.categoryChoice.querySelector('.chip.on')?.dataset.id || '';

function renderCategoryList() {
  el.categoryList.textContent = '';
  for (const category of state.categories) {
    const count = countIn(category.id);
    const li = document.createElement('li');

    const emojiBtn = document.createElement('button');
    emojiBtn.type = 'button';
    emojiBtn.className = 'emoji-btn';
    emojiBtn.textContent = category.emoji;
    emojiBtn.title = 'Cambia emoji';
    emojiBtn.addEventListener('click', () => {
      openEmojiPicker(emojiBtn, (emoji) => {
        emojiBtn.textContent = emoji;
        patchCategory(category, { emoji });
      });
    });

    const name = document.createElement('input');
    name.type = 'text';
    name.value = category.name;
    name.maxLength = 40;
    name.addEventListener('change', () => patchCategory(category, { name: name.value }));

    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = 'swatch';
    swatch.title = 'Colore';
    paintSwatch(swatch, category.color);
    swatch.addEventListener('click', () => {
      openColorPicker(swatch, category.color, (color) => {
        paintSwatch(swatch, color);
        patchCategory(category, { color });
      });
    });

    const tally = document.createElement('span');
    tally.className = 'count';
    tally.textContent = count || '';

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'ghost-icon';
    del.append(icon('trash'));
    del.title = 'Elimina categoria';
    del.addEventListener('click', () => deleteCategory(category));

    li.append(emojiBtn, name, swatch, tally, del);
    el.categoryList.append(li);
  }
}

function renderAll() {
  renderGroups();
  renderFilters();
  renderList();
  renderCategoryList();
  renderGroupList();
  renderMarkers();
  if (!el.placeSheet.hidden) {
    renderCategoryChoice(selectedCategoryId());
    renderGroupChoice(selectedGroupId());
  }
}

/* ---------------------------------------------- writes, applied on the spot */

/** Category edits are safe to apply first: the id never changes. */
async function patchCategory(category, patch) {
  const before = { ...category };
  Object.assign(category, patch);
  renderAll();
  try {
    Object.assign(category, await api(`/categories/${category.id}`, { method: 'PUT', body: patch }));
  } catch (err) {
    Object.assign(category, before);
    renderAll();
    toast(err.message);
  }
}

function deleteCategory(category) {
  const index = state.categories.indexOf(category);
  const orphans = state.places.filter((p) => p.categoryId === category.id);
  state.categories.splice(index, 1);
  state.places = state.places.filter((p) => p.categoryId !== category.id);
  renderAll();

  const cancel = deferCommit((opts) =>
    api(`/categories/${category.id}`, { method: 'DELETE', ...opts }).catch(() => {}),
  );

  toast(
    orphans.length
      ? `"${category.name}" e ${orphans.length} posti eliminati`
      : `"${category.name}" eliminata`,
    {
      label: 'Annulla',
      onClick: () => {
        cancel();
        state.categories.splice(index, 0, category);
        state.places = [...state.places, ...orphans];
        renderAll();
      },
    },
  );
}

async function patchGroup(group, patch) {
  const before = { ...group };
  Object.assign(group, patch);
  renderAll();
  try {
    Object.assign(group, await api(`/groups/${group.id}`, { method: 'PUT', body: patch }));
  } catch (err) {
    Object.assign(group, before);
    renderAll();
    toast(err.message);
  }
}

function deleteGroup(group) {
  const index = state.groups.indexOf(group);
  const members = state.places.filter((p) => p.groupId === group.id);
  state.groups.splice(index, 1);
  for (const place of members) place.groupId = '';
  if (activeGroup === group.id) {
    activeGroup = null;
    writeJSON('pi.group', null);
  }
  renderAll();

  const cancel = deferCommit((opts) =>
    api(`/groups/${group.id}`, { method: 'DELETE', ...opts }).catch(() => {}),
  );

  toast(
    members.length ? `"${group.name}" sciolto, ${members.length} posti restano` : `"${group.name}" eliminato`,
    {
      label: 'Annulla',
      onClick: () => {
        cancel();
        state.groups.splice(index, 0, group);
        for (const place of members) place.groupId = group.id;
        renderAll();
      },
    },
  );
}

function deletePlace(place) {
  const index = state.places.indexOf(place);
  if (index < 0) return;
  state.places.splice(index, 1);
  renderAll();

  const cancel = deferCommit((opts) =>
    api(`/places/${place.id}`, { method: 'DELETE', ...opts }).catch(() => {}),
  );

  toast(`"${place.name}" eliminato`, {
    label: 'Annulla',
    onClick: () => {
      cancel();
      state.places.splice(index, 0, place);
      renderAll();
    },
  });
}

async function savePlace(body) {
  const existing = draft.id && state.places.find((p) => p.id === draft.id);

  if (existing) {
    const before = { ...existing };
    Object.assign(existing, body);
    renderAll();
    try {
      Object.assign(existing, await api(`/places/${existing.id}`, { method: 'PUT', body }));
      renderAll();
    } catch (err) {
      Object.assign(existing, before);
      renderAll();
      toast(err.message);
    }
    return;
  }

  // Shown immediately under a temporary id; the server's answer replaces it in place.
  const place = { id: `tmp-${Date.now()}`, ...body, createdAt: new Date().toISOString() };
  state.places.push(place);
  renderAll();
  try {
    Object.assign(place, await api('/places', { method: 'POST', body }));
    renderAll();
  } catch (err) {
    const index = state.places.indexOf(place);
    if (index >= 0) state.places.splice(index, 1);
    renderAll();
    toast(err.message);
  }
}

/* ------------------------------------------------------------ place sheet */

function setPicking(on) {
  picking = on;
  document.body.classList.toggle('picking', on);
  el.hint.hidden = !on;
  el.addBtn.classList.toggle('active', on);
  el.addLabel.textContent = on ? 'Annulla' : 'Aggiungi posto';
}

function clearDraftMarker() {
  if (draftMarker) {
    draftMarker.remove();
    draftMarker = null;
  }
}

/**
 * On a narrow screen an open sheet covers the bottom, where the map chrome
 * lives. The zoom hides; the attribution is not optional, so it is pushed up
 * by exactly the height of the sheet — which changes as the sheet grows.
 */
const measureSheet = (sheet) =>
  document.body.style.setProperty('--sheet-h', `${Math.round(sheet.getBoundingClientRect().height)}px`);

const sheetSize = new ResizeObserver((entries) => measureSheet(entries[0].target));

function syncSheetState() {
  const sheet = !el.placeSheet.hidden ? el.placeSheet : !el.manageSheet.hidden ? el.manageSheet : null;
  document.body.classList.toggle('sheet-open', Boolean(sheet));
  sheetSize.disconnect();
  if (!sheet) return document.body.style.removeProperty('--sheet-h');
  measureSheet(sheet);
  sheetSize.observe(sheet);
}

function openPlaceSheet(place) {
  draft = { ...place };
  closeManageSheet();
  el.placeSheet.hidden = false;
  syncSheetState();
  el.placeTitle.textContent = place.id ? 'Modifica posto' : 'Nuovo posto';
  el.placeForm.elements.name.value = place.name || '';
  el.placeForm.elements.note.value = place.note || '';
  el.coords.textContent = `${place.lat.toFixed(5)}, ${place.lng.toFixed(5)}`;
  el.deleteBtn.hidden = !place.id;
  renderCategoryChoice(place.categoryId || state.categories[0]?.id);
  // a new place lands in the group you are looking at
  renderGroupChoice(place.id ? place.groupId : (place.groupId ?? activeGroup ?? ''));

  clearDraftMarker();
  const existing = markers.get(place);
  if (existing) clusters.removeLayer(existing);
  draftMarker = L.marker([place.lat, place.lng], {
    icon: pinIcon(categoryOf(selectedCategoryId()), place.id ? '' : 'draft'),
    draggable: true,
    zIndexOffset: 1000,
  }).addTo(map);
  draftMarker.on('dragend', () => {
    const { lat, lng } = draftMarker.getLatLng();
    draft.lat = lat;
    draft.lng = lng;
    el.coords.textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  });

  el.placeForm.elements.name.focus();
}

function closePlaceSheet() {
  el.placeSheet.hidden = true;
  placeSheetPaused = false;
  draft = null;
  clearDraftMarker();
  renderMarkers();
  syncSheetState();
}

/** True while the place sheet is only stepping aside for the manage sheet. */
let placeSheetPaused = false;

function openManageSheet(tab = 'categories') {
  // One sheet at a time, but a draft in progress survives: you open this very
  // panel to create the category the place you are adding still needs.
  if (!el.placeSheet.hidden) {
    el.placeSheet.hidden = true;
    placeSheetPaused = true;
  }
  el.manageSheet.hidden = false;
  showTab(tab);
  renderCategoryList();
  renderGroupList();
  syncSheetState();
}

/** One list at a time: the sheet holds two, not a pile. */
function showTab(name) {
  for (const tab of el.tabs) tab.classList.toggle('is-on', tab.dataset.tab === name);
  for (const panel of document.querySelectorAll('#manage-sheet .tab-panel')) {
    panel.hidden = panel.dataset.panel !== name;
  }
}

for (const tab of el.tabs) tab.addEventListener('click', () => showTab(tab.dataset.tab));

/** The add row lights up once it has something to add. */
for (const form of [el.categoryForm, el.groupForm]) {
  form.addEventListener('input', () => {
    form.classList.toggle('is-ready', form.elements.name.value.trim().length > 0);
  });
}

function closeManageSheet() {
  el.manageSheet.hidden = true;
  closeEmojiPicker();
  closeColorPicker();
  if (placeSheetPaused && draft) {
    placeSheetPaused = false;
    el.placeSheet.hidden = false;
    renderCategoryChoice(selectedCategoryId() || state.categories[state.categories.length - 1]?.id);
    renderGroupChoice(selectedGroupId());
  } else {
    placeSheetPaused = false;
  }
  syncSheetState();
}

el.placeForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!draft) return;
  const categoryId = selectedCategoryId();
  if (!categoryId) return toast('Scegli o crea una categoria');

  const body = {
    name: el.placeForm.elements.name.value.trim(),
    note: el.placeForm.elements.note.value.trim(),
    categoryId,
    groupId: selectedGroupId(),
    lat: draft.lat,
    lng: draft.lng,
  };
  const editing = Boolean(draft.id);
  savePlace(body);
  closePlaceSheet();
  toast(editing ? `"${body.name}" aggiornato` : `"${body.name}" salvato`);
});

el.deleteBtn.addEventListener('click', () => {
  const place = draft?.id && state.places.find((p) => p.id === draft.id);
  if (!place) return;
  closePlaceSheet();
  deletePlace(place);
});

// Keep the draft pin in sync with the category picked in the form.
el.categoryChoice.addEventListener('click', () => {
  if (draftMarker) draftMarker.setIcon(pinIcon(categoryOf(selectedCategoryId())));
});

for (const button of document.querySelectorAll('[data-close]')) {
  button.addEventListener('click', () => {
    if (button.closest('#place-sheet')) closePlaceSheet();
    else closeManageSheet();
  });
}

el.addBtn.addEventListener('click', () => {
  if (picking) return setPicking(false);
  closePlaceSheet();
  setPicking(true);
});

el.manageBtn.addEventListener('click', () => {
  if (el.manageSheet.hidden) openManageSheet();
  else closeManageSheet();
});

document.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    return el.palette.hidden ? openPalette() : closePalette();
  }
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !el.placeSheet.hidden) {
    event.preventDefault();
    el.placeForm.requestSubmit();
    return;
  }
  if (event.key !== 'Escape') return;
  if (!el.palette.hidden) return closePalette();
  if (!el.colorPopover.hidden) return closeColorPicker();
  if (!el.emojiPopover.hidden) return closeEmojiPicker();
  if (picking) return setPicking(false);
  if (!el.placeSheet.hidden) return closePlaceSheet();
  if (!el.manageSheet.hidden) closeManageSheet();
});

/* --------------------------------------------------------- category form */

let newCategoryEmoji = '📍';
let newCategoryColor = COLORS[0];
paintSwatch(el.newColor, newCategoryColor);

el.newColor.addEventListener('click', () => {
  openColorPicker(el.newColor, newCategoryColor, (color) => {
    newCategoryColor = color;
    paintSwatch(el.newColor, color);
  });
});

el.newEmoji.addEventListener('click', () => {
  openEmojiPicker(el.newEmoji, (emoji) => {
    newCategoryEmoji = emoji;
    el.newEmoji.textContent = emoji;
  });
});

el.categoryForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const body = {
    name: el.categoryForm.elements.name.value.trim(),
    emoji: newCategoryEmoji,
    color: newCategoryColor,
  };
  if (!body.name) return;
  try {
    // Awaited, not optimistic: a place cannot be saved against a category id
    // the server has never seen.
    const created = await api('/categories', { method: 'POST', body });
    state.categories.push(created);
    el.categoryForm.reset();
    el.categoryForm.classList.remove('is-ready');
    newCategoryEmoji = '📍';
    el.newEmoji.textContent = '📍';
    newCategoryColor = COLORS[(COLORS.indexOf(newCategoryColor) + 1) % COLORS.length];
    paintSwatch(el.newColor, newCategoryColor);
    renderAll();
    if (!el.placeSheet.hidden) renderCategoryChoice(created.id);
    toast(`Categoria "${created.name}" creata`);
  } catch (err) {
    toast(err.message);
  }
});

el.groupForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = el.groupForm.elements.name.value.trim();
  if (!name) return;
  try {
    // Awaited like categories: a place cannot point at an id the server lacks.
    const created = await api('/groups', { method: 'POST', body: { name } });
    state.groups.push(created);
    el.groupForm.reset();
    el.groupForm.classList.remove('is-ready');
    renderAll();
    if (!el.placeSheet.hidden) renderGroupChoice(created.id);
    toast(`Gruppo "${created.name}" creato`);
  } catch (err) {
    toast(err.message);
  }
});

/* ----------------------------------------------------------- emoji picker */

let emojiTarget = null;
el.emojiPicker.dataSource = emojiDataUrl;
el.emojiPicker.i18n = {
  categoriesLabel: 'Categorie',
  emojiUnsupportedMessage: 'Il browser non supporta le emoji a colori.',
  favoritesLabel: 'Usate di recente',
  loadingMessage: 'Carico…',
  networkErrorMessage: 'Impossibile caricare le emoji.',
  regionLabel: 'Scelta emoji',
  searchDescription: 'Usa le frecce per scorrere i risultati, Invio per scegliere.',
  searchLabel: 'Cerca',
  searchResultsLabel: 'Risultati',
  skinToneDescription: 'Usa le frecce per scegliere, Invio per confermare.',
  skinToneLabel: 'Tonalità della pelle (ora: {skinTone})',
  skinTonesLabel: 'Tonalità della pelle',
  skinTones: ['Neutra', 'Chiara', 'Medio-chiara', 'Media', 'Medio-scura', 'Scura'],
  categories: {
    custom: 'Personalizzate',
    'smileys-emotion': 'Faccine ed emozioni',
    'people-body': 'Persone',
    'animals-nature': 'Animali e natura',
    'food-drink': 'Cibo e bevande',
    'travel-places': 'Viaggi e luoghi',
    activities: 'Attività',
    objects: 'Oggetti',
    symbols: 'Simboli',
    flags: 'Bandiere',
  },
};

const GAP = 10;

/**
 * Popovers open beside their sheet when there is room, so the form underneath
 * stays readable, and fall back to above/below the button when there is not.
 */
function placePopover(popover, anchor, width, height) {
  const rect = anchor.getBoundingClientRect();
  const sheet = anchor.closest('aside')?.getBoundingClientRect();
  popover.hidden = false;

  const beside = sheet && sheet.left - width - GAP > 8 ? sheet.left - width - GAP : null;
  const left = beside ?? Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
  const below = rect.bottom + height + GAP < window.innerHeight;
  const top = Math.min(
    Math.max(8, beside ? rect.top - 8 : below ? rect.bottom + GAP : rect.top - height - GAP),
    window.innerHeight - height - 8,
  );
  popover.style.left = `${left}px`;
  popover.style.top = `${top}px`;
}

function openEmojiPicker(anchor, onPick) {
  closeColorPicker();
  emojiTarget = onPick;
  placePopover(el.emojiPopover, anchor, 304, 322);
}

function closeEmojiPicker() {
  el.emojiPopover.hidden = true;
  emojiTarget = null;
}

el.emojiPicker.addEventListener('emoji-click', (event) => {
  emojiTarget?.(event.detail.unicode);
  closeEmojiPicker();
});

document.addEventListener('pointerdown', (event) => {
  if (el.emojiPopover.hidden) return;
  if (el.emojiPopover.contains(event.target) || event.target.closest('.emoji-btn')) return;
  closeEmojiPicker();
});

/* ----------------------------------------------------------- colour picker */

let colorTarget = null;

/** Built once; opening it only moves the ring to the colour in use. */
for (const color of COLORS) {
  const swatch = document.createElement('button');
  swatch.type = 'button';
  swatch.className = 'swatch-dot';
  swatch.dataset.color = color;
  swatch.title = color;
  paintSwatch(swatch, color);
  swatch.addEventListener('click', () => {
    const pick = colorTarget;
    closeColorPicker();
    pick?.(color);
  });
  el.swatches.append(swatch);
}

function openColorPicker(anchor, current, onPick) {
  closeEmojiPicker();
  colorTarget = onPick;
  for (const swatch of el.swatches.children) {
    swatch.classList.toggle('is-on', swatch.dataset.color === current);
  }
  placePopover(el.colorPopover, anchor, 208, 208);
}

function closeColorPicker() {
  el.colorPopover.hidden = true;
  colorTarget = null;
}

document.addEventListener('pointerdown', (event) => {
  if (el.colorPopover.hidden) return;
  if (el.colorPopover.contains(event.target) || event.target.closest('.swatch')) return;
  closeColorPicker();
});

/* --------------------------------------------------------------- palette */

const IS_MAC = /mac|iphone|ipad/i.test(navigator.userAgentData?.platform || navigator.platform || navigator.userAgent);
el.searchKey.textContent = IS_MAC ? '⌘K' : 'Ctrl K';

const palette = { items: [], selected: 0, addresses: [], query: '' };
let geocodeTimer;
let geocodeAbort;

const norm = (value) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/** Your own places, ranked: name first, then category, then notes. */
function matchPlaces(query) {
  const centre = map.getCenter();
  const q = norm(query.trim());
  const hits = [];

  for (const place of state.places) {
    const name = norm(place.name);
    let rank = Infinity;
    if (!q) rank = 5;
    else if (name.startsWith(q)) rank = 0;
    else if (name.includes(q)) rank = 1;
    else if (norm(categoryOf(place.categoryId)?.name || '').includes(q)) rank = 2;
    else if (norm(groupOf(place.groupId)?.name || '').includes(q)) rank = 3;
    else if (norm(place.note || '').includes(q)) rank = 4;
    if (rank === Infinity) continue;
    hits.push({ place, rank, distance: centre.distanceTo([place.lat, place.lng]) });
  }

  return hits.sort((a, b) => a.rank - b.rank || a.distance - b.distance).slice(0, 8);
}

function paletteSection(label, hint) {
  const head = document.createElement('div');
  head.className = 'palette-section';
  const title = document.createElement('span');
  title.className = 'eyebrow';
  title.textContent = label;
  head.append(title);
  if (hint) {
    const note = document.createElement('span');
    note.className = 'palette-meta';
    note.textContent = hint;
    head.append(note);
  }
  el.paletteResults.append(head);
}

function paletteRow({ color, emoji, iconName, name, note, meta, onPick }) {
  const row = document.createElement('div');
  row.className = 'palette-row';
  if (color) row.style.setProperty('--c', color);

  const dot = document.createElement('span');
  dot.className = 'palette-dot';
  dot.append(emoji ? text(emoji) : icon(iconName));

  const body = document.createElement('span');
  body.className = 'palette-body';
  const title = document.createElement('span');
  title.className = 'palette-name';
  title.textContent = name;
  const sub = document.createElement('span');
  sub.className = 'palette-note';
  sub.textContent = note || '';
  body.append(title, sub);

  row.append(dot, body);
  if (meta) {
    const tail = document.createElement('span');
    tail.className = 'palette-meta';
    tail.textContent = meta;
    row.append(tail);
  }

  const index = palette.items.length;
  row.addEventListener('pointerenter', () => select(index));
  row.addEventListener('click', onPick);
  palette.items.push({ row, onPick });
  el.paletteResults.append(row);
}

function renderPalette() {
  el.paletteResults.textContent = '';
  palette.items = [];

  const places = matchPlaces(palette.query);
  if (places.length) {
    paletteSection('I tuoi posti', palette.query.trim() ? undefined : 'i piu vicini');
    for (const { place, distance } of places) {
      const category = categoryOf(place.categoryId);
      paletteRow({
        color: category?.color,
        emoji: category?.emoji || '📍',
        name: place.name,
        note: [groupOf(place.groupId)?.name, place.note || category?.name].filter(Boolean).join(' · '),
        meta: formatDistance(distance),
        onPick: () => {
          closePalette();
          // searching for something a filter hides should still reveal it
          let revealed = hidden.delete(place.categoryId);
          if (activeGroup && place.groupId !== activeGroup) {
            activeGroup = null;
            writeJSON('pi.group', null);
            revealed = true;
          }
          if (revealed) {
            writeJSON('pi.hidden', [...hidden]);
            renderAll();
          }
          focusPlace(place);
        },
      });
    }
  }

  palette.addresses.forEach((hit, at) => {
    if (at === 0) paletteSection('Indirizzi', 'da OpenStreetMap');
    const label = hit.name || hit.display_name.split(',')[0];
    paletteRow({
      iconName: 'pin',
      name: label,
      note: hit.display_name,
      meta: 'nuovo',
      onPick: () => {
        closePalette();
        const lat = Number(hit.lat);
        const lng = Number(hit.lon);
        map.setView([lat, lng], Math.max(map.getZoom(), 16));
        setPicking(false);
        openPlaceSheet({ lat, lng, name: label, note: hit.display_name });
      },
    });
  });

  if (!palette.items.length) {
    const empty = document.createElement('p');
    empty.className = 'palette-empty';
    empty.textContent =
      palette.query.trim().length < 3
        ? 'Scrivi almeno tre lettere per cercare anche tra gli indirizzi.'
        : 'Nessun posto e nessun indirizzo con questo nome.';
    el.paletteResults.append(empty);
  }

  select(Math.min(palette.selected, palette.items.length - 1));
}

function select(index) {
  palette.selected = Math.max(0, index);
  palette.items.forEach((item, at) => item.row.classList.toggle('is-sel', at === palette.selected));
  palette.items[palette.selected]?.row.scrollIntoView({ block: 'nearest' });
}

const setSearching = (on) => {
  el.paletteSpinner.hidden = !on;
};

/** Addresses cost a round trip, so they follow the typing at a distance. */
function scheduleGeocode() {
  clearTimeout(geocodeTimer);
  geocodeAbort?.abort();
  const query = palette.query.trim();

  if (query.length < 3) {
    palette.addresses = [];
    setSearching(false);
    return renderPalette();
  }

  setSearching(true);
  geocodeTimer = setTimeout(async () => {
    geocodeAbort = new AbortController();
    try {
      const url = new URL('https://nominatim.openstreetmap.org/search');
      url.search = new URLSearchParams({ q: query, format: 'jsonv2', limit: '5', 'accept-language': 'it' });
      const res = await fetch(url, { headers: { accept: 'application/json' }, signal: geocodeAbort.signal });
      palette.addresses = res.ok ? await res.json() : [];
    } catch (err) {
      if (err.name === 'AbortError') return;
      palette.addresses = [];
    }
    setSearching(false);
    renderPalette();
  }, 350);
}

function openPalette() {
  el.palette.hidden = false;
  palette.query = '';
  palette.addresses = [];
  palette.selected = 0;
  el.paletteInput.value = '';
  setSearching(false);
  renderPalette();
  el.paletteInput.focus();
}

function closePalette() {
  el.palette.hidden = true;
  clearTimeout(geocodeTimer);
  geocodeAbort?.abort();
  setSearching(false);
}

el.searchTrigger.addEventListener('click', openPalette);

el.paletteInput.addEventListener('input', () => {
  palette.query = el.paletteInput.value;
  palette.selected = 0;
  renderPalette();
  scheduleGeocode();
});

el.paletteInput.addEventListener('keydown', (event) => {
  const count = Math.max(palette.items.length, 1);
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    select((palette.selected + 1) % count);
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    select((palette.selected - 1 + count) % count);
  } else if (event.key === 'Enter') {
    event.preventDefault();
    palette.items[palette.selected]?.onPick();
  }
});

el.palette.addEventListener('pointerdown', (event) => {
  if (event.target === el.palette) closePalette();
});

/* ------------------------------------------------------------------ boot */

api('/state')
  .then((data) => {
    state.categories = data.categories;
    state.groups = data.groups ?? [];
    state.places = data.places;
    renderAll();
    if (!state.categories.length) openManageSheet();
  })
  .catch((err) => toast(`Caricamento fallito: ${err.message}`));
