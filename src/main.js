import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { World } from './world.js';
import { createUI } from './ui.js';
import { DEMO_RESTAURANTS, makeId } from './data.js';

const sceneEl = document.getElementById('scene');
const labelsEl = document.getElementById('labels');

// ---- renderer -----------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
sceneEl.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.style.position = 'absolute';
labelRenderer.domElement.style.top = '0';
labelRenderer.domElement.style.left = '0';
labelRenderer.domElement.style.pointerEvents = 'none';
labelsEl.appendChild(labelRenderer.domElement);

// ---- scene --------------------------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2a333f);
// no fog — the reference diorama is brightly and evenly lit

// ---- isometric camera ---------------------------------------------------
const VIEW = 22;
let aspect = window.innerWidth / window.innerHeight;
const camera = new THREE.OrthographicCamera(
  (-VIEW * aspect) / 2, (VIEW * aspect) / 2, VIEW / 2, -VIEW / 2, -100, 300,
);
camera.position.set(30, 27, 30);
camera.lookAt(0, 0, 0);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = true;
controls.screenSpacePanning = false;
controls.minPolarAngle = THREE.MathUtils.degToRad(28);
controls.maxPolarAngle = THREE.MathUtils.degToRad(66);
controls.minZoom = 0.55;
controls.maxZoom = 3.2;
controls.target.set(0, 0, 0);
controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };

// ---- bright studio lighting (matches the Kenney sample render) ---------
scene.add(new THREE.HemisphereLight(0xe6eefc, 0x8a6446, 0.95));
scene.add(new THREE.AmbientLight(0xffffff, 0.6));

const sun = new THREE.DirectionalLight(0xfff6ea, 2.2);
sun.position.set(-16, 28, 14);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 90;
sun.shadow.camera.left = -24;
sun.shadow.camera.right = 24;
sun.shadow.camera.top = 24;
sun.shadow.camera.bottom = -24;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
sun.shadow.radius = 3;
scene.add(sun);
scene.add(sun.target);

// soft fill from the opposite side to keep shadows light (not murky)
const fill = new THREE.DirectionalLight(0xcfe0ff, 0.55);
fill.position.set(18, 14, -16);
scene.add(fill);

// ---- build the world ----------------------------------------------------
const world = new World(scene);
const restaurants = DEMO_RESTAURANTS.map((r) => ({ ...r, id: makeId() }));

async function boot() {
  world.generateIsland();
  world.computeHeights();
  world.reserveMonorailDefault();     // claim the rail corridor before anything else
  const cells = world.pickSpreadCells(restaurants.length);
  world.flattenAround(cells);
  world.buildTerrain();
  await world.placeRestaurants(restaurants, cells);
  await world.addRocket();
  await world.addLaunchComplex();
  await world.addMounds(7);
  await world.buildNetwork();
  await world.scatterDecor(0.22);
  await world.addHeroProps();
  await world.addPeople(16);

  ui = createUI({ world, focusOn });

  // fade out loader once the first frame is ready
  requestAnimationFrame(() => {
    renderer.render(scene, camera);
    const loader = document.getElementById('loader');
    loader.classList.add('hide');
    setTimeout(() => loader.remove(), 600);
  });
}

// ---- focus / camera tween ----------------------------------------------
let tween = null;
function focusOn(entry, zoom) {
  const p = entry.group.position;
  tween = {
    target: new THREE.Vector3(p.x, 0.6, p.z),
    zoom: zoom ? 1.9 : Math.max(camera.zoom, 1.2),
  };
}
controls.addEventListener('start', () => { if (tween) tween.zoom = camera.zoom; });

// ---- picking ------------------------------------------------------------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let down = null;
let hovered = null;

function pickAt(clientX, clientY) {
  pointer.x = (clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(world.buildings.map((b) => b.group), true);
  for (const h of hits) {
    let o = h.object;
    while (o) { if (o.userData.entry) return o.userData.entry; o = o.parent; }
  }
  return null;
}

renderer.domElement.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!down) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
  down = null;
  if (moved > 6) return; // it was a drag, not a click
  const entry = pickAt(e.clientX, e.clientY);
  if (entry) { ui.openCard(entry); focusOn(entry, true); }
});
renderer.domElement.addEventListener('pointermove', (e) => {
  const entry = pickAt(e.clientX, e.clientY);
  renderer.domElement.style.cursor = entry ? 'pointer' : 'grab';
  hovered = entry;
});

// UI handle — populated once boot() builds the world and calls createUI.
let ui = { openCard() {}, closeCard() {}, applyFilter() {} };

// ---- resize -------------------------------------------------------------
function onResize() {
  aspect = window.innerWidth / window.innerHeight;
  camera.left = (-VIEW * aspect) / 2;
  camera.right = (VIEW * aspect) / 2;
  camera.top = VIEW / 2;
  camera.bottom = -VIEW / 2;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', onResize);

// ---- animation loop -----------------------------------------------------
const clock = new THREE.Clock();
let elapsed = 0;
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  elapsed += dt;
  const t = elapsed;
  world.update(t, dt);

  // hover pop
  for (const b of world.buildings) {
    const target = b === hovered ? 1.06 : 1;
    b.group.scale.lerp(new THREE.Vector3(target, target, target), 0.2);
  }

  if (tween) {
    controls.target.lerp(tween.target, 0.09);
    camera.zoom += (tween.zoom - camera.zoom) * 0.09;
    camera.updateProjectionMatrix();
    if (controls.target.distanceTo(tween.target) < 0.04 && Math.abs(camera.zoom - tween.zoom) < 0.02) {
      tween = null;
    }
  }

  controls.update();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}

boot().then(() => animate());
