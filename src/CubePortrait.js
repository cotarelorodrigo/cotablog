import * as THREE from 'three';
import { Physics } from './physics.js';

// Owns the InstancedMesh (one cube per sampled pixel) and its physics simulation.
// One shared geometry + material => a single draw call for the whole portrait.

export class CubePortrait {
  /**
   * @param {object} grid   result of sampleImageToGrid()
   * @param {object} physicsCfg  see Physics
   * @param {number} cubeScale    cube edge as a fraction of the cell pitch (0..1, gaps < 1)
   */
  constructor(grid, physicsCfg, cubeScale) {
    this.grid = grid;
    this.count = grid.count;

    const size = grid.cellSize * cubeScale;
    const geometry = new THREE.BoxGeometry(size, size, size);
    const material = new THREE.MeshStandardMaterial({
      roughness: 0.75,
      metalness: 0.0,
      // instanceColor multiplies the base white; keep base white so colors are exact.
      color: 0xffffff,
    });

    this.mesh = new THREE.InstancedMesh(geometry, material, this.count);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false; // it fills the screen; skip the cull test.

    // Per-instance color from the sampled photo (sRGB source).
    const color = new THREE.Color();
    for (let i = 0; i < this.count; i++) {
      color.setRGB(
        grid.colors[i * 3 + 0],
        grid.colors[i * 3 + 1],
        grid.colors[i * 3 + 2],
        THREE.SRGBColorSpace,
      );
      this.mesh.setColorAt(i, color);
    }
    this.mesh.instanceColor.needsUpdate = true;

    this.physics = new Physics(grid.homes, physicsCfg);

    // Reused scratch objects — no per-frame allocation.
    this._m = new THREE.Matrix4();
    this._p = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3(1, 1, 1);
    this._e = new THREE.Euler();

    // Whether cubes tumble slightly as they move.
    this.rotate = physicsCfg.rotate !== false;

    this.writeMatrices(); // initial assembled state
  }

  /** Trigger a scatter burst (leaves calm cubes undisturbed). */
  scatter(strength, time) {
    this.physics.scatter(strength, time);
  }

  /**
   * Calm every cube whose home falls within `radius` (world units) of the world point
   * (wx, wy), i.e. paint a local "reveal" brush. Uses the regular grid layout to touch
   * only the affected cells instead of scanning all cubes.
   * @param {number} wx     world X
   * @param {number} wy     world Y
   * @param {number} radius reveal radius in world units
   * @param {number} until  timestamp (s) to keep those cubes calm until
   */
  calmAt(wx, wy, radius, until) {
    const g = this.grid;
    const { cols, rows, cellSize } = g;
    const x0 = -g.width / 2 + cellSize / 2;
    const y0 = g.height / 2 - cellSize / 2;
    const cf = (wx - x0) / cellSize; // fractional column
    const rf = (y0 - wy) / cellSize; // fractional row
    const span = Math.ceil(radius / cellSize);
    const r2 = radius * radius;
    const calmUntil = this.physics.calmUntil;

    const c0 = Math.max(0, Math.round(cf) - span);
    const c1 = Math.min(cols - 1, Math.round(cf) + span);
    const r0 = Math.max(0, Math.round(rf) - span);
    const r1 = Math.min(rows - 1, Math.round(rf) + span);

    for (let r = r0; r <= r1; r++) {
      const dy = (r - rf) * cellSize;
      for (let c = c0; c <= c1; c++) {
        const dx = (c - cf) * cellSize;
        if (dx * dx + dy * dy > r2) continue;
        const idx = r * cols + c;
        if (until > calmUntil[idx]) calmUntil[idx] = until;
      }
    }
  }

  /** Step physics then push positions/rotations into the instance matrix buffer. */
  update(dt, time) {
    this.physics.update(dt, time);
    this.writeMatrices();
  }

  writeMatrices() {
    const { pos, vel } = this.physics;
    const m = this._m;
    const p = this._p;
    const q = this._q;
    const s = this._s;
    const e = this._e;
    const rotate = this.rotate;

    for (let i = 0; i < this.count; i++) {
      const ix = i * 3;
      p.set(pos[ix], pos[ix + 1], pos[ix + 2]);
      if (rotate) {
        // Tumble proportional to velocity so faster cubes spin more; cheap and lively.
        e.set(vel[ix + 1] * 0.6, vel[ix] * 0.6, vel[ix + 2] * 0.6);
        q.setFromEuler(e);
        m.compose(p, q, s);
      } else {
        m.compose(p, this._identityQuat(q), s);
      }
      this.mesh.setMatrixAt(i, m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  _identityQuat(q) {
    q.set(0, 0, 0, 1);
    return q;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.mesh.dispose();
  }
}
