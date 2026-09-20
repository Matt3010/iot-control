import { CATEGORIES, makeId } from './data.js';

const SAVE_KEY = 'restaurant-index:saved';

function loadSaved() {
  try { return new Set(JSON.parse(localStorage.getItem(SAVE_KEY) || '[]')); }
  catch { return new Set(); }
}
function persistSaved(set) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify([...set])); } catch { /* ignore */ }
}

export function createUI({ world, focusOn }) {
  const saved = loadSaved();
  let view = 'index';
  let query = '';
  let current = null; // currently open entry

  const $ = (s) => document.querySelector(s);
  const card = $('#card');
  const searchInput = $('#search-input');
  const searchClear = $('#search-clear');

  // ---- category <select> in the add form -------------------------------
  const catSelect = document.querySelector('.add-form select[name=category]');
  for (const [key, c] of Object.entries(CATEGORIES)) {
    const opt = document.createElement('option');
    opt.value = key; opt.textContent = c.label;
    catSelect.appendChild(opt);
  }

  // ---- filtering / views -----------------------------------------------
  function matches(entry) {
    const r = entry.restaurant;
    if (view === 'saved' && !saved.has(r.id)) return false;
    if (!query) return true;
    const cat = CATEGORIES[r.category]?.label || '';
    const hay = `${r.name} ${cat} ${r.city} ${r.notes}`.toLowerCase();
    return hay.includes(query);
  }

  function applyFilter() {
    let visibleCount = 0;
    for (const entry of world.buildings) {
      const ok = matches(entry);
      if (ok) visibleCount++;
      entry.group.visible = view === 'saved' ? saved.has(entry.restaurant.id) : true;
      entry.labelEl.classList.toggle('dim', !ok);
      entry.labelEl.classList.toggle('saved', saved.has(entry.restaurant.id));
      // heart marker on saved tags
      let heart = entry.labelEl.querySelector('.heart');
      if (saved.has(entry.restaurant.id)) {
        if (!heart) {
          heart = document.createElement('span');
          heart.className = 'heart'; heart.textContent = '❤️';
          entry.labelEl.appendChild(heart);
        }
      } else if (heart) heart.remove();
    }
    // if exactly one matches a non-empty search, fly to it
    if (query && visibleCount === 1) {
      const only = world.buildings.find(matches);
      if (only) focusOn(only, false);
    }
  }

  // ---- detail card ------------------------------------------------------
  function openCard(entry) {
    current = entry;
    const r = entry.restaurant;
    const cat = CATEGORIES[r.category] || CATEGORIES.trattoria;
    card.querySelector('.card-cat').textContent = cat.label;
    card.querySelector('.card-cat').style.background = cat.color;
    card.querySelector('.card-name').textContent = r.name;
    card.querySelector('.card-sub').textContent = r.city ? `📍 ${r.city}` : '';
    card.querySelector('.card-rating').textContent = r.rating != null ? r.rating.toFixed(1) : '—';
    card.querySelector('.card-price').textContent = r.price || '—';
    card.querySelector('.card-notes').textContent = r.notes || '';
    const saveBtn = card.querySelector('.card-save');
    const isSaved = saved.has(r.id);
    saveBtn.classList.toggle('on', isSaved);
    saveBtn.textContent = isSaved ? '❤️ Salvato' : '🤍 Salva';
    card.hidden = false;
  }
  function closeCard() { card.hidden = true; current = null; }

  card.querySelector('.card-close').addEventListener('click', closeCard);
  card.querySelector('.card-focus').addEventListener('click', () => current && focusOn(current, true));
  card.querySelector('.card-save').addEventListener('click', () => {
    if (!current) return;
    const id = current.restaurant.id;
    if (saved.has(id)) saved.delete(id); else saved.add(id);
    persistSaved(saved);
    openCard(current);
    applyFilter();
  });

  // ---- label clicks -----------------------------------------------------
  function wireLabel(entry) {
    entry.labelEl.addEventListener('click', (e) => {
      e.stopPropagation();
      openCard(entry);
      focusOn(entry, true);
    });
  }
  world.buildings.forEach(wireLabel);

  // ---- sidebar ----------------------------------------------------------
  document.querySelectorAll('.side-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.side-btn').forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      view = btn.dataset.view;
      applyFilter();
    });
  });

  // ---- search -----------------------------------------------------------
  searchInput.addEventListener('input', () => {
    query = searchInput.value.trim().toLowerCase();
    searchClear.hidden = !query;
    applyFilter();
  });
  searchClear.addEventListener('click', () => {
    searchInput.value = ''; query = ''; searchClear.hidden = true; applyFilter();
  });

  // ---- add modal --------------------------------------------------------
  const addModal = $('#add-modal');
  const addForm = addModal.querySelector('form');
  const ratingRange = addForm.querySelector('input[name=rating]');
  const ratingOut = addForm.querySelector('.rating-out');
  ratingRange.addEventListener('input', () => { ratingOut.textContent = (+ratingRange.value).toFixed(1); });

  const openAdd = () => { addModal.hidden = false; addForm.name.focus(); };
  const closeAdd = () => { addModal.hidden = true; addForm.reset(); ratingOut.textContent = '4.5'; };
  $('#add-btn').addEventListener('click', openAdd);
  addModal.addEventListener('click', (e) => { if (e.target === addModal) closeAdd(); });
  addModal.querySelector('[data-close]').addEventListener('click', closeAdd);

  addForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = new FormData(addForm);
    const restaurant = {
      id: makeId(),
      name: (data.get('name') || 'Senza nome').toString().trim(),
      category: data.get('category'),
      city: (data.get('city') || '').toString().trim(),
      price: data.get('price'),
      rating: parseFloat(data.get('rating')),
      notes: (data.get('notes') || '').toString().trim(),
    };
    closeAdd();
    const entry = await world.addRestaurantAuto(restaurant);
    if (entry) {
      wireLabel(entry);
      applyFilter();
      openCard(entry);
      focusOn(entry, true);
    }
  });

  // Esc closes overlays
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeAdd(); closeCard(); }
  });

  applyFilter();
  return { openCard, closeCard, applyFilter };
}
