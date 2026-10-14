import * as THREE from 'three';
import { CONFIG } from './config.js';

const TRAY_TOP_Y = 0.3;
const SPACING = 0.7; // 積んだレモン同士の間隔
const LAYER_HEIGHT = 0.75; // 1段の高さ

// コンベアの出口にある受け皿。届いたレモンがここに積み上がっていく。
// プレイヤーはここをクリックして、一番上のレモンから1個ずつ拾う。
export class ExitTray {
  constructor(position) {
    this.group = new THREE.Group();
    this.group.position.copy(position);

    const tray = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, TRAY_TOP_Y, 2.4),
      new THREE.MeshToonMaterial({ color: 0xc98b4f }),
    );
    tray.position.y = TRAY_TOP_Y / 2;
    tray.receiveShadow = true;
    this.group.add(tray);

    // 積まれているレモン（下から順）
    this.items = [];
    this.capacity = CONFIG.capacity.exitTray; // ためておける上限（アップグレードで広がる）
    // 拾われて、ぴょこっと跳ねて消えていく途中のレモン
    this.leaving = [];
  }

  // レモンを1個受け取り、次の空いている場所に「ぽとっ」と落とす
  add(type, mesh) {
    const i = this.items.length;
    const layer = Math.floor(i / 9); // 3×3 で1段、埋まったら上の段へ
    const col = (i % 9) % 3 - 1;
    const row = Math.floor((i % 9) / 3) - 1;

    const restY = TRAY_TOP_Y + 0.45 + layer * LAYER_HEIGHT;
    mesh.position.set(col * SPACING, restY + 1, row * SPACING); // 少し上から落とす
    mesh.rotation.set(0, Math.random() * Math.PI, Math.random() * 0.4);
    this.group.add(mesh); // コンベアからこちらに付け替える

    this.items.push({ type, mesh, restY, fallSpeed: 0 });
  }

  get isFull() {
    return this.items.length >= this.capacity;
  }

  // 一番上（最後に積んだ）レモンを1個取り出し、種類を返す。空なら null。
  takeTop() {
    const item = this.items.pop();
    if (!item) return null;
    this.leaving.push({ mesh: item.mesh, t: 0 });
    return item.type;
  }

  update(dt) {
    // 落ちている途中のレモンを、重力で着地させる
    for (const item of this.items) {
      if (item.mesh.position.y <= item.restY) continue;
      item.fallSpeed += 20 * dt;
      item.mesh.position.y = Math.max(item.restY, item.mesh.position.y - item.fallSpeed * dt);
    }

    // 拾われたレモン：上にぴょこっと跳ねながら小さくなって消える
    for (const p of this.leaving) {
      p.t += dt / 0.2;
      p.mesh.position.y += 6 * dt;
      p.mesh.scale.setScalar(Math.max(0.01, 1 - p.t));
    }
    this.leaving = this.leaving.filter((p) => {
      if (p.t < 1) return true;
      this.group.remove(p.mesh);
      return false;
    });
  }
}
