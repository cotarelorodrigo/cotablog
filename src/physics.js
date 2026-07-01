import { createNoise3D } from 'simplex-noise';

// Spring-based particle physics over Structure-of-Arrays typed buffers.
//
// Each cube is a point mass with a "home" (its pixel position). A Hooke spring pulls it
// home, damping bleeds off energy, and 3D simplex noise adds organic ambient drift. A
// scatter() impulse can blow the whole field apart; the springs then reform the photo.
//
// No inter-cube collisions — that O(n^2) cost is what would kill framerate at ~40k cubes.
// Everything here is O(n) with zero per-frame allocation.

export class Physics {
  /**
   * @param {Float32Array} homes  count*3 rest positions
   * @param {object} cfg
   * @param {number} cfg.stiffness    spring constant k (higher = snappier reform)
   * @param {number} cfg.damping      velocity damping (higher = settles faster)
   * @param {number} cfg.noiseAmp     ambient jitter acceleration
   * @param {number} cfg.noiseScale   spatial frequency of the noise field
   * @param {number} cfg.noiseSpeed   temporal speed of the noise field
   * @param {number} cfg.noiseDepth   how far cubes can drift toward/away on Z
   */
  constructor(homes, cfg) {
    this.homes = homes;
    this.count = homes.length / 3;
    this.cfg = cfg;

    // Live state.
    this.pos = Float32Array.from(homes); // start at rest (photo assembled)
    this.vel = new Float32Array(homes.length);

    // Deterministic noise (seeded via fixed constants so we avoid Math.random at setup).
    this.noiseX = createNoise3D(mulberry32(0x1a2b3c));
    this.noiseY = createNoise3D(mulberry32(0x4d5e6f));
    this.noiseZ = createNoise3D(mulberry32(0x7a8b9c));

    // Simple xorshift RNG for scatter impulses (again, no Math.random dependency).
    this._rngState = 0x9e3779b9;
  }

  _rand() {
    // xorshift32 -> [0, 1)
    let x = this._rngState | 0;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this._rngState = x;
    return ((x >>> 0) % 100000) / 100000;
  }

  /**
   * Blow the field apart from a random focal point. Springs reassemble it afterward.
   * @param {number} strength peak impulse velocity
   */
  scatter(strength) {
    const { pos, vel, count } = this;
    // Random focal point within the field's XY bounds, slightly in front on Z.
    const fx = (this._rand() - 0.5) * 2;
    const fy = (this._rand() - 0.5) * 2;
    // Normalize focal point into world space using the field extents (approx via homes).
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < count; i++) {
      const x = this.homes[i * 3];
      const y = this.homes[i * 3 + 1];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const cx = minX + (fx * 0.5 + 0.5) * (maxX - minX);
    const cy = minY + (fy * 0.5 + 0.5) * (maxY - minY);
    const spread = 0.5 * (maxX - minX); // falloff radius

    for (let i = 0; i < count; i++) {
      const ix = i * 3;
      let dx = pos[ix] - cx;
      let dy = pos[ix + 1] - cy;
      const dist = Math.hypot(dx, dy) || 1e-4;
      // Radial push, stronger near the focal point.
      const falloff = Math.exp(-(dist * dist) / (2 * spread * spread));
      const push = strength * falloff * (0.6 + 0.8 * this._rand());
      vel[ix] += (dx / dist) * push;
      vel[ix + 1] += (dy / dist) * push;
      // Pop toward the camera so the dissolve reads in 3D.
      vel[ix + 2] += push * (0.5 + this._rand());
    }
  }

  /**
   * Advance the simulation by dt seconds.
   * @param {number} dt    clamped delta time (s)
   * @param {number} time  elapsed time (s), drives the noise field
   */
  update(dt, time) {
    const { pos, vel, homes, count, cfg } = this;
    const k = cfg.stiffness;
    const damp = cfg.damping;
    const nAmp = cfg.noiseAmp;
    const nScale = cfg.noiseScale;
    const t = time * cfg.noiseSpeed;
    const zAmp = cfg.noiseDepth;

    for (let i = 0; i < count; i++) {
      const ix = i * 3;
      const hx = homes[ix];
      const hy = homes[ix + 1];
      const hz = homes[ix + 2];

      // Ambient noise sampled at the cube's HOME so neighbors move coherently.
      const nx = this.noiseX(hx * nScale, hy * nScale, t);
      const ny = this.noiseY(hx * nScale, hy * nScale, t);
      const nz = this.noiseZ(hx * nScale, hy * nScale, t);

      // Acceleration: spring home + damping + ambient drift.
      // Z gets an extra pull toward a noise-driven target depth for a gentle breathing pop.
      const ax = -k * (pos[ix] - hx) - damp * vel[ix] + nx * nAmp;
      const ay = -k * (pos[ix + 1] - hy) - damp * vel[ix + 1] + ny * nAmp;
      const azTarget = hz + nz * zAmp;
      const az = -k * (pos[ix + 2] - azTarget) - damp * vel[ix + 2];

      vel[ix] += ax * dt;
      vel[ix + 1] += ay * dt;
      vel[ix + 2] += az * dt;

      pos[ix] += vel[ix] * dt;
      pos[ix + 1] += vel[ix + 1] * dt;
      pos[ix + 2] += vel[ix + 2] * dt;
    }
  }
}

// Small seeded PRNG factory for deterministic noise seeds.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
