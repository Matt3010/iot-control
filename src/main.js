import '@fontsource-variable/inter/wght.css';
import 'leaflet/dist/leaflet.css';
import 'emoji-picker-element';
// Emoji data is bundled and served locally: no CDN call at runtime.
import emojiDataUrl from 'emoji-picker-element-data/en/emojibase/data.json?url';
import L from 'leaflet';
import './style.css';

const $ = (sel) => document.querySelector(sel);

const el = {
  map: $('#map'),
  search: $('#search'),
  searchInput: $('#search-input'),
  searchResults: $('#search-results'),
  filters: $('#filters'),
  placeCount: $('#place-count'),
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
  categorySheet: $('#category-sheet'),
  categoryList: $('#category-list'),
  categoryForm: $('#category-form'),
  newEmoji: $('#new-emoji'),
  emojiPopover: $('#emoji-popover'),
  emojiPicker: $('#emoji-popover emoji-picker'),
  toast: $('#toast'),
};

const state = { categories: [], places: [] };
/** Category ids hidden from the map; kept per-browser, not on the server. */
const hidden = new Set(readJSON('pi.hidden', []));
/** Draft place being created or edited: { id?, lat, lng }. */
let draft = null;
let draftMarker = null;
let picking = false;
const markers = new Map();

const icon = (paths, size = 16) =>
  `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" style="width:${size}px;height:${size}px">${paths}</svg>`;

const ICONS = {
  edit: icon('<path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3Z"/><path d="M13.5 7.5 16.5 10.5"/>'),
  directions: icon('<path d="M3 11.5 21 4l-7.5 17-2-7-8.5-2.5Z"/>'),
  trash: icon('<path d="M4 7h16M9 7V5h6v2M7 7l1 13h8l1-13M10 11v6M14 11v6"/>'),
};

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

let toastTimer;
function toast(message) {
  el.toast.textContent = message;
  el.toast.hidden = false;
  // restart the entrance animation on a repeated toast
  el.toast.style.animation = 'none';
  void el.toast.offsetWidth;
  el.toast.style.animation = '';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.toast.hidden = true;
  }, 2600);
}

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

map.on('moveend', () => {
  const c = map.getCenter();
  writeJSON('pi.view', { lat: c.lat, lng: c.lng, zoom: map.getZoom() });
});

map.on('click', (event) => {
  if (!picking) return;
  setPicking(false);
  openPlaceSheet({ lat: event.latlng.lat, lng: event.latlng.lng });
});

const categoryOf = (id) => state.categories.find((c) => c.id === id);

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

function renderMarkers() {
  for (const [id, marker] of markers) {
    if (!state.places.some((p) => p.id === id)) {
      marker.remove();
      markers.delete(id);
    }
  }

  for (const place of state.places) {
    const category = categoryOf(place.categoryId);
    let marker = markers.get(place.id);
    if (!marker) {
      marker = L.marker([place.lat, place.lng], { icon: pinIcon(category), riseOnHover: true });
      markers.set(place.id, marker);
    } else {
      marker.setLatLng([place.lat, place.lng]);
      marker.setIcon(pinIcon(category));
    }
    // Rebind every render: the closure must see the freshly loaded place.
    marker.bindPopup(() => popupFor(place), { closeButton: false, offset: [0, 2] });

    const visible = !hidden.has(place.categoryId);
    if (visible && !map.hasLayer(marker)) marker.addTo(map);
    if (!visible && map.hasLayer(marker)) marker.remove();
  }
}

function popupFor(place) {
  const category = categoryOf(place.categoryId);
  const node = document.createElement('div');
  node.innerHTML = `
    <span class="pop-cat"><span class="emo"></span><span class="cat-name"></span></span>
    <h3 class="pop-name"></h3>
    <p class="pop-note"></p>
    <div class="pop-actions">
      <button type="button" data-edit>${ICONS.edit}<span>Modifica</span></button>
      <a target="_blank" rel="noreferrer">${ICONS.directions}<span>Indicazioni</span></a>
    </div>`;

  const badge = node.querySelector('.pop-cat');
  badge.style.setProperty('--c', category?.color || '#6b7280');
  badge.querySelector('.emo').textContent = category?.emoji || '📍';
  badge.querySelector('.cat-name').textContent = category?.name || 'Senza categoria';

  node.querySelector('.pop-name').textContent = place.name;
  const note = node.querySelector('.pop-note');
  note.textContent = place.note || '';
  note.hidden = !place.note;
  node.querySelector('a').href = `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`;
  node.querySelector('[data-edit]').addEventListener('click', () => {
    map.closePopup();
    openPlaceSheet(place);
  });
  return node;
}

/* ----------------------------------------------------------------- panels */

function chipFor(category, { on, count }) {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = `chip ${on ? 'on' : 'off'}`;
  chip.style.setProperty('--c', category.color);
  chip.dataset.id = category.id;
  chip.innerHTML = `<span class="emo"></span><span class="name"></span>${
    count === undefined ? '' : '<span class="count"></span>'
  }`;
  chip.querySelector('.emo').textContent = category.emoji;
  chip.querySelector('.name').textContent = category.name;
  if (count !== undefined) chip.querySelector('.count').textContent = count;
  return chip;
}

