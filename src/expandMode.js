import * as THREE from 'three';
import { Land } from './land.js';
import { CELL } from './grid.js';
import { WorldLabel } from './worldLabel.js';
import { CONFIG } from './config.js';

const PLOT_SIZE = CONFIG.land.plotCells * CELL;

// 土地を広げるモード：買える区画を黄色く光らせ、値段の札を出す。クリックした区画を買う。
// Esc・右クリックでやめる。
export class ExpandMode {
  constructor({ scene, camera, domElement, land }) {
    Object.assign(this, { camera, land });
    this.request = null; // 使っていなければ null。使っている間は { onBuy }
    this.choices = []; // 買える区画の見本：{ px, pz, mesh, label }

    this.group = new THREE.Group();
    scene.add(this.group);
    this.raycaster = new THREE.Raycaster();
    this.ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    this.panel = document.createElement('div');
    this.panel.id = 'expand-panel';
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

  // cost：買う値段、onBuy(px, pz)：区画をクリックしたときに呼ばれる
  start({ cost, onBuy }) {
    this.cancel();
    this.request = { onBuy };
    this.panel.textContent = `🗺 広げたい区画をクリック（¥${cost.toLocaleString()}）（Esc・右クリックでやめる）`;
    this.panel.hidden = false;

    // 買える区画ごとに、黄色い板と値段の札を出す
    for (const [px, pz] of this.land.purchasablePlots()) {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(PLOT_SIZE * 0.96, PLOT_SIZE * 0.96),
        new THREE.MeshBasicMaterial({ color: 0xffd84d, transparent: true, opacity: 0.35, depthWrite: false }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.copy(Land.plotCenter(px, pz)).setY(0.05);
      this.group.add(mesh);
      const label = new WorldLabel(`¥${cost.toLocaleString()}`);
      label.el.classList.add('price-label');
      this.choices.push({ px, pz, mesh, label });
    }
  }

  cancel() {
    this.request = null;
    this.panel.hidden = true;
    for (const { mesh, label } of this.choices) {
      this.group.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
      label.remove();
    }
    this.choices = [];
  }

  // マウスが指している区画（買える区画のどれか）を探す
  choiceAt(e) {
    const pointer = new THREE.Vector2(
      (e.clientX / window.innerWidth) * 2 - 1,
      -(e.clientY / window.innerHeight) * 2 + 1,
    );
    this.raycaster.setFromCamera(pointer, this.camera);
    const hit = this.raycaster.ray.intersectPlane(this.ground, new THREE.Vector3());
    if (!hit) return null;
    const px = Land.plotOfPosition(hit.x);
    const pz = Land.plotOfPosition(hit.z);
    return this.choices.find((c) => c.px === px && c.pz === pz) ?? null;
  }

  onPointerMove(e) {
    if (!this.active) return;
    const hovered = this.choiceAt(e);
    // 指している区画だけ濃くする
    for (const choice of this.choices) choice.mesh.material.opacity = choice === hovered ? 0.7 : 0.35;
  }

  onPointerDown(e) {
    if (!this.active) return;
    if (e.button === 2) {
      this.cancel();
      return;
    }
    if (e.button !== 0) return;

    const choice = this.choiceAt(e);
    if (!choice) return;
    const { onBuy } = this.request;
    this.cancel();
    onBuy(choice.px, choice.pz);
  }

  // 値段の札を、区画の真ん中の上に付いていかせる（毎フレーム呼ぶ）
  update() {
    for (const { px, pz, label } of this.choices) {
      label.update(this.camera, Land.plotCenter(px, pz).setY(1), true);
    }
  }
}
