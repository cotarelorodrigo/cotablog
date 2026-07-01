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

  /** Trigger a scatter burst. */
  scatter(strength) {
    this.physics.scatter(strength);
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
