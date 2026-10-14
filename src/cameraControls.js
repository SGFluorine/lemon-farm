import * as THREE from 'three';
import { CONFIG } from './config.js';

// 見下ろしカメラ。
// 「注視点（地面上の、カメラが見ている点）」を WASD で動かし、
// カメラはその点を斜め上から一定の角度で見続ける。ホイールで距離を変える。
export class CameraControls {
  constructor(camera, domElement) {
    this.camera = camera;
    this.target = new THREE.Vector3(0, 0, 0);
    this.distance = CONFIG.camera.distance;
    this.keys = new Set();
    // 注視点が動ける範囲（持っている土地。広がったら setBounds で広げる）
    this.bounds = { minX: -20, maxX: 20, minZ: -20, maxZ: 20 };

    window.addEventListener('keydown', (e) => this.keys.add(e.code));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear()); // 押しっぱなし防止

    domElement.addEventListener('wheel', (e) => {
      e.preventDefault();
      const { minDistance, maxDistance, zoomStep } = CONFIG.camera;
      this.distance = THREE.MathUtils.clamp(
        this.distance * (1 + e.deltaY * zoomStep),
        minDistance,
        maxDistance,
      );
    }, { passive: false });

    this.applyPosition();
  }

  update(dt) {
    // 押されているキーから、動く向きを決める（W = 奥、S = 手前）
    const dir = new THREE.Vector3(
      (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0),
      0,
      (this.keys.has('KeyS') ? 1 : 0) - (this.keys.has('KeyW') ? 1 : 0),
    );
    if (dir.lengthSq() > 0) {
      dir.normalize().multiplyScalar(CONFIG.camera.moveSpeed * dt);
      this.target.add(dir);

      // 注視点が土地の外に出ないようにする
      const { minX, maxX, minZ, maxZ } = this.bounds;
      this.target.x = THREE.MathUtils.clamp(this.target.x, minX, maxX);
      this.target.z = THREE.MathUtils.clamp(this.target.z, minZ, maxZ);
    }
    this.applyPosition();
  }

  setBounds(bounds) {
    this.bounds = bounds;
  }

  // 注視点・角度・距離から、カメラの位置を計算する
  applyPosition() {
    const angle = THREE.MathUtils.degToRad(CONFIG.camera.angleDeg);
    this.camera.position.set(
      this.target.x,
      this.target.y + Math.sin(angle) * this.distance,
      this.target.z + Math.cos(angle) * this.distance,
    );
    this.camera.lookAt(this.target);
  }
}
