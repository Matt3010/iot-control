import express from 'express';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8080);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'places.json');
const DIST_DIR = path.join(__dirname, '..', 'dist');

const DEFAULT_STATE = { categories: [], places: [] };

// Serialized read-modify-write so concurrent requests cannot clobber the file.
let queue = Promise.resolve();
const withState = (fn) => {
  const next = queue.then(async () => {
    const state = await readState();
    const { result, state: updated } = await fn(state);
    if (updated) await writeState(updated);
    return result;
  });
  queue = next.catch(() => {});
  return next;
};

async function readState() {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      categories: Array.isArray(parsed.categories) ? parsed.categories : [],
      places: Array.isArray(parsed.places) ? parsed.places : [],
    };
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    await writeState(DEFAULT_STATE);
    return structuredClone(DEFAULT_STATE);
  }
}

async function writeState(state) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = `${DATA_FILE}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(state, null, 2), 'utf8');
  await fs.rename(tmp, DATA_FILE);
}

const str = (value, max) => String(value ?? '').trim().slice(0, max);
const isLat = (n) => Number.isFinite(n) && n >= -90 && n <= 90;
const isLng = (n) => Number.isFinite(n) && n >= -180 && n <= 180;
const isColor = (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);

const app = express();
app.use(express.json({ limit: '128kb' }));

const wrap = (handler) => (req, res, next) => Promise.resolve(handler(req, res)).catch(next);

app.get('/api/state', wrap(async (_req, res) => {
  res.json(await withState((state) => ({ result: state })));
}));

app.post('/api/categories', wrap(async (req, res) => {
  const name = str(req.body?.name, 40);
  const emoji = str(req.body?.emoji, 8) || '📍';
  const color = isColor(req.body?.color) ? req.body.color : '#2274a5';
  if (!name) return res.status(400).json({ error: 'name richiesto' });

  const category = { id: `cat-${randomUUID()}`, name, emoji, color };
  await withState((state) => ({
    result: null,
    state: { ...state, categories: [...state.categories, category] },
  }));
  res.status(201).json(category);
}));

app.put('/api/categories/:id', wrap(async (req, res) => {
  const patch = {};
  if (req.body?.name !== undefined) patch.name = str(req.body.name, 40);
  if (req.body?.emoji !== undefined) patch.emoji = str(req.body.emoji, 8) || '📍';
  if (isColor(req.body?.color)) patch.color = req.body.color;

  const updated = await withState((state) => {
    const category = state.categories.find((c) => c.id === req.params.id);
    if (!category) return { result: null };
    const merged = { ...category, ...patch };
    if (!merged.name) return { result: null };
    return {
      result: merged,
      state: { ...state, categories: state.categories.map((c) => (c.id === merged.id ? merged : c)) },
    };
  });
  if (!updated) return res.status(404).json({ error: 'categoria inesistente' });
  res.json(updated);
}));

app.delete('/api/categories/:id', wrap(async (req, res) => {
  // Deleting a category also deletes the places that belong to it.
  const found = await withState((state) => {
    if (!state.categories.some((c) => c.id === req.params.id)) return { result: false };
    return {
      result: true,
      state: {
        categories: state.categories.filter((c) => c.id !== req.params.id),
        places: state.places.filter((p) => p.categoryId !== req.params.id),
      },
    };
  });
  if (!found) return res.status(404).json({ error: 'categoria inesistente' });
  res.status(204).end();
}));

app.post('/api/places', wrap(async (req, res) => {
  const name = str(req.body?.name, 80);
  const note = str(req.body?.note, 500);
  const lat = Number(req.body?.lat);
  const lng = Number(req.body?.lng);
  const categoryId = str(req.body?.categoryId, 80);
  if (!name) return res.status(400).json({ error: 'name richiesto' });
  if (!isLat(lat) || !isLng(lng)) return res.status(400).json({ error: 'coordinate non valide' });

  const place = {
    id: `p-${randomUUID()}`,
    name,
    categoryId,
    lat,
    lng,
    note,
    createdAt: new Date().toISOString(),
  };
  const ok = await withState((state) => {
    if (!state.categories.some((c) => c.id === categoryId)) return { result: false };
    return { result: true, state: { ...state, places: [...state.places, place] } };
  });
  if (!ok) return res.status(400).json({ error: 'categoria inesistente' });
  res.status(201).json(place);
}));

app.put('/api/places/:id', wrap(async (req, res) => {
  const patch = {};
  if (req.body?.name !== undefined) patch.name = str(req.body.name, 80);
  if (req.body?.note !== undefined) patch.note = str(req.body.note, 500);
  if (req.body?.categoryId !== undefined) patch.categoryId = str(req.body.categoryId, 80);
  if (req.body?.lat !== undefined && isLat(Number(req.body.lat))) patch.lat = Number(req.body.lat);
  if (req.body?.lng !== undefined && isLng(Number(req.body.lng))) patch.lng = Number(req.body.lng);

  const result = await withState((state) => {
    const place = state.places.find((p) => p.id === req.params.id);
    if (!place) return { result: { code: 404 } };
    const merged = { ...place, ...patch };
    if (!merged.name) return { result: { code: 400 } };
    if (!state.categories.some((c) => c.id === merged.categoryId)) return { result: { code: 400 } };
    return {
      result: { code: 200, place: merged },
      state: { ...state, places: state.places.map((p) => (p.id === merged.id ? merged : p)) },
    };
  });
  if (result.code !== 200) return res.status(result.code).json({ error: 'richiesta non valida' });
  res.json(result.place);
}));

app.delete('/api/places/:id', wrap(async (req, res) => {
  const found = await withState((state) => {
    if (!state.places.some((p) => p.id === req.params.id)) return { result: false };
    return { result: true, state: { ...state, places: state.places.filter((p) => p.id !== req.params.id) } };
  });
  if (!found) return res.status(404).json({ error: 'posto inesistente' });
  res.status(204).end();
}));

// Static build, served by the same process so a single container is enough.
app.use(express.static(DIST_DIR, { index: 'index.html' }));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(DIST_DIR, 'index.html'), (err) => (err ? next() : undefined));
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'errore interno' });
});

app.listen(PORT, () => {
  console.log(`place-index in ascolto su http://localhost:${PORT} (dati in ${DATA_FILE})`);
});
