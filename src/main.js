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
  },

  scatter: {
    strength: 45, // peak impulse velocity of a scatter burst
    minInterval: 6, // seconds
    maxInterval: 12, // seconds
  },

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
      portrait.scatter(CONFIG.scatter.strength);
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

build()
  .then(() => {
    scheduleScatter(0);
    tick();
  })
  .catch(reportError);
