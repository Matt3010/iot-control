import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
const cache = new Map();

const BASE = import.meta.env.BASE_URL || './';

function url(path) {
  return `${BASE}assets/models/${path}.glb`.replace(/\/\//g, '/').replace(':/', '://');
}

// Load a model once and cache the prepared scene.
export function loadModel(path) {
  if (cache.has(path)) return cache.get(path);
  const p = new Promise((resolve, reject) => {
    loader.load(
      url(path),
      (gltf) => {
        const root = gltf.scene;
        root.traverse((o) => {
          if (o.isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
            if (o.material) o.material.metalness = 0;
          }
        });
        resolve(root);
      },
      undefined,
      (err) => reject(err),
    );
  });
  cache.set(path, p);
  return p;
}

// Return a fresh clone, normalised so its footprint fits `targetSize` (XZ)
// and its base sits on y = 0. Returns a Group ready to position.
export async function instantiate(path, { targetSize = 1, keepHeight = true } = {}) {
  const src = await loadModel(path);
  const model = src.clone(true);
  // Clone materials so per-instance tweaks (hover highlight) don't leak.
  model.traverse((o) => {
    if (o.isMesh && o.material) {
      o.material = Array.isArray(o.material)
        ? o.material.map((m) => m.clone())
        : o.material.clone();
    }
  });

  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  const footprint = Math.max(size.x, size.z) || 1;
  const scale = targetSize / footprint;

  const group = new THREE.Group();
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= box.min.y; // base to 0 before scaling
  group.add(model);
  group.scale.setScalar(scale);

  group.userData.baseHeight = keepHeight ? size.y * scale : 0;
  return group;
}
