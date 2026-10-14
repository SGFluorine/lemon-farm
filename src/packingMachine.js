import * as THREE from 'three';
import { CONFIG } from './config.js';

// 箱詰めマシーン。買うと現れて、出口の受け皿のレモンを一定間隔で1個ずつ箱に入れる。
// 手で連打した方が速いように、間隔（this.interval）は控えめにしてある。
export class PackingMachine {
  constructor(position) {
    this.group = new THREE.Group();
    this.group.position.copy(position);
    this.group.visible = false; // 買うまでは見えない

    // 本体（灰色の箱）
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.3, 1.2, 1.3),
      new THREE.MeshToonMaterial({ color: 0x8fa3b8 }),
    );
    body.position.y = 0.6;
    body.castShadow = true;

    // 上のランプ（動いた瞬間に光る）
    this.lampMaterial = new THREE.MeshToonMaterial({ color: 0x66dd66 });
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), this.lampMaterial);
    lamp.position.y = 1.35;

    this.body = new THREE.Group();
    this.body.add(body, lamp);
    this.group.add(this.body);

    this.enabled = false;
    this.interval = CONFIG.upgrades.packingMachine.interval; // 何秒に1回送るか（速度アップで短くなる）
    this.batch = 1; // 1回に送る数（まとめ詰めで増える）
    this.timer = 0;
    this.flash = 0; // ランプの光り具合（1 = 一番明るい）
    this.appear = 1; // 現れる演出の進み具合（1 = 完了）
  }

  enable() {
    this.enabled = true;
    this.group.visible = true;
    this.appear = 0;
  }

  update(dt, exitTray, packing) {
    if (!this.enabled) return;

    // 現れるとき：上から落ちてきて、ぷにっと着地する
    if (this.appear < 1) {
      this.appear = Math.min(1, this.appear + dt / 0.4);
      this.body.position.y = 5 * (1 - this.appear) ** 2;
    }

    // 一定の間隔で、受け皿のレモンを（まとめ詰めのぶんだけ）箱に送る
    this.timer -= dt;
    if (this.timer <= 0 && exitTray.items.length > 0) {
      const count = Math.min(this.batch, exitTray.items.length);
      const types = [];
      for (let i = 0; i < count; i++) types.push(exitTray.takeTop());
      packing.insert(types);
      this.timer = this.interval;
      this.flash = 1;
    }

    // 送った瞬間にランプが明るく光り、少し弾む
    this.flash = Math.max(0, this.flash - dt * 4);
    this.lampMaterial.color.setRGB(0.4 + 0.6 * this.flash, 0.87, 0.4 + 0.5 * this.flash);
    const squash = Math.sin(this.flash * Math.PI) * 0.08;
    this.body.scale.set(1 + squash, 1 - squash, 1 + squash);
  }
}
