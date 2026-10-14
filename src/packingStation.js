import * as THREE from 'three';
import { CONFIG } from './config.js';
import { createLemonMesh, RAINBOW_TEXTURE } from './lemon.js';

// 箱の大きさ（x：幅、z：奥行き、y：高さ）
const BOX_W = 2.6;
const BOX_D = 1.6;
const BOX_H = 1.1;
const WALL = 0.08;
const LEMON_SCALE = 0.7; // 箱の中では少し小さめに見せる

// 箱の色（普通の段ボール／金の箱）
const CARDBOARD_COLOR = 0xd9a066;
const FLAP_COLOR = 0xc98f55;
const GOLD_BOX_COLOR = 0xffcc33;
const GOLD_FLAP_COLOR = 0xffe680;

// 各段階にかける秒数
const CLOSE_SECONDS = 0.35; // ふたが閉じる
const LEAVE_SECONDS = 0.6; // 箱が跳ねながら去る
const ARRIVE_SECONDS = 0.4; // 新しい箱が上から落ちてくる

// 出口の隣にある箱詰め場所。
// 渡されたレモンを1個ずつ箱にポコポコ跳び込ませ、満杯になったら出荷して、
// 新しい空の箱を用意する。
//
// 箱は次の4つの状態をぐるぐる回る：
//   filling（詰めている）→ closing（ふたが閉じる）→ leaving（出荷されて去る）→ arriving（新しい箱が来る）→ filling …
export class PackingStation {
  // onShip(金額, 箱の位置, 箱の種類)：出荷したときに呼ばれる（金額は倍率をかけた後）
  // onPlop(何個目か)：レモンが1個、箱の中に着地したときに呼ばれる（0から数える）
  // onSpecialBox(箱の位置, 箱の種類)：金の箱・虹の箱が着地したときに呼ばれる
  // 箱の種類：'normal'（普通）/ 'golden'（金・出荷額×3）/ 'rainbow'（虹・出荷額×100）
  constructor(position, { onShip, onPlop, onSpecialBox }) {
    this.group = new THREE.Group();
    this.group.position.copy(position);
    this.onShip = onShip;
    this.onPlop = onPlop;
    this.onSpecialBox = onSpecialBox;

    // 動く箱本体（去ったり落ちてきたりするのはこちら）
    const { box, flaps, boxMaterial, flapMaterial } = createBox();
    this.box = box;
    this.flaps = flaps;
    this.boxMaterial = boxMaterial;
    this.flapMaterial = flapMaterial;
    this.group.add(box);

    // 金の箱になる確率（アップグレードで上がる。虹の箱はその1/10）と、今の箱の種類
    this.goldenChance = CONFIG.packing.goldenBox.chance;
    this.boxKind = 'normal';

    this.pending = []; // これから箱に入れるレモン（種類）
    this.hopping = []; // 箱に跳び込んでいる途中のレモン
    this.contents = []; // 箱の中に入ったレモン
    this.insertTimer = 0;
    this.bounceTime = 1; // 1 = 弾んでいない
    this.speed = 1; // 箱に入れる速さの倍率（アップグレードで上がる）

    this.state = 'filling';
    this.stateTime = 0;
    this.setFlapsOpen(1);
  }

  // 持ってきたレモンを、順番待ちの列に加える（あふれた分は次の箱に入る）
  insert(types) {
    this.pending.push(...types.filter(Boolean)); // 空のデータが混ざっても止まらないように除く
  }

  // 箱の中で使っている（または跳び込み中で予約済みの）場所の数
  get usedSlots() {
    return this.contents.length + this.hopping.length;
  }

  update(dt) {
    this.stateTime += dt;

    if (this.state === 'filling') this.updateFilling(dt);
    else if (this.state === 'closing') this.updateClosing();
    else if (this.state === 'leaving') this.updateLeaving();
    else if (this.state === 'arriving') this.updateArriving();

    // ポコッと入ったときの、箱のぷにっとした弾み
    if (this.bounceTime < 1) {
      this.bounceTime = Math.min(1, this.bounceTime + dt / 0.2);
      const squash = Math.sin(this.bounceTime * Math.PI) * 0.1;
      this.box.scale.set(1 + squash, 1 - squash, 1 + squash);
    }
  }

