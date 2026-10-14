import * as THREE from 'three';
import { CONFIG } from './config.js';
import { createLemonMesh } from './lemon.js';

const BELT_HEIGHT = 0.5;
const BELT_WIDTH = 1.4;
const LEMON_Y = BELT_HEIGHT + 0.45; // ベルトの上に乗ったレモンの高さ

// ベルトコンベア。
// 「マスの並び」から道筋を作り、その上でレモンを入口（回収機）から出口まで運ぶ。
//
// レモンの位置は「道筋の始点から何メートル進んだか（s）」だけで管理する。
// 3D上の位置は、毎フレーム s から計算する。こうすると、道筋がどんな形でも
// （曲がっていても、⑦で自由に設置しても）同じ仕組みで運べる。
export class Conveyor {
  constructor(cells) {
    const size = CONFIG.conveyor.cellSize;
    const centers = cells.map(([x, z]) => new THREE.Vector3(x * size, 0, z * size));

    // 出口は、最後のマスから同じ向きにもう1マス進んだ場所
    const last = centers[centers.length - 1];
    const lastDir = last.clone().sub(centers[centers.length - 2]).normalize();
    this.startPoint = centers[0].clone();
    this.exitPoint = last.clone().addScaledVector(lastDir, size);
    this.exitDirection = lastDir; // 出口の向き（箱を出口の先に置くのに使う）

    // レモンが通る道筋（マスの中心を順につなぎ、最後に出口まで）
    this.route = [...centers, this.exitPoint];
    this.routeLength = 0;
    for (let i = 1; i < this.route.length; i++) {
      this.routeLength += this.route[i].distanceTo(this.route[i - 1]);
    }

    this.group = new THREE.Group();
    this.beltTexture = createBeltTexture();
    this.buildBelt(centers);

    // ベルトの上のレモン。先頭（出口に一番近いもの）から順に並べる。
    this.items = [];

    // 流れる速さ（アップグレードで上がる）
    this.speed = CONFIG.conveyor.speed;
  }

  buildBelt(centers) {
    const size = CONFIG.conveyor.cellSize;
    const frame = new THREE.MeshToonMaterial({ color: 0x5b6b7a });
    const top = new THREE.MeshToonMaterial({ map: this.beltTexture });
    // 箱の6面の材質：[右, 左, 上, 下, 手前, 奥]。上の面だけ流れる模様にする
    const materials = [frame, frame, top, frame, frame, frame];

    // ベルトの箱を1つ置く。length：進む方向の長さ、center：箱の中心、dir：進む向き
    const addSegment = (length, center, dir, lift = 0) => {
      const segment = new THREE.Mesh(new THREE.BoxGeometry(length, BELT_HEIGHT, BELT_WIDTH), materials);
      segment.position.set(center.x, BELT_HEIGHT / 2 + lift, center.z);
      segment.rotation.y = Math.atan2(-dir.z, dir.x); // 箱の長い方向を進む向きにそろえる
      segment.receiveShadow = true;
      this.group.add(segment);
    };

    centers.forEach((center, i) => {
      // このマスに入ってくる向きと、出ていく向き（端のマスは、もう片方と同じ向きとみなす）
      const dirOut = centers[i + 1] ? centers[i + 1].clone().sub(center).normalize() : null;
      const dirIn = centers[i - 1] ? center.clone().sub(centers[i - 1]).normalize() : null;
      const inDir = dirIn ?? dirOut;
      const outDir = dirOut ?? dirIn;

      if (inDir.equals(outDir)) {
        // まっすぐのマス：箱1つ
        addSegment(size, center, outDir);
        return;
      }

      // 曲がり角のマス：「入ってくる半分」と「出ていく半分」の2つの箱を、
      // 中心で重ねてL字にする（すき間ができないように、ベルト幅の半分だけ延ばす）
      const halfLength = size / 2 + BELT_WIDTH / 2;
      const shift = (size / 2 - BELT_WIDTH / 2) / 2;
      addSegment(halfLength, center.clone().addScaledVector(inDir, -shift), inDir);
      // 重なった部分がちらつかないよう、出ていく側をほんの少しだけ高くする
      addSegment(halfLength, center.clone().addScaledVector(outDir, shift), outDir, 0.005);
    });
  }

  update(dt, collector, exitTray) {
    const { gap, cellSize } = CONFIG.conveyor;
    const speed = this.speed;

    // 1. レモンを前に進める。前のレモンに近づきすぎたら、そこで止まる（渋滞）
    //    出口がいっぱいのときは、先頭のレモンがベルトの端で止まって待つ
    const frontLimit = exitTray.isFull ? this.routeLength : Infinity;
    this.items.forEach((item, i) => {
      const limit = i === 0 ? frontLimit : this.items[i - 1].s - gap;
      item.s = Math.min(item.s + speed * dt, limit);
    });

    // 2. 出口まで着いた先頭のレモンを、出口の受け皿に渡す（いっぱいなら渡さない）
    while (this.items.length > 0 && this.items[0].s >= this.routeLength && !exitTray.isFull) {
      const item = this.items.shift();
      exitTray.add(item.type, item.mesh);
    }

    // 3. 回収機にレモンがたまっていて、入口が空いていれば、1個ベルトに乗せる
    const lastItem = this.items[this.items.length - 1];
    const entranceFree = !lastItem || lastItem.s >= gap;
    if (collector.queue.length > 0 && entranceFree) {
      const type = collector.queue.shift();
      const mesh = createLemonMesh(type);
      this.group.add(mesh);
      this.items.push({ type, mesh, s: 0 });
    }

    // 4. 進んだ距離 s から、3D上の位置を決める
    for (const item of this.items) {
      this.positionAt(item.s, item.mesh.position);
    }

    // ベルトの模様を流す（1マスで模様1つ分なので、速さ÷マスの大きさ）
    this.beltTexture.offset.x -= (speed * dt) / cellSize;
  }

  // 道筋の始点から距離 s だけ進んだ位置を out に書き込む
  positionAt(s, out) {
    let remaining = s;
    for (let i = 1; i < this.route.length; i++) {
      const a = this.route[i - 1];
      const b = this.route[i];
      const len = a.distanceTo(b);
      if (remaining <= len) {
        out.lerpVectors(a, b, remaining / len);
        out.y = LEMON_Y;
        return out;
      }
      remaining -= len;
    }
    out.copy(this.exitPoint);
    out.y = LEMON_Y;
    return out;
  }
}

// ベルトの表面の模様（進む方向に対して横向きの縞）
function createBeltTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 16;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#3d4650';
  ctx.fillRect(0, 0, 64, 16);
  ctx.fillStyle = '#56616d';
  for (let x = 0; x < 64; x += 16) ctx.fillRect(x, 0, 6, 16);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