const countIn = (categoryId) => state.places.filter((p) => p.categoryId === categoryId).length;

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
    });
    el.filters.append(chip);
  }
}

function renderCategoryChoice(selectedId) {
  el.categoryChoice.textContent = '';
  if (!state.categories.length) {
    const link = document.createElement('button');
    link.type = 'button';
    link.className = 'ghost';
    link.textContent = 'Crea la prima categoria';
    link.addEventListener('click', () => openCategorySheet());
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
        saveCategory(category.id, { emoji });
      });
    });

    const name = document.createElement('input');
    name.type = 'text';
    name.value = category.name;
    name.maxLength = 40;
    name.addEventListener('change', () => saveCategory(category.id, { name: name.value }));

    const swatch = document.createElement('label');
    swatch.className = 'swatch';
    swatch.title = 'Colore';
    const color = document.createElement('input');
    color.type = 'color';
    color.value = category.color;
    color.addEventListener('change', () => saveCategory(category.id, { color: color.value }));
    swatch.append(color);

    const tally = document.createElement('span');
    tally.className = 'count';
    tally.textContent = count || '';

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'ghost-icon';
    del.innerHTML = ICONS.trash;
    del.title = 'Elimina categoria';
    del.addEventListener('click', async () => {
      const warning = count
        ? `Eliminare "${category.name}" e i ${count} posti che contiene?`
        : `Eliminare "${category.name}"?`;
      if (!confirm(warning)) return;
      try {
        await api(`/categories/${category.id}`, { method: 'DELETE' });
        await load();
        toast('Categoria eliminata');
      } catch (err) {
        toast(err.message);
      }
    });

    li.append(emojiBtn, name, swatch, tally, del);
    el.categoryList.append(li);
  }
}

async function saveCategory(id, patch) {
  try {
    await api(`/categories/${id}`, { method: 'PUT', body: patch });
    await load();
  } catch (err) {
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

/** On a narrow screen an open sheet covers the bottom, where the map chrome lives. */
function syncSheetState() {
  const open = !el.placeSheet.hidden || !el.categorySheet.hidden;
  document.body.classList.toggle('sheet-open', open);
}

function openPlaceSheet(place) {
  draft = { ...place };
  closeCategorySheet();
  el.placeSheet.hidden = false;
  syncSheetState();
  el.placeTitle.textContent = place.id ? 'Modifica posto' : 'Nuovo posto';
  el.placeForm.elements.name.value = place.name || '';
  el.placeForm.elements.note.value = place.note || '';
  el.coords.textContent = `${place.lat.toFixed(5)}, ${place.lng.toFixed(5)}`;
  el.deleteBtn.hidden = !place.id;
  renderCategoryChoice(place.categoryId || state.categories[0]?.id);

  clearDraftMarker();
  if (!place.id) {
    draftMarker = L.marker([place.lat, place.lng], {
      icon: pinIcon(categoryOf(selectedCategoryId()), 'draft'),
      draggable: true,
      zIndexOffset: 1000,
    }).addTo(map);
    draftMarker.on('dragend', () => {
      const { lat, lng } = draftMarker.getLatLng();
      draft.lat = lat;
      draft.lng = lng;
      el.coords.textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    });
  }
  el.placeForm.elements.name.focus();
}

function closePlaceSheet() {
  el.placeSheet.hidden = true;
  draft = null;
  clearDraftMarker();
  syncSheetState();
}

function openCategorySheet() {
  el.categorySheet.hidden = false;
  renderCategoryList();
  syncSheetState();
}

function closeCategorySheet() {
  el.categorySheet.hidden = true;
  closeEmojiPicker();
  syncSheetState();
}

el.placeForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!draft) return;
  const categoryId = selectedCategoryId();
  if (!categoryId) return toast('Scegli o crea una categoria');

  const body = {
    name: el.placeForm.elements.name.value,
    note: el.placeForm.elements.note.value,
    categoryId,
    lat: draft.lat,
    lng: draft.lng,
  };
  try {
    if (draft.id) await api(`/places/${draft.id}`, { method: 'PUT', body });
    else await api('/places', { method: 'POST', body });
    closePlaceSheet();
    // A place saved into a filtered-out category would otherwise vanish.
    if (hidden.delete(categoryId)) writeJSON('pi.hidden', [...hidden]);
    await load();
    toast(body.name ? `"${body.name}" salvato` : 'Salvato');
  } catch (err) {
    toast(err.message);
  }
});

el.deleteBtn.addEventListener('click', async () => {
  if (!draft?.id || !confirm('Eliminare questo posto?')) return;
  try {
    await api(`/places/${draft.id}`, { method: 'DELETE' });
    closePlaceSheet();
    await load();
    toast('Posto eliminato');
  } catch (err) {
    toast(err.message);
  }
});

