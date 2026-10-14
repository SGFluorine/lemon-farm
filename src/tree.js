import * as THREE from 'three';
import { CONFIG } from './config.js';
import { Lemon } from './lemon.js';

const TRUNK_HEIGHT = 2;
const CROWN_RADIUS = 1.8; // 葉の塊の半径
const CROWN_CENTER_Y = TRUNK_HEIGHT + 1.2;

// 木1本。幹と葉の見た目、そこになるレモンたちをまとめて持つ。
export class Tree {
  // animate：true なら、地面からぽこっと生えてくる演出をする（後から植えた木）
  // lemonCount：なるレモンの数（セーブデータから戻すとき用。省略すると、決まった範囲でランダム）
  constructor(x, z, { animate = false, lemonCount } = {}) {
    this.group = new THREE.Group();
    this.group.position.set(x, 0, z);
    this.appear = animate ? 0 : 1; // 生えてくる演出の進み具合（1 = 完了）
    if (animate) this.group.scale.setScalar(0.01);

    this.group.add(createTrunk());
    this.group.add(createCrown());

    // レモンを葉の表面に配置する
    const count = lemonCount ?? randomInt(CONFIG.lemonsPerTree.min, CONFIG.lemonsPerTree.max);
    this.lemons = [];
    for (const position of pickLemonPositions(count)) {
      const lemon = new Lemon();
      lemon.mesh.position.copy(position);
      this.group.add(lemon.mesh);
      this.lemons.push(lemon);
    }
  }

  update(dt) {
    for (const lemon of this.lemons) lemon.update(dt);

    // 生えてくる演出：少し大きくなりすぎてから、ぷるんと元の大きさに戻る
    if (this.appear < 1) {
      this.appear = Math.min(1, this.appear + dt / 0.6);
      this.group.scale.setScalar(Math.max(0.01, easeOutBack(this.appear)));
    }
  }
}

// 0→1 に進む途中で、いったん1を少し超えてから1に落ち着く動き
function easeOutBack(t) {
  const c = 1.7;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
}

function createTrunk() {
  const geometry = new THREE.CylinderGeometry(0.3, 0.4, TRUNK_HEIGHT, 10);
  const material = new THREE.MeshToonMaterial({ color: 0x8b5a2b });
  const trunk = new THREE.Mesh(geometry, material);
  trunk.position.y = TRUNK_HEIGHT / 2;
  trunk.castShadow = true;
  return trunk;
}

// 葉は、大きな球1つ＋小さな球いくつかを重ねて「もこもこ」に見せる
function createCrown() {
  const crown = new THREE.Group();
  const material = new THREE.MeshToonMaterial({ color: 0x3fae4a });
  const blobs = [
    { x: 0, y: 0, z: 0, r: CROWN_RADIUS },
    { x: 1.1, y: -0.3, z: 0.4, r: 1.1 },
    { x: -1.0, y: -0.2, z: -0.5, r: 1.2 },
    { x: 0.2, y: 0.8, z: -0.6, r: 1.0 },
  ];
  for (const b of blobs) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(b.r, 16, 12), material);
    mesh.position.set(b.x, CROWN_CENTER_Y + b.y, b.z);
    mesh.castShadow = true;
    crown.add(mesh);
  }
  return crown;
}

// 葉の表面（主に側面〜下側の見えやすい位置）に、互いに離れた点を count 個選ぶ
function pickLemonPositions(count) {
  const positions = [];
  const minGap = 0.9;
  for (let tries = 0; positions.length < count && tries < 200; tries++) {
    const angle = Math.random() * Math.PI * 2;
    const height = THREE.MathUtils.randFloat(-0.6, 0.6); // 葉の中心からの高さ
    const p = new THREE.Vector3(
      Math.cos(angle) * CROWN_RADIUS,
      CROWN_CENTER_Y + height,
      Math.sin(angle) * CROWN_RADIUS,
    );
    if (positions.every((q) => q.distanceTo(p) >= minGap)) positions.push(p);
  }
  return positions;
}

function randomInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}
