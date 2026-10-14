import * as THREE from 'three';
import { CELL, cellCenter, worldToCell } from './grid.js';

const OK_COLOR = 0x66dd66; // 置けるマス
const NG_COLOR = 0xff5555; // 置けないマス

// 1マスを選んで、何かを置くモード（今は家を置くのに使う）。
// マウスを乗せたマスに見本と「届く範囲の円」を出し、クリックで置く。Esc・右クリックでやめる。
export class PlaceMode {
  // isBlocked(x, z)：そのマスがふさがっているか（持っている土地の外も、ふさがり扱い）
  constructor({ scene, camera, domElement, isBlocked }) {
    Object.assign(this, { camera, isBlocked });
    this.request = null; // 置いている途中の依頼（{ label, rangeRadius, onPlace }）。使っていなければ null

    // 置く場所の見本（半透明の箱）と、届く範囲の円
    this.ghost = new THREE.Mesh(
      new THREE.BoxGeometry(CELL * 0.92, 1.2, CELL * 0.92),
      new THREE.MeshBasicMaterial({ color: OK_COLOR, transparent: true, opacity: 0.55, depthWrite: false }),
    );
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.97, 1, 64),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
    );
    this.ring.rotation.x = -Math.PI / 2; // 地面に寝かせる
    this.helpers = new THREE.Group();
    this.helpers.add(this.ghost, this.ring);
    this.helpers.visible = false;
    scene.add(this.helpers);

    this.raycaster = new THREE.Raycaster();
    this.ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    this.panel = document.createElement('div');
    this.panel.id = 'place-panel';
    this.panel.hidden = true;
    document.body.appendChild(this.panel);

    domElement.addEventListener('pointermove', (e) => this.onPointerMove(e));
    domElement.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    domElement.addEventListener('contextmenu', (e) => {
      if (this.active) e.preventDefault();
    });
    window.addEventListener('keydown', (e) => {
      if (this.active && e.code === 'Escape') this.cancel();
    });
  }

  get active() {
    return this.request !== null;
  }

  // label：パネルに出す説明、rangeRadius：届く範囲の円の半径、onPlace(マス)：置いたときに呼ばれる
  start({ label, rangeRadius, onPlace }) {
    this.request = { onPlace };
    this.ring.scale.setScalar(rangeRadius);
    this.panel.textContent = `${label}（Esc・右クリックでやめる）`;
    this.panel.hidden = false;
    this.helpers.visible = true;
  }

  cancel() {
    this.request = null;
    this.panel.hidden = true;
    this.helpers.visible = false;
  }

  cellAt(e) {
    const pointer = new THREE.Vector2(
      (e.clientX / window.innerWidth) * 2 - 1,
      -(e.clientY / window.innerHeight) * 2 + 1,
    );
    this.raycaster.setFromCamera(pointer, this.camera);
    const hit = this.raycaster.ray.intersectPlane(this.ground, new THREE.Vector3());
    return hit ? worldToCell(hit) : null;
  }

  canPlace(x, z) {
    return !this.isBlocked(x, z); // 土地の外も isBlocked でふさがり扱い
  }

  onPointerMove(e) {
    if (!this.active) return;
    const cell = this.cellAt(e);
    this.helpers.visible = Boolean(cell);
    if (!cell) return;
    const center = cellCenter(cell.x, cell.z);
    this.ghost.position.copy(center).setY(0.6);
    this.ring.position.copy(center).setY(0.05);
    this.ghost.material.color.setHex(this.canPlace(cell.x, cell.z) ? OK_COLOR : NG_COLOR);
  }

  onPointerDown(e) {
    if (!this.active) return;
    if (e.button === 2) {
      this.cancel();
      return;
    }
    if (e.button !== 0) return;

    const cell = this.cellAt(e);
    if (!cell || !this.canPlace(cell.x, cell.z)) return;
    const { onPlace } = this.request;
    this.cancel();
    onPlace(cell);
  }
}
