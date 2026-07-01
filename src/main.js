import * as THREE from 'three';
import { sampleImageToGrid } from './imageLoader.js';
import { CubePortrait } from './CubePortrait.js';
import { mountConsole } from './console.js';

// Left-side CV console — mounted into the left rail (below the social pills), independent
// of the WebGL scene, so it shows even if the photo fails to load.
mountConsole(document.getElementById('left-rail'));

// ---------------------------------------------------------------------------
// Config — every tunable lives here.
// ---------------------------------------------------------------------------
const CONFIG = {
  photo: './photo.png',
  cols: 200, // grid density (cubes across). ~40k cubes at 16:9. Lower if fps drops.
  cellSize: 1, // world pitch between cubes
  cubeScale: 0.9, // cube edge as fraction of pitch (<1 leaves gaps between cubes)

  physics: {
    stiffness: 30, // spring constant pulling each cube home
    damping: 4, // velocity damping (underdamped => springy reform)
    noiseAmp: 8, // ambient drift acceleration
    noiseScale: 0.03, // spatial frequency of the drift field
    noiseSpeed: 0.25, // temporal speed of the drift field
    noiseDepth: 2.0, // Z breathing amplitude (world units)
    rotate: true, // cubes tumble with their velocity
    calmDamping: 12, // damping while "holding to view" (settles cubes onto the photo)
    calmStiffnessMul: 1.6, // stiffness boost while calm, for a crisp snap home
  },

  scatter: {
    strength: 45, // peak impulse velocity of a scatter burst
    minInterval: 6, // seconds
    maxInterval: 12, // seconds
  },

  // Move the pointer over the scene to reveal the photo locally: cubes under the pointer
  // calm down (settle onto the photo) for a few seconds, while the rest keep drifting.
  holdToViewSeconds: 5,
  holdRadius: 6, // reveal-brush radius in cubes around the pointer

  maxPixelRatio: 2,
  maxDt: 1 / 30, // clamp delta after tab-switches so the sim can't explode
};

const canvas = document.getElementById('scene');
const errorEl = document.getElementById('error');
const showStats = new URLSearchParams(location.search).has('stats');

// ---------------------------------------------------------------------------
// Renderer / scene / camera
// ---------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, CONFIG.maxPixelRatio));
renderer.setClearColor(0x000000, 1);

const scene = new THREE.Scene();

// Orthographic so the portrait maps 1:1 with no perspective distortion.
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10000);
camera.position.set(0, 0, 1000);
camera.lookAt(0, 0, 0);

// Mostly ambient light so colors stay true; a soft key light gives Z motion some shading.
scene.add(new THREE.AmbientLight(0xffffff, 1.7));
const key = new THREE.DirectionalLight(0xffffff, 0.6);
key.position.set(0.3, 0.5, 1);
scene.add(key);

let portrait = null;
let currentAspect = 0;

function fitCamera(gridHeight) {
  const aspect = window.innerWidth / window.innerHeight;
  const viewH = gridHeight;
  const viewW = viewH * aspect;
  camera.left = -viewW / 2;
  camera.right = viewW / 2;
  camera.top = viewH / 2;
  camera.bottom = -viewH / 2;
  camera.updateProjectionMatrix();
}

function resizeRenderer() {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, CONFIG.maxPixelRatio));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
}

// ---------------------------------------------------------------------------
// Build (and rebuild on large aspect changes so the cover-crop stays correct)
// ---------------------------------------------------------------------------
async function build() {
  const aspect = window.innerWidth / window.innerHeight;
  currentAspect = aspect;

  const grid = await sampleImageToGrid(CONFIG.photo, CONFIG.cols, aspect, CONFIG.cellSize);

  if (portrait) {
    scene.remove(portrait.mesh);
    portrait.dispose();
  }
  portrait = new CubePortrait(grid, CONFIG.physics, CONFIG.cubeScale);
  scene.add(portrait.mesh);

  resizeRenderer();
  fitCamera(grid.height);
}

// ---------------------------------------------------------------------------
// Scatter scheduling
// ---------------------------------------------------------------------------
let nextScatterAt = 0;
function scheduleScatter(now) {
  const { minInterval, maxInterval } = CONFIG.scatter;
  nextScatterAt = now + minInterval + Math.random() * (maxInterval - minInterval);
}

// ---------------------------------------------------------------------------
// "Reveal brush": moving the pointer over the scene calms the cubes it passes over, so the
// photo reads clearly under the pointer for a few seconds. Local, not global.
// ---------------------------------------------------------------------------
// Optional ?hold=<seconds> override (handy for tuning / testing the resume delay).
const holdParam = new URLSearchParams(location.search).get('hold');
const holdSeconds = holdParam != null && holdParam !== '' ? Number(holdParam) : CONFIG.holdToViewSeconds;

const _ptr = new THREE.Vector3();
let lastPtr = null; // last pointer position in world space, for stroke interpolation

function pointerToWorld(clientX, clientY) {
  const ndcX = (clientX / window.innerWidth) * 2 - 1;
  const ndcY = -(clientY / window.innerHeight) * 2 + 1;
  // Orthographic: unprojected X/Y equal world X/Y regardless of Z.
  _ptr.set(ndcX, ndcY, 0).unproject(camera);
  return _ptr;
}