  updateFilling(dt) {
    const { boxCapacity, insertInterval } = CONFIG.packing;

    // 一定の間隔で、順番待ちのレモンを1個ずつ跳び込ませる
    this.insertTimer -= dt;
    if (this.pending.length > 0 && this.insertTimer <= 0 && this.usedSlots < boxCapacity) {
      this.launchLemon(this.pending.shift());
      this.insertTimer = insertInterval / this.speed;
    }

    this.updateHopping(dt);

    // 満杯になったら、ふたを閉じる段階へ
    if (this.contents.length >= boxCapacity) this.changeState('closing');
  }

  // レモン1個を、箱の上から中の決まった場所へ跳び込ませる
  launchLemon(type) {
    const mesh = createLemonMesh(type);
    mesh.scale.setScalar(LEMON_SCALE);
    const from = new THREE.Vector3(THREE.MathUtils.randFloatSpread(0.8), BOX_H + 2.2, 0);
    const to = slotPosition(this.usedSlots);
    mesh.position.copy(from);
    this.box.add(mesh);
    this.hopping.push({ type, mesh, from, to, t: 0 });
  }

  updateHopping(dt) {
    // 跳び込む時間も短くする。ただし速くしすぎると動きが見えなくなるので、倍率の半分だけ効かせる
    const hopSeconds = CONFIG.packing.hopSeconds / (1 + (this.speed - 1) / 2);
    for (const h of this.hopping) {
      h.t = Math.min(1, h.t + dt / hopSeconds);
      // 上の点から中の場所へ向かいつつ、いったん少し跳ね上がる（山なり）
      h.mesh.position.lerpVectors(h.from, h.to, h.t);
      h.mesh.position.y += 1.2 * 4 * h.t * (1 - h.t);
      // 跳び込みながら横に寝る（箱の中では寝かせて並べる）
      h.mesh.rotation.x = h.t * Math.PI / 2;
    }

    // 着地したレモンを「箱の中」に移し、箱を弾ませる
    this.hopping = this.hopping.filter((h) => {
      if (h.t < 1) return true;
      this.contents.push(h);
      this.bounceTime = 0;
      this.onPlop(this.contents.length - 1);
      return false;
    });
  }

  updateClosing() {
    const t = Math.min(1, this.stateTime / CLOSE_SECONDS);
    this.setFlapsOpen(1 - t);
    if (t < 1) return;

    // 出荷：中身の値段を合計し、金の箱・虹の箱なら倍にしてお知らせする
    const sum = this.contents.reduce((total, c) => total + CONFIG.lemonTypes[c.type].price, 0);
    const value = sum * boxMultiplier(this.boxKind);
    const top = this.group.position.clone().setY(BOX_H + 0.5);
    this.onShip(value, top, this.boxKind);
    this.changeState('leaving');
  }

  updateLeaving() {
    // ぴょんと跳ねながら奥へ去り、小さくなって消える
    const t = Math.min(1, this.stateTime / LEAVE_SECONDS);
    this.box.position.set(t * 3, 2.5 * 4 * t * (1 - t), 0);
    this.box.scale.setScalar(Math.max(0.01, 1 - t));
    if (t < 1) return;

    // 新しい空の箱を用意する（中身を片付け、ふたを開け、上から落とす準備）
    for (const c of this.contents) this.box.remove(c.mesh);
    this.contents = [];
    this.setFlapsOpen(1);
    this.box.scale.setScalar(1);

    // 次の箱の種類を抽選する：虹（金の箱の1/10）→ 金 → 普通 の順に確率の幅で区切る
    const rainbowChance = this.goldenChance * CONFIG.packing.rainbowBox.chanceOfGolden;
    const r = Math.random();
    if (r < rainbowChance) this.boxKind = 'rainbow';
    else if (r < rainbowChance + this.goldenChance) this.boxKind = 'golden';
    else this.boxKind = 'normal';

    this.paintBox();
    this.changeState('arriving');
  }

