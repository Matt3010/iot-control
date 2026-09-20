import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { instantiate } from './assets.js';
import { CATEGORIES } from './data.js';

const COLS = 26;
const ROWS = 26;
const TILE = 1;
const TILE_H = 0.9;      // grass cube height
const WATER_Y = -0.24;   // waterline

const TREES = ['tree_blocks', 'tree_blocks_dark', 'tree_cone', 'tree_default', 'tree_pineRoundA', 'tree_blocks_fall'];
const DECO = ['flower_redA', 'flower_yellowA', 'flower_purpleA', 'mushroom_red', 'grass', 'grass_large'];

// Small deterministic PRNG so the island looks the same every load.
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
    this.rng = mulberry32(1337);
    this.buildings = [];   // { restaurant, group, cell, label, labelEl, foodTotem }
    this.water = null;
    this.landMask = [];
    this.usedCells = new Set();
  }

  key(c, r) { return c + ',' + r; }

  cellToWorld(c, r) {
    return new THREE.Vector3(
      (c - COLS / 2 + 0.5) * TILE,
      0,
      (r - ROWS / 2 + 0.5) * TILE,
    );
  }

  // ---- island shape -----------------------------------------------------
  generateIsland() {
    const cx = COLS / 2, cy = ROWS / 2;
    const maxR = Math.min(COLS, ROWS) / 2;
    this.landMask = [];
    this.landCells = [];
    for (let c = 0; c < COLS; c++) {
      this.landMask[c] = [];
      for (let r = 0; r < ROWS; r++) {
        const nx = (c - cx) / maxR;
        const nz = (r - cy) / maxR;
        const dist = Math.sqrt(nx * nx + nz * nz);
        // layered pseudo-noise to break the circle into an organic blob
        const n =
          0.16 * Math.sin(c * 0.75 + 1.3) * Math.cos(r * 0.7) +
          0.12 * Math.sin((c + r) * 0.45) +
          0.08 * Math.cos(c * 0.33 - r * 0.4);
        const land = dist < 0.82 + n;
        this.landMask[c][r] = land;
        if (land) this.landCells.push([c, r]);
      }
    }
  }

  isLand(c, r) {
    return c >= 0 && r >= 0 && c < COLS && r < ROWS && this.landMask[c] && this.landMask[c][r];
  }

  // ---- terrain mesh -----------------------------------------------------
  buildTerrain() {
    const geo = new THREE.BoxGeometry(TILE, TILE_H, TILE);
    const grass = new THREE.MeshStandardMaterial({ color: 0x7bc24a, roughness: 0.95 });
    const dirt = new THREE.MeshStandardMaterial({ color: 0x9a6b41, roughness: 1 });
    const dirtDark = new THREE.MeshStandardMaterial({ color: 0x6f4a2a, roughness: 1 });
    // BoxGeometry group order: +x,-x,+y,-y,+z,-z
    const mats = [dirt, dirt, grass, dirtDark, dirt, dirt];

    const count = this.landCells.length;
    const mesh = new THREE.InstancedMesh(geo, mats, count);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const m = new THREE.Matrix4();
    const color = new THREE.Color();
    this.landCells.forEach(([c, r], i) => {
      const p = this.cellToWorld(c, r);
      m.makeTranslation(p.x, -TILE_H / 2, p.z);
      mesh.setMatrixAt(i, m);
      const v = 0.9 + this.rng() * 0.12;
      color.setRGB(v, v, v);
      mesh.setColorAt(i, color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    this.scene.add(mesh);
    this.terrain = mesh;
  }

  // ---- water ------------------------------------------------------------
  buildWater() {
    const size = Math.max(COLS, ROWS) * TILE * 3.2;
    const seg = 64;
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x3fb0e6,
      roughness: 0.25,
      metalness: 0.0,
      flatShading: true,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = WATER_Y;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.water = mesh;
    this.waterBase = geo.attributes.position.array.slice();
  }

  updateWater(t) {
    if (!this.water) return;
    const pos = this.water.geometry.attributes.position;
    const base = this.waterBase;
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3];
      const z = base[i * 3 + 2];
      const y = Math.sin(x * 0.25 + t * 0.9) * 0.09 + Math.cos(z * 0.3 + t * 0.7) * 0.07;
      pos.array[i * 3 + 1] = y;
    }
    pos.needsUpdate = true;
    this.water.geometry.computeVertexNormals();
  }

  // ---- placement helpers ------------------------------------------------
  freeLandNear(c, r, radius = 4) {
    let best = null, bestD = Infinity;
    for (let dc = -radius; dc <= radius; dc++) {
      for (let dr = -radius; dr <= radius; dr++) {
        const nc = c + dc, nr = r + dr;
        if (!this.isLand(nc, nr) || this.usedCells.has(this.key(nc, nr))) continue;
        // keep a 1-cell margin from the coast so buildings don't hang over water
        if (!this.isLand(nc + 1, nr) || !this.isLand(nc - 1, nr) || !this.isLand(nc, nr + 1) || !this.isLand(nc, nr - 1)) continue;
        const d = dc * dc + dr * dr;
        if (d < bestD) { bestD = d; best = [nc, nr]; }
      }
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
      const radius = maxR * (0.28 + 0.5 * Math.sqrt(t));
      const angle = i * golden;
      const c = Math.round(cx + Math.cos(angle) * radius);
      const r = Math.round(cy + Math.sin(angle) * radius);
      const cell = this.freeLandNear(c, r, 6);
      if (cell) {
        cells.push(cell);
        // block a small neighbourhood so buildings don't crowd
        for (let dc = -1; dc <= 1; dc++)
          for (let dr = -1; dr <= 1; dr++)
            this.usedCells.add(this.key(cell[0] + dc, cell[1] + dr));
      }
    }
    return cells;
  }

  // ---- restaurants ------------------------------------------------------
  async placeRestaurants(restaurants) {
    const cells = this.pickSpreadCells(restaurants.length);
    for (let i = 0; i < restaurants.length; i++) {
      const cell = cells[i] || this.freeLandNear(COLS / 2, ROWS / 2, 12);
      if (!cell) continue;
      await this.addRestaurant(restaurants[i], cell);
    }
  }

  async addRestaurant(restaurant, cell) {
    const cat = CATEGORIES[restaurant.category] || CATEGORIES.trattoria;
    const pos = this.cellToWorld(cell[0], cell[1]);

    const group = new THREE.Group();
    group.position.copy(pos);
    group.rotation.y = (Math.floor(this.rng() * 4)) * (Math.PI / 2);

    const building = await instantiate(`buildings/${cat.building}`, { targetSize: 1.6 });
    building.traverse((o) => { if (o.isMesh) o.userData.restaurantRoot = group; });
    group.add(building);
    const bh = building.userData.baseHeight || 1.4;

    // a small food "totem" floating beside the building
    const food = await instantiate(`food/${cat.food}`, { targetSize: 0.5 });
    food.position.set(0.7, 0.15, 0.6);
    group.add(food);

    // clickable base pad in the category colour
    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(0.95, 0.95, 0.12, 24),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(cat.color), roughness: 0.8 }),
    );
    pad.position.y = 0.06;
    pad.receiveShadow = true;
    pad.userData.restaurantRoot = group;
    group.add(pad);

    // DOM label
    const el = document.createElement('div');
    el.className = 'tag';
    el.innerHTML = `<span class="dot" style="background:${cat.color}"></span><span class="tag-name">${restaurant.name}</span>`;
    el.dataset.id = restaurant.id;
    const label = new CSS2DObject(el);
    label.position.set(0, bh + 0.55, 0);
    group.add(label);

    this.scene.add(group);

    const entry = { restaurant, group, cell, label, labelEl: el, foodTotem: food, cat, pad };
    group.userData.entry = entry;
    this.buildings.push(entry);
    return entry;
  }

  // Find the free land cell furthest from existing buildings (for +Add).
  findFreeCell() {
    const candidates = this.landCells.filter(([c, r]) =>
      !this.usedCells.has(this.key(c, r)) &&
      this.isLand(c + 1, r) && this.isLand(c - 1, r) &&
      this.isLand(c, r + 1) && this.isLand(c, r - 1));
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
    for (let dc = -1; dc <= 1; dc++)
      for (let dr = -1; dr <= 1; dr++)
        this.usedCells.add(this.key(cell[0] + dc, cell[1] + dr));
    return this.addRestaurant(restaurant, cell);
  }

  // ---- nature scatter ---------------------------------------------------
  async scatterNature(density = 0.16) {
    const jobs = [];
    for (const [c, r] of this.landCells) {
      if (this.usedCells.has(this.key(c, r))) continue;
      // avoid the very edge so plants don't clip the coast
      if (!this.isLand(c + 1, r) || !this.isLand(c - 1, r) || !this.isLand(c, r + 1) || !this.isLand(c, r - 1)) continue;
      const roll = this.rng();
      if (roll > density) continue;
      const isTree = this.rng() > 0.45;
      const list = isTree ? TREES : DECO;
      const name = list[Math.floor(this.rng() * list.length)];
      const size = isTree ? 0.9 + this.rng() * 0.5 : 0.4 + this.rng() * 0.3;
      this.usedCells.add(this.key(c, r));
      jobs.push(this.plopNature(`nature/${name}`, c, r, size));
    }
    await Promise.all(jobs);
  }

  async plopNature(path, c, r, size) {
    const g = await instantiate(path, { targetSize: size });
    const p = this.cellToWorld(c, r);
    g.position.set(p.x + (this.rng() - 0.5) * 0.4, 0, p.z + (this.rng() - 0.5) * 0.4);
    g.rotation.y = this.rng() * Math.PI * 2;
    this.scene.add(g);
  }

  // ---- per-frame --------------------------------------------------------
  update(t) {
    this.updateWater(t);
    for (const b of this.buildings) {
      if (b.foodTotem) {
        b.foodTotem.rotation.y = t * 0.8;
        b.foodTotem.position.y = 0.15 + Math.sin(t * 1.6 + b.cell[0]) * 0.06;
      }
    }
  }
}

export { COLS, ROWS, TILE };