function paintCalm(clientX, clientY) {
  if (!portrait) return;
  const p = pointerToWorld(clientX, clientY);
  const x = p.x;
  const y = p.y;
  const until = elapsed + holdSeconds;
  const radius = CONFIG.holdRadius * CONFIG.cellSize;

  if (lastPtr) {
    // Fill the gap between frames so fast strokes don't leave holes.
    const dx = x - lastPtr.x;
    const dy = y - lastPtr.y;
    const steps = Math.max(1, Math.floor(Math.hypot(dx, dy) / (radius * 0.5)));
    for (let s = 1; s <= steps; s++) {
      const f = s / steps;
      portrait.calmAt(lastPtr.x + dx * f, lastPtr.y + dy * f, radius, until);
    }
  } else {
    portrait.calmAt(x, y, radius, until);
  }
  lastPtr = { x, y };
}

canvas.addEventListener('pointermove', (e) => paintCalm(e.clientX, e.clientY));
canvas.addEventListener('pointerdown', (e) => paintCalm(e.clientX, e.clientY));
canvas.addEventListener('pointerleave', () => {
  lastPtr = null; // reset so re-entry doesn't streak a line across the scene
});

// ---------------------------------------------------------------------------
// Resize handling — debounced rebuild keeps cubes square and photo cover-cropped.
// ---------------------------------------------------------------------------
let resizeTimer = 0;
window.addEventListener('resize', () => {
  resizeRenderer();
  if (portrait) fitCamera(portrait.grid.height);
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    const aspect = window.innerWidth / window.innerHeight;
    // Only re-sample if the aspect shifted enough to matter (avoids constant rebuilds).
    if (Math.abs(aspect - currentAspect) / currentAspect > 0.08) {
      build().catch(reportError);
    }
  }, 250);
});

// ---------------------------------------------------------------------------
// Minimal FPS overlay (only with ?stats) — no extra dependency.
// ---------------------------------------------------------------------------
let statsEl = null;
let frames = 0;
let statsAccum = 0;
if (showStats) {
  statsEl = document.createElement('div');
  statsEl.style.cssText =
    'position:fixed;top:8px;left:8px;font:12px/1 ui-monospace,monospace;color:#0f0;' +
    'background:rgba(0,0,0,.5);padding:4px 6px;border-radius:4px;z-index:10;pointer-events:none';
  document.body.appendChild(statsEl);
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();
let elapsed = 0;

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), CONFIG.maxDt);
  elapsed += dt;

  if (portrait) {
    if (elapsed >= nextScatterAt) {
      // Scatter runs globally; cubes currently calm under the pointer are left undisturbed.
      portrait.scatter(CONFIG.scatter.strength, elapsed);
      scheduleScatter(elapsed);
    }
    portrait.update(dt, elapsed);
    renderer.render(scene, camera);
  }

  if (statsEl) {
    frames++;
    statsAccum += dt;
    if (statsAccum >= 0.5) {
      statsEl.textContent = `${Math.round(frames / statsAccum)} fps · ${portrait?.count ?? 0} cubes`;
      frames = 0;
      statsAccum = 0;
    }
  }
}

function reportError(err) {
  console.error(err);
  errorEl.classList.add('visible');
}

// Debug hook (only with ?debug): inspect calm state and average cube drift for tuning.
if (new URLSearchParams(location.search).has('debug')) {
  const driftOf = (i) => {
    const { pos, homes } = portrait.physics;
    const ix = i * 3;
    return Math.hypot(pos[ix] - homes[ix], pos[ix + 1] - homes[ix + 1], pos[ix + 2] - homes[ix + 2]);
  };
  window.__cv = {
    time: () => elapsed,
    count: () => portrait?.physics.count ?? 0,
    // How many cubes are currently calm (under/near the pointer).
    calmCount: () => {
      if (!portrait) return 0;
      const cu = portrait.physics.calmUntil;
      let n = 0;
      for (let i = 0; i < cu.length; i++) if (cu[i] > elapsed) n++;
      return n;
    },
    avgDrift: () => {
      if (!portrait) return null;
      const n = portrait.physics.count;
      let sum = 0;
      for (let i = 0; i < n; i++) sum += driftOf(i);
      return sum / n;
    },
    // Average drift of cubes within `radCells` of a screen point (to check the local reveal).
    driftAtScreen: (px, py, radCells) => {
      if (!portrait) return null;
      const p = pointerToWorld(px, py);
      const wx = p.x;
      const wy = p.y;
      const g = portrait.grid;
      const rad = radCells * g.cellSize;
      const r2 = rad * rad;
      const { homes, count } = portrait.physics;
      let sum = 0;
      let n = 0;
      for (let i = 0; i < count; i++) {
        const ix = i * 3;
        const dx = homes[ix] - wx;
        const dy = homes[ix + 1] - wy;
        if (dx * dx + dy * dy <= r2) {
          sum += driftOf(i);
          n++;
        }
      }
      return n ? { avg: sum / n, n } : { avg: 0, n: 0 };
    },
  };
}

build()
  .then(() => {
    scheduleScatter(0);
    tick();
  })
  .catch(reportError);