  updateArriving() {
    // 上から落ちてくる（だんだん速くなる）
    const t = Math.min(1, this.stateTime / ARRIVE_SECONDS);
    this.box.position.set(0, 6 * (1 - t * t), 0);
    if (t < 1) return;

    this.bounceTime = 0; // 着地でぷにっ
    if (this.boxKind !== 'normal') this.onSpecialBox(this.group.position.clone().setY(BOX_H), this.boxKind);
    this.changeState('filling');
  }

  // 箱の種類に合わせて色を塗る。虹の箱は、虹色の縞模様を貼る（模様は main.js で毎フレーム流れる）
  paintBox() {
    const rainbow = this.boxKind === 'rainbow';
    const golden = this.boxKind === 'golden';
    for (const material of [this.boxMaterial, this.flapMaterial]) {
      material.map = rainbow ? RAINBOW_TEXTURE : null;
      material.needsUpdate = true; // 模様を付け外ししたことを、描画係に知らせる
    }
    if (rainbow) {
      this.boxMaterial.color.setHex(0xffffff); // 模様の色をそのまま出すため白にする
      this.flapMaterial.color.setHex(0xffffff);
    } else {
      this.boxMaterial.color.setHex(golden ? GOLD_BOX_COLOR : CARDBOARD_COLOR);
      this.flapMaterial.color.setHex(golden ? GOLD_FLAP_COLOR : FLAP_COLOR);
    }
  }

  changeState(state) {
    this.state = state;
    this.stateTime = 0;
  }

  // ふたの開き具合：1 = 全開（外側に倒れている）、0 = 閉じている
  setFlapsOpen(amount) {
    const angle = amount * Math.PI * 0.7;
    this.flaps[0].rotation.x = angle; // 手前のふた
    this.flaps[1].rotation.x = -angle; // 奥のふた
  }
}

// 箱の種類ごとの、出荷額の倍率
export function boxMultiplier(kind) {
  if (kind === 'rainbow') return CONFIG.packing.rainbowBox.multiplier;
  if (kind === 'golden') return CONFIG.packing.goldenBox.multiplier;
  return 1;
}

// 箱の中で i 番目のレモンを置く場所（5個×2列）
function slotPosition(i) {
  const col = (i % 5) - 2;
  const row = Math.floor(i / 5) === 0 ? -1 : 1;
  return new THREE.Vector3(col * 0.48, WALL + 0.25, row * 0.35);
}

// 上が開いた段ボール箱と、2枚のふたを作る
function createBox() {
  const box = new THREE.Group();
  const cardboard = new THREE.MeshToonMaterial({ color: CARDBOARD_COLOR });

  const addPanel = (w, h, d, x, y, z) => {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), cardboard);
    panel.position.set(x, y, z);
    panel.castShadow = true;
    panel.receiveShadow = true;
    box.add(panel);
  };
  addPanel(BOX_W, WALL, BOX_D, 0, WALL / 2, 0); // 底
  addPanel(BOX_W, BOX_H, WALL, 0, BOX_H / 2, BOX_D / 2); // 手前
  addPanel(BOX_W, BOX_H, WALL, 0, BOX_H / 2, -BOX_D / 2); // 奥
  addPanel(WALL, BOX_H, BOX_D, BOX_W / 2, BOX_H / 2, 0); // 右
  addPanel(WALL, BOX_H, BOX_D, -BOX_W / 2, BOX_H / 2, 0); // 左

  // ふた：手前と奥の壁の上端を軸（ちょうつがい）にして回る
  const flapMaterial = new THREE.MeshToonMaterial({ color: FLAP_COLOR });
  const flaps = [1, -1].map((side) => {
    const hinge = new THREE.Group();
    hinge.position.set(0, BOX_H, side * BOX_D / 2);
    const flap = new THREE.Mesh(new THREE.BoxGeometry(BOX_W, WALL, BOX_D / 2), flapMaterial);
    flap.position.z = -side * BOX_D / 4; // 閉じたとき、箱の内側に向かって伸びる
    flap.castShadow = true;
    hinge.add(flap);
    box.add(hinge);
    return hinge;
  });

  // 材質も返す（金の箱のときに色を塗り替えるため）
  return { box, flaps, boxMaterial: cardboard, flapMaterial };
}