// Keep the draft pin in sync with the category picked in the form.
el.categoryChoice.addEventListener('click', () => {
  if (draftMarker) draftMarker.setIcon(pinIcon(categoryOf(selectedCategoryId())));
});

for (const button of document.querySelectorAll('[data-close]')) {
  button.addEventListener('click', () => {
    if (button.closest('#place-sheet')) closePlaceSheet();
    else closeCategorySheet();
  });
}

el.addBtn.addEventListener('click', () => {
  if (picking) return setPicking(false);
  closePlaceSheet();
  setPicking(true);
});

el.manageBtn.addEventListener('click', () => {
  if (el.categorySheet.hidden) openCategorySheet();
  else closeCategorySheet();
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (!el.emojiPopover.hidden) return closeEmojiPicker();
  if (picking) return setPicking(false);
  if (!el.placeSheet.hidden) return closePlaceSheet();
  if (!el.categorySheet.hidden) closeCategorySheet();
});

/* --------------------------------------------------------- category form */

let newCategoryEmoji = '📍';

el.newEmoji.addEventListener('click', () => {
  openEmojiPicker(el.newEmoji, (emoji) => {
    newCategoryEmoji = emoji;
    el.newEmoji.textContent = emoji;
  });
});

el.categoryForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const body = {
    name: el.categoryForm.elements.name.value,
    emoji: newCategoryEmoji,
    color: el.categoryForm.elements.color.value,
  };
  if (!body.name.trim()) return;
  try {
    const created = await api('/categories', { method: 'POST', body });
    el.categoryForm.reset();
    newCategoryEmoji = '📍';
    el.newEmoji.textContent = '📍';
    await load();
    if (!el.placeSheet.hidden) renderCategoryChoice(created.id);
    toast(`Categoria "${created.name}" creata`);
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

const POPOVER = { w: 304, h: 322, gap: 10 };

function openEmojiPicker(anchor, onPick) {
  emojiTarget = onPick;
  const rect = anchor.getBoundingClientRect();
  const sheet = anchor.closest('aside')?.getBoundingClientRect();
  el.emojiPopover.hidden = false;

  // Beside the sheet when there is room, so the form stays readable while picking.
  const beside = sheet && sheet.left - POPOVER.w - POPOVER.gap > 8 ? sheet.left - POPOVER.w - POPOVER.gap : null;
  const left =
    beside ?? Math.min(Math.max(8, rect.left), window.innerWidth - POPOVER.w - 8);
  const below = rect.bottom + POPOVER.h + POPOVER.gap < window.innerHeight;
  const top = Math.min(
    Math.max(8, beside ? rect.top - 8 : below ? rect.bottom + POPOVER.gap : rect.top - POPOVER.h - POPOVER.gap),
    window.innerHeight - POPOVER.h - 8,
  );
  el.emojiPopover.style.left = `${left}px`;
  el.emojiPopover.style.top = `${top}px`;
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

/* ---------------------------------------------------------------- search */

el.search.addEventListener('submit', async (event) => {
  event.preventDefault();
  const query = el.searchInput.value.trim();
  if (!query) return;

  showResults([{ label: 'Cerco…', empty: true }]);
  try {
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.search = new URLSearchParams({ q: query, format: 'jsonv2', limit: '6', 'accept-language': 'it' });
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    const hits = res.ok ? await res.json() : [];
    if (!hits.length) return showResults([{ label: 'Nessun risultato', empty: true }]);
    showResults(
      hits.map((hit) => ({
        label: hit.display_name,
        onPick: () => {
          hideResults();
          const lat = Number(hit.lat);
          const lng = Number(hit.lon);
          map.setView([lat, lng], Math.max(map.getZoom(), 16));
          setPicking(false);
          openPlaceSheet({
            lat,
            lng,
            name: hit.name || hit.display_name.split(',')[0],
            note: hit.display_name,
          });
        },
      })),
    );
  } catch {
    showResults([{ label: 'Ricerca non riuscita', empty: true }]);
  }
});

el.searchInput.addEventListener('input', () => {
  if (!el.searchInput.value) hideResults();
});

function showResults(items) {
  el.searchResults.textContent = '';
  for (const item of items) {
    const li = document.createElement('li');
    li.textContent = item.label;
    if (item.empty) li.className = 'empty';
    else li.addEventListener('click', item.onPick);
    el.searchResults.append(li);
  }
  el.searchResults.hidden = false;
}

function hideResults() {
  el.searchResults.hidden = true;
  el.searchResults.textContent = '';
}

/* ------------------------------------------------------------------ boot */

async function load() {
  const data = await api('/state');
  state.categories = data.categories;
  state.places = data.places;
  renderFilters();
  renderCategoryList();
  renderMarkers();
}

load()
  .then(() => {
    if (!state.categories.length) openCategorySheet();
  })
  .catch((err) => toast(`Caricamento fallito: ${err.message}`));
