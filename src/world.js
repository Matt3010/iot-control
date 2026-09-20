import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { instantiate } from './assets.js';
import { CATEGORIES } from './data.js';

const COLS = 24;
const ROWS = 24;
const TILE = 1;
const STEP = 0.5;          // elevation quantum (Kenney terrain uses 0.5)
const BODY = 1.5;          // solid cliff depth under the top surface

// Kenney Space Kit palette (extracted from the models' materials)
const C_ROCK_TOP = 0xe88463;
const C_ROCK_SIDE = 0xb25f43;
const C_ROCK_DEEP = 0x8a4832;

const ROCKS = ['rock', 'rock_largeA', 'rock_largeB', 'rocks_smallA', 'rocks_smallB', 'rock_crystals'];
const CRATERS = ['crater', 'craterLarge'];
const METEORS = ['meteor', 'meteor_detailed', 'meteor_half'];
const PEOPLE = ['astronautA', 'astronautB', 'alien'];

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class World {
  constructor(scene) {
    this.scene = scene;
    this.rng = mulberry32(24601);
    this.buildings = [];
    this.people = [];
    this.spinners = [];   // props that rotate/bob each frame
    this.usedCells = new Set();
    this.heights = [];
  }

  key(c, r) { return c + ',' + r; }

  cellToWorld(c, r) {
    return new THREE.Vector3((c - COLS / 2 + 0.5) * TILE, 0, (r - ROWS / 2 + 0.5) * TILE);
  }

  // ---- island silhouette ------------------------------------------------
  generateIsland() {
    const cx = COLS / 2, cy = ROWS / 2;
    const maxR = Math.min(COLS, ROWS) / 2;
    this.landMask = [];
    this.landCells = [];
    for (let c = 0; c < COLS; c++) {
      this.landMask[c] = [];
      for (let r = 0; r < ROWS; r++) {
        const nx = (c - cx) / maxR, nz = (r - cy) / maxR;
        const dist = Math.sqrt(nx * nx + nz * nz);
        const n =
          0.16 * Math.sin(c * 0.7 + 1.1) * Math.cos(r * 0.66) +
          0.11 * Math.sin((c + r) * 0.4) +
          0.08 * Math.cos(c * 0.3 - r * 0.42);
        const land = dist < 0.86 + n;
        this.landMask[c][r] = land;
        if (land) this.landCells.push([c, r]);
      }
    }
    // island centroid, for the tapered floating keel
    this.centroid = new THREE.Vector3();
    for (const [c, r] of this.landCells) this.centroid.add(this.cellToWorld(c, r));
    this.centroid.multiplyScalar(1 / this.landCells.length);
  }

  isLand(c, r) {
    return c >= 0 && r >= 0 && c < COLS && r < ROWS && this.landMask[c] && this.landMask[c][r];
  }

  // ---- height field (broad terraced plateaus) ---------------------------
  computeHeights() {
    const cx = COLS / 2, cy = ROWS / 2;
    const maxR = Math.min(COLS, ROWS) / 2;
    // 1. low-frequency continuous field (big, smooth features)
    const field = [];
    for (let c = 0; c < COLS; c++) {
      field[c] = [];
      for (let r = 0; r < ROWS; r++) {
        const nx = (c - cx) / maxR, nz = (r - cy) / maxR;
        const dist = Math.sqrt(nx * nx + nz * nz);
        const n = 0.5 + 0.5 * (
          0.6 * Math.sin(c * 0.34 + 0.5) * Math.cos(r * 0.31 - 0.6) +
          0.4 * Math.sin((c * 0.2 + r * 0.24) + 1.7)
        );
        const radial = Math.max(0, 1 - dist * 1.05); // gentle central dome
        field[c][r] = 0.45 * n + 0.72 * radial;
      }
    }
    // 2. smooth twice so plateaus are wide and single-cell spikes vanish
    for (let pass = 0; pass < 2; pass++) {
      const src = field.map((col) => col.slice());
      for (let c = 0; c < COLS; c++)
        for (let r = 0; r < ROWS; r++) {
          let sum = 0, cnt = 0;
          for (let dc = -1; dc <= 1; dc++)
            for (let dr = -1; dr <= 1; dr++) {
              const nc = c + dc, nr = r + dr;
              if (nc >= 0 && nr >= 0 && nc < COLS && nr < ROWS) { sum += src[nc][nr]; cnt++; }
            }
          field[c][r] = sum / cnt;
        }
    }
    // 3. quantise to a few clean terraces
    for (let c = 0; c < COLS; c++) {
      this.heights[c] = [];
      for (let r = 0; r < ROWS; r++) {
        let h = Math.round((field[c][r] * 1.9) / STEP) * STEP;
        this.heights[c][r] = Math.max(0, Math.min(h, 1.5));
      }
    }
  }

  heightAt(c, r) {
    return (this.heights[c] && this.heights[c][r] != null) ? this.heights[c][r] : 0;
  }

  // flatten a plaza around building cells so structures sit level
  flattenAround(cells, radius = 1) {
    for (const [c, r] of cells) {
      const h = this.heightAt(c, r);
      for (let dc = -radius; dc <= radius; dc++)
        for (let dr = -radius; dr <= radius; dr++)
          if (this.isLand(c + dc, r + dr)) this.heights[c + dc][r + dr] = h;
    }
  }

  // ---- terrain mesh -----------------------------------------------------
  buildTerrain() {
    const geo = new THREE.BoxGeometry(TILE, 1, TILE);
    const top = new THREE.MeshStandardMaterial({ color: C_ROCK_TOP, roughness: 1, flatShading: true });
    const side = new THREE.MeshStandardMaterial({ color: C_ROCK_SIDE, roughness: 1, flatShading: true });
    const deep = new THREE.MeshStandardMaterial({ color: C_ROCK_DEEP, roughness: 1, flatShading: true });
    const mats = [side, side, top, deep, side, side]; // +x,-x,+y,-y,+z,-z

    const count = this.landCells.length;
    const mesh = new THREE.InstancedMesh(geo, mats, count);
    mesh.castShadow = true; mesh.receiveShadow = true;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const col = new THREE.Color();
    this.landCells.forEach(([c, r], i) => {
      const h = this.heightAt(c, r);
      const yTop = h, yBot = -BODY;
      const height = yTop - yBot;
      const w = this.cellToWorld(c, r);
      p.set(w.x, (yTop + yBot) / 2, w.z);
      s.set(TILE, height, TILE);
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
      const v = 0.92 + this.rng() * 0.12;
      col.setRGB(v, v, v);
      mesh.setColorAt(i, col);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    this.scene.add(mesh);

    this.buildKeel(geo);
  }

  // tapered dark underside so the island reads as a floating chunk
  buildKeel(geo) {
    const layers = [
      { f: 0.9, y: -BODY - 0.6, c: 0x7a3f2c },
      { f: 0.72, y: -BODY - 1.6, c: 0x5e3324 },
      { f: 0.5, y: -BODY - 2.7, c: 0x45261b },
      { f: 0.26, y: -BODY - 3.7, c: 0x341c14 },
    ];
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    for (const L of layers) {
      const mat = new THREE.MeshStandardMaterial({ color: L.c, roughness: 1, flatShading: true });
      const mesh = new THREE.InstancedMesh(geo, mat, this.landCells.length);
      mesh.castShadow = true;
      this.landCells.forEach(([c, r], i) => {
        const w = this.cellToWorld(c, r);
        p.set(
          this.centroid.x + (w.x - this.centroid.x) * L.f,
          L.y,
          this.centroid.z + (w.z - this.centroid.z) * L.f,
        );
        s.set(TILE * L.f * 1.02, 1.1, TILE * L.f * 1.02);
        m.compose(p, q, s);
        mesh.setMatrixAt(i, m);
      });
      mesh.instanceMatrix.needsUpdate = true;
      this.scene.add(mesh);
    }
  }

  // ---- placement helpers ------------------------------------------------
  hasMargin(c, r) {
    return this.isLand(c + 1, r) && this.isLand(c - 1, r) && this.isLand(c, r + 1) && this.isLand(c, r - 1);
  }

  freeLandNear(c, r, radius = 5) {
    let best = null, bestD = Infinity;
    for (let dc = -radius; dc <= radius; dc++)
      for (let dr = -radius; dr <= radius; dr++) {
        const nc = c + dc, nr = r + dr;
        if (!this.isLand(nc, nr) || this.usedCells.has(this.key(nc, nr)) || !this.hasMargin(nc, nr)) continue;
        const d = dc * dc + dr * dr;
        if (d < bestD) { bestD = d; best = [nc, nr]; }
      }
    return best;
  }

  pickSpreadCells(n) {
    const cx = COLS / 2, cy = ROWS / 2;
    const maxR = Math.min(COLS, ROWS) / 2;
    const golden = Math.PI * (3 - Math.sqrt(5));
    const cells = [];
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const radius = maxR * (0.26 + 0.52 * Math.sqrt(t));
      const angle = i * golden;
      const c = Math.round(cx + Math.cos(angle) * radius);
      const r = Math.round(cy + Math.sin(angle) * radius);
      const cell = this.freeLandNear(c, r, 7);
      if (cell) {
        cells.push(cell);
        for (let dc = -1; dc <= 1; dc++)
          for (let dr = -1; dr <= 1; dr++)
            this.usedCells.add(this.key(cell[0] + dc, cell[1] + dr));
      }
    }
    return cells;
  }

  // ---- restaurants (space structures) -----------------------------------
  async placeRestaurants(restaurants, cells) {
    for (let i = 0; i < restaurants.length; i++) {
      const cell = cells[i] || this.freeLandNear(COLS / 2, ROWS / 2, 12);
      if (cell) await this.addRestaurant(restaurants[i], cell);
    }
  }

  async addRestaurant(restaurant, cell) {
    const cat = CATEGORIES[restaurant.category] || CATEGORIES.trattoria;
    const w = this.cellToWorld(cell[0], cell[1]);
    const y = this.heightAt(cell[0], cell[1]);

    const group = new THREE.Group();
    group.position.set(w.x, y, w.z);
    group.rotation.y = Math.floor(this.rng() * 4) * (Math.PI / 2);

    const building = await instantiate(`space/${cat.building}`, { targetSize: 1.7 });
    building.traverse((o) => { if (o.isMesh) o.userData.restaurantRoot = group; });
    group.add(building);
    const bh = building.userData.baseHeight || 1.4;

    // small themed prop that slowly spins beside the structure
    const prop = await instantiate(`space/${cat.prop}`, { targetSize: 0.55 });
    prop.position.set(0.95, 0.05, 0.75);
    group.add(prop);
    this.spinners.push({ obj: prop, spin: 0.6, bob: 0.05, base: 0.05, phase: this.rng() * 6 });

    // floating label
    const el = document.createElement('div');
    el.className = 'tag';
    el.style.setProperty('--cat', cat.color);
    el.innerHTML = `<span class="dot" style="background:${cat.color}"></span><span class="tag-name">${restaurant.name}</span>`;
    el.dataset.id = restaurant.id;
    const label = new CSS2DObject(el);
    label.position.set(0, bh + 0.7, 0);
    group.add(label);

    this.scene.add(group);
    const entry = { restaurant, group, cell, label, labelEl: el, cat, prop };
    group.userData.entry = entry;
    this.buildings.push(entry);
    return entry;
  }

  findFreeCell() {
    const candidates = this.landCells.filter(([c, r]) =>
      !this.usedCells.has(this.key(c, r)) && this.hasMargin(c, r));
    if (!candidates.length) return null;
    let best = null, bestScore = -1;
    for (const cell of candidates) {
      let dmin = Infinity;
      for (const b of this.buildings) {
        const dc = cell[0] - b.cell[0], dr = cell[1] - b.cell[1];
        dmin = Math.min(dmin, dc * dc + dr * dr);
      }
      if (dmin > bestScore) { bestScore = dmin; best = cell; }
    }
    return best;
  }

  async addRestaurantAuto(restaurant) {
    const cell = this.findFreeCell() || this.freeLandNear(COLS / 2, ROWS / 2, 12);
    if (!cell) return null;
    this.flattenAround([cell]);
    for (let dc = -1; dc <= 1; dc++)
      for (let dr = -1; dr <= 1; dr++)
        this.usedCells.add(this.key(cell[0] + dc, cell[1] + dr));
    return this.addRestaurant(restaurant, cell);
  }

  // hero rocket centrepiece, stacked from Space Kit parts
  async addRocket() {
    const cell = this.freeLandNear(Math.round(COLS / 2), Math.round(ROWS / 2), 6);
    if (!cell) return;
    const [c, r] = cell;
    for (let dc = -2; dc <= 2; dc++)
      for (let dr = -2; dr <= 2; dr++)
        this.usedCells.add(this.key(c + dc, r + dr));
    // level the launch pad
    this.flattenAround([[c, r]], 2);
    const w = this.cellToWorld(c, r);
    const grp = new THREE.Group();
    grp.position.set(w.x, this.heightAt(c, r), w.z);

    const size = 1.7;
    const stack = ['rocket_baseA', 'rocket_fuelA', 'rocket_topA'];
    let yy = 0;
    for (const part of stack) {
      const m = await instantiate(`space/${part}`, { targetSize: size });
      m.position.y = yy;
      grp.add(m);
      yy += (m.userData.baseHeight || 0.9) * 0.86;
    }
    const fins = await instantiate('space/rocket_finsA', { targetSize: size });
    grp.add(fins);
    this.scene.add(grp);
    this.rocketTop = grp.position.y + yy;
  }

  // ---- decoration (rocks, craters, meteors, hero props) -----------------
  async scatterDecor(density = 0.14) {
    const jobs = [];
    for (const [c, r] of this.landCells) {
      if (this.usedCells.has(this.key(c, r)) || !this.hasMargin(c, r)) continue;
      if (this.rng() > density) continue;
      this.usedCells.add(this.key(c, r));
      const roll = this.rng();
      let name, size;
      if (roll < 0.55) { name = ROCKS[Math.floor(this.rng() * ROCKS.length)]; size = 0.4 + this.rng() * 0.5; }
      else if (roll < 0.8) { name = CRATERS[Math.floor(this.rng() * CRATERS.length)]; size = 0.6 + this.rng() * 0.5; }
      else { name = METEORS[Math.floor(this.rng() * METEORS.length)]; size = 0.5 + this.rng() * 0.4; }
      jobs.push(this.plop(`space/${name}`, c, r, size));
    }
    await Promise.all(jobs);
  }

  async plop(path, c, r, size, { spin = false } = {}) {
    const g = await instantiate(path, { targetSize: size });
    const w = this.cellToWorld(c, r);
    g.position.set(w.x + (this.rng() - 0.5) * 0.4, this.heightAt(c, r), w.z + (this.rng() - 0.5) * 0.4);
    g.rotation.y = this.rng() * Math.PI * 2;
    this.scene.add(g);
    return g;
  }

  // a few standalone hero props to enrich the diorama
  async addHeroProps() {
    const spread = this.landCells.filter(([c, r]) => this.usedCells.has(this.key(c, r)) === false && this.hasMargin(c, r));
    const pick = () => spread.splice(Math.floor(this.rng() * spread.length), 1)[0];
    const heroes = [
      { name: 'satelliteDish_large', size: 1.1, spin: 0.25 },
      { name: 'satelliteDish_detailed', size: 0.9, spin: 0.3 },
      { name: 'craft_speederB', size: 1.0, hover: true },
      { name: 'craft_cargoA', size: 1.2, hover: true },
      { name: 'craft_miner', size: 1.0, hover: true },
      { name: 'rover', size: 0.7 },
      { name: 'turret_double', size: 0.7 },
      { name: 'machine_barrel', size: 0.7 },
    ];
    for (const h of heroes) {
      const cell = pick();
      if (!cell) break;
      const [c, r] = cell;
      this.usedCells.add(this.key(c, r));
      const g = await instantiate(`space/${h.name}`, { targetSize: h.size });
      const w = this.cellToWorld(c, r);
      const baseY = this.heightAt(c, r) + (h.hover ? 0.9 : 0);
      g.position.set(w.x, baseY, w.z);
      g.rotation.y = this.rng() * Math.PI * 2;
      this.scene.add(g);
      if (h.spin) this.spinners.push({ obj: g, spin: h.spin, bob: 0, base: baseY, phase: 0 });
      if (h.hover) this.spinners.push({ obj: g, spin: 0.15, bob: 0.18, base: baseY, phase: this.rng() * 6 });
    }
  }

  // ---- modular network: monorail, pipes, corridors, roads ---------------
  async placePiece(path, x, y, z, rotY = 0, scaleY = 1) {
    const g = await instantiate(`space/${path}`, { native: true });
    g.position.set(x, y, z);
    g.rotation.y = rotY;
    if (scaleY !== 1) g.scale.y = scaleY;
    this.scene.add(g);
    return g;
  }

  lineCells(c0, r0, dir, len) {
    const out = [];
    for (let i = 0; i < len; i++) out.push(dir === 'x' ? [c0 + i, r0] : [c0, r0 + i]);
    return out;
  }

  reserve(cells) { for (const [c, r] of cells) this.usedCells.add(this.key(c, r)); }

  // an elevated monorail line on support pillars, with a train
  async buildMonorail(c0, r0, dir, len) {
    const rot = dir === 'x' ? Math.PI / 2 : 0;
    const cells = this.lineCells(c0, r0, dir, len).filter(([c, r]) => this.isLand(c, r));
    if (cells.length < 3) return;
    let maxH = 0;
    for (const [c, r] of cells) maxH = Math.max(maxH, this.heightAt(c, r));
    const railY = maxH + 1.7;
    for (const [c, r] of cells) {
      const w = this.cellToWorld(c, r);
      const th = this.heightAt(c, r);
      const sup = await instantiate('space/monorail_trackSupport', { native: true });
      sup.position.set(w.x, th, w.z);
      sup.scale.y = Math.max(0.3, (railY - th) / 0.5);
      sup.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      this.scene.add(sup);
      await this.placePiece('monorail_trackStraight', w.x, railY, w.z, rot);
    }
    const cars = ['monorail_trainFront', 'monorail_trainPassenger', 'monorail_trainCargo', 'monorail_trainEnd'];
    const start = Math.max(0, Math.floor(cells.length * 0.12));
    for (let i = 0; i < cars.length; i++) {
      const cell = cells[start + i];
      if (!cell) break;
      const w = this.cellToWorld(cell[0], cell[1]);
      const car = await this.placePiece(cars[i], w.x, railY + 0.13, w.z, rot);
      car.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    }
  }

  // a straight run of pipe on low supports, capped at both ends
  async buildPipe(c0, r0, dir, len) {
    const rot = dir === 'x' ? Math.PI / 2 : 0;
    const cells = this.lineCells(c0, r0, dir, len).filter(([c, r]) => this.isLand(c, r));
    if (cells.length < 2) return;
    this.reserve(cells);
    for (let i = 0; i < cells.length; i++) {
      const [c, r] = cells[i];
      const w = this.cellToWorld(c, r);
      const th = this.heightAt(c, r);
      const sup = await instantiate('space/pipe_supportLow', { native: true });
      sup.position.set(w.x, th, w.z); this.scene.add(sup);
      const y = th + 0.5;
      if (i === 0) await this.placePiece('pipe_end', w.x, y, w.z, rot + Math.PI);
      else if (i === cells.length - 1) await this.placePiece('pipe_end', w.x, y, w.z, rot);
      else await this.placePiece('pipe_straight', w.x, y, w.z, rot);
    }
  }

  // an enclosed corridor connecting two spots
  async buildCorridor(c0, r0, dir, len) {
    const rot = dir === 'x' ? Math.PI / 2 : 0;
    const cells = this.lineCells(c0, r0, dir, len).filter(([c, r]) => this.isLand(c, r));
    if (cells.length < 2) return;
    this.reserve(cells);
    for (let i = 0; i < cells.length; i++) {
      const [c, r] = cells[i];
      const w = this.cellToWorld(c, r);
      const th = this.heightAt(c, r);
      const path = (i === 0 || i === cells.length - 1) ? 'corridor_end' : 'corridor';
      const g = await this.placePiece(path, w.x, th, w.z, i === 0 ? rot + Math.PI : rot);
      g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    }
  }

  // find a straight flat run of free land cells (same height)
  findFlatRun(dir, len) {
    const order = this.landCells.slice().sort(() => this.rng() - 0.5);
    for (const [c0, r0] of order) {
      const cells = this.lineCells(c0, r0, dir, len);
      const h0 = this.heightAt(c0, r0);
      let ok = true;
      for (const [c, r] of cells) {
        if (!this.isLand(c, r) || this.usedCells.has(this.key(c, r)) || this.heightAt(c, r) !== h0 || !this.hasMargin(c, r)) { ok = false; break; }
      }
      if (ok) return [c0, r0];
    }
    return null;
  }

  // flat road/track tiles laid on the surface for detail
  async scatterRoads(count = 26) {
    let placed = 0;
    const order = this.landCells.slice().sort(() => this.rng() - 0.5);
    for (const [c, r] of order) {
      if (placed >= count) break;
      if (this.usedCells.has(this.key(c, r)) || !this.hasMargin(c, r)) continue;
      // orient toward a same-height neighbour
      const h = this.heightAt(c, r);
      const nz = this.isLand(c, r + 1) && this.heightAt(c, r + 1) === h;
      const nx = this.isLand(c + 1, r) && this.heightAt(c + 1, r) === h;
      if (!nz && !nx) continue;
      const rot = nx && !nz ? Math.PI / 2 : 0;
      const w = this.cellToWorld(c, r);
      const road = await this.placePiece('terrain_roadStraight', w.x, h + 0.02, w.z, rot);
      road.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
      placed++;
    }
  }

  async buildNetwork() {
    // a long monorail crossing the colony
    await this.buildMonorail(3, Math.round(ROWS * 0.32), 'x', COLS - 6);
    // a couple of pipe runs on flat ground
    let run = this.findFlatRun('z', 5); if (run) await this.buildPipe(run[0], run[1], 'z', 5);
    run = this.findFlatRun('x', 5); if (run) await this.buildPipe(run[0], run[1], 'x', 5);
    // a short corridor link
    run = this.findFlatRun('x', 3); if (run) await this.buildCorridor(run[0], run[1], 'x', 3);
    // surface tracks
    await this.scatterRoads(26);
  }

  // ---- astronauts wandering the colony ----------------------------------
  async addPeople(n) {
    const spots = this.landCells.filter(([c, r]) => this.hasMargin(c, r) && !this.usedCells.has(this.key(c, r)));
    for (let i = 0; i < n; i++) {
      const cell = spots[Math.floor(this.rng() * spots.length)];
      if (!cell) break;
      const name = PEOPLE[Math.floor(this.rng() * PEOPLE.length)];
      const g = await instantiate(`space/${name}`, { targetHeight: 0.85 });
      const [c, r] = cell;
      const w = this.cellToWorld(c, r);
      g.position.set(w.x, this.heightAt(c, r), w.z);
      this.scene.add(g);
      this.people.push({ obj: g, c, r, t: 1, from: g.position.clone(), to: g.position.clone(), facing: 0, dur: 0.5 });
    }
  }

  stepPerson(pr, dt) {
    pr.t += dt / pr.dur;
    if (pr.t >= 1) {
      pr.t = 0;
      // choose a walkable neighbour
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]].sort(() => this.rng() - 0.5);
      let picked = null;
      for (const [dc, dr] of dirs) {
        const nc = pr.c + dc, nr = pr.r + dr;
        if (this.isLand(nc, nr) && this.hasMargin(nc, nr)) { picked = [nc, nr, dc, dr]; break; }
      }
      if (!picked) { pr.t = 1; return; }
      const [nc, nr, dc, dr] = picked;
      pr.from.copy(pr.obj.position);
      const w = this.cellToWorld(nc, nr);
      pr.to.set(w.x, this.heightAt(nc, nr), w.z);
      pr.facing = Math.atan2(dc, dr);
      pr.c = nc; pr.r = nr;
    }
    const k = pr.t;
    pr.obj.position.lerpVectors(pr.from, pr.to, k);
    pr.obj.position.y += Math.sin(Math.PI * k) * 0.14; // hop arc
    // smooth turn toward facing
    let a = pr.obj.rotation.y, d = pr.facing - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    pr.obj.rotation.y = a + d * Math.min(1, dt * 12);
  }

  // ---- per-frame --------------------------------------------------------
  update(t, dt) {
    for (const s of this.spinners) {
      s.obj.rotation.y = t * s.spin + s.phase;
      if (s.bob) s.obj.position.y = s.base + Math.sin(t * 1.4 + s.phase) * s.bob;
    }
    for (const pr of this.people) this.stepPerson(pr, dt);
  }
}

export { COLS, ROWS, TILE };
