import * as THREE from 'three';
import { CONFIG } from './config.js';

// 収穫係のいる場所：「家」か「農家」。
//   家（kind = 'house'）：家の建物＋手前に立つ収穫係。置き場所はプレイヤーが選ぶ
//   農家（kind = 'farmer'）：建物はなく、土色の畑の上に収穫係が立つ。置き場所は自動で決まる
// どちらも、一定の間隔で近く（届く範囲）の成長しきったレモンを1個収穫する。
// 間隔と範囲はアップグレードで変わるので、update のたびに受け取る。
export class House {
  constructor(position, { kind = 'house' } = {}) {
    this.kind = kind;
    this.group = new THREE.Group();
    this.group.position.copy(position);
    this.timer = CONFIG.house.interval;
    this.hop = 1; // 収穫した瞬間のジャンプの進み具合（1 = 着地済み）
    this.appear = 0; // 現れる演出の進み具合（1 = 完了）
    this.time = Math.random() * 10; // ゆらゆら動きを1人ずつずらす

    this.worker = createWorker();
    if (kind === 'house') {
      this.group.add(createHouseModel());
      this.worker.position.set(0.9, 0, 0.9); // 家の手前に立つ
    } else {
      this.group.add(createFieldPatch());
      this.worker.scale.setScalar(1.3); // 建物がないぶん、少し大きくして見つけやすくする
    }
    this.group.add(this.worker);

    this.group.scale.setScalar(0.01);
  }

  // findRipeLemon(位置, 半径)：近くの成長しきったレモンを探す（なければ null）
  // tryHarvest(レモン)：収穫を試す。回収機がいっぱいなどで投げられなければ false
  // enabled：自動収穫がONか。OFFのときは、収穫係は休む（見えなくなる）
  // interval：何秒に1個収穫するか、radius：届く範囲（どちらもアップグレードで変わる）
  update(dt, { findRipeLemon, tryHarvest, enabled, interval, radius }) {
    this.time += dt;

    // 建つ演出：ぷるんと大きくなって元に戻る
    if (this.appear < 1) {
      this.appear = Math.min(1, this.appear + dt / 0.5);
      const t = this.appear;
      this.group.scale.setScalar(Math.max(0.01, 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2));
    }

    this.worker.visible = enabled;
    if (!enabled) {
      this.timer = interval; // ONに戻したら、少し間をおいてから収穫を始める
      return;
    }

    // 一定の間隔で、近くのレモンを収穫する
    this.timer -= dt;
    if (this.timer <= 0) {
      const lemon = findRipeLemon(this.group.position, radius);
      if (lemon && tryHarvest(lemon)) {
        this.hop = 0;
        this.timer = interval;
      } else {
        this.timer = 0.3; // 取れるレモンがない・回収機がいっぱいなら、少し待ってまた探す
      }
    }

    // 収穫係の動き：ふだんはゆらゆら、収穫した瞬間にぴょんと跳ねる
    if (this.hop < 1) this.hop = Math.min(1, this.hop + dt / 0.35);
    this.worker.position.y = Math.sin(this.hop * Math.PI) * 0.6;
    this.worker.rotation.z = Math.sin(this.time * 2) * 0.08;
  }
}

// 農家の足元の、土色の丸い畑（うねを2本のせる）
function createFieldPatch() {
  const patch = new THREE.Group();
  const soil = new THREE.Mesh(
    new THREE.CylinderGeometry(0.9, 0.95, 0.08, 24),
    new THREE.MeshToonMaterial({ color: 0xa0723f }),
  );
  soil.position.y = 0.04;
  soil.receiveShadow = true;
  patch.add(soil);

  const ridgeMaterial = new THREE.MeshToonMaterial({ color: 0x8a5e30 });
  for (const z of [-0.4, 0.4]) {
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.18), ridgeMaterial);
    ridge.position.set(0, 0.1, z);
    patch.add(ridge);
  }
  return patch;
}

// 小さくてかわいい家：四角い壁＋三角屋根＋ドア＋えんとつ
function createHouseModel() {
  const house = new THREE.Group();
  const toon = (color) => new THREE.MeshToonMaterial({ color });

  const walls = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.1, 1.3), toon(0xfff3d6));
  walls.position.y = 0.55;

  // 屋根：四角すい（円すいの面を4つにしたもの）を45°回して、壁にそろえる
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.25, 0.9, 4), toon(0xe5534b));
  roof.position.y = 1.55;
  roof.rotation.y = Math.PI / 4;

  const door = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.6, 0.05), toon(0x9a6232));
  door.position.set(0, 0.3, 0.66);

  const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.5, 0.22), toon(0xb0563e));
  chimney.position.set(0.4, 1.75, -0.2);

  for (const part of [walls, roof, door, chimney]) {
    part.castShadow = true;
    house.add(part);
  }
  return house;
}

// 収穫係：丸い頭＋筒の体＋麦わら帽子
function createWorker() {
  const worker = new THREE.Group();
  const toon = (color) => new THREE.MeshToonMaterial({ color });

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.45, 12), toon(0x4f8fe0));
  body.position.y = 0.23;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10), toon(0xffd9b3));
  head.position.y = 0.62;
  const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.3, 0.12, 14), toon(0xf2d16b));
  hat.position.y = 0.8;

  for (const part of [body, head, hat]) {
    part.castShadow = true;
    worker.add(part);
  }
  return worker;
}
