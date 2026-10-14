import * as THREE from 'three';
import { CONFIG } from './config.js';

// レモンの形（少し縦長の球）。すべてのレモンで同じものを使い回す。
const LEMON_GEOMETRY = new THREE.SphereGeometry(0.35, 16, 12).scale(1, 1.3, 1);

// 虹色の縞模様（赤・橙・黄・緑・青・紫）。虹のレモンと虹の箱に貼る
export const RAINBOW_TEXTURE = createRainbowTexture();

// 種類ごとの色の材質も、作るのは1回だけにして使い回す
const lemonMaterials = {};
export function getLemonMaterial(type) {
  lemonMaterials[type] ??= type === 'rainbow'
    ? new THREE.MeshToonMaterial({ map: RAINBOW_TEXTURE }) // 虹は色ではなく縞模様を貼る
    : new THREE.MeshToonMaterial({ color: CONFIG.lemonTypes[type].color });
  return lemonMaterials[type];
}

// レアなレモンを光らせる（毎フレーム呼ぶ）。
//   虹：縞模様を流す。模様は全部の虹のレモン・虹の箱で共有しているので、1回動かせば全部が動く
//   金・銀・虹：材質の「自分で光る色（emissive）」を、ふわっと強くしたり弱くしたりをくり返す。
//   材質も種類ごとに共有しているので、1回変えれば、その種類のレモン全部が光る
export function updateLemonShine(time) {
  RAINBOW_TEXTURE.offset.y = time * 0.6;

  const pulse = 0.5 + 0.5 * Math.sin(time * 4); // 0〜1 を行ったり来たりする
  getLemonMaterial('gold').emissive.setHex(0xffb300).multiplyScalar(0.2 + 0.3 * pulse);
  getLemonMaterial('silver').emissive.setHex(0xbcd4ff).multiplyScalar(0.15 + 0.3 * pulse);
  getLemonMaterial('rainbow').emissive.setHex(0xffffff).multiplyScalar(0.1 + 0.2 * pulse);
}

function createRainbowTexture() {
  const colors = ['#ff5a5a', '#ffa53a', '#fff35a', '#5ae05a', '#5ab4ff', '#a45aff'];
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = colors.length * 8;
  const ctx = canvas.getContext('2d');
  colors.forEach((color, i) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, i * 8, 4, 8);
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping; // 流しても途切れないように、上下につなげる
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// 指定した種類のレモンの見た目を1個作る（コンベアの上や出口に置く用）
export function createLemonMesh(type) {
  const mesh = new THREE.Mesh(LEMON_GEOMETRY, getLemonMaterial(type));
  mesh.castShadow = true;
  return mesh;
}

// 木になるレモン1個。種類の抽選と、小さい状態から大きくなる成長を担当する。
export class Lemon {
  constructor() {
    this.mesh = createLemonMesh('normal');
    this.regrow();
  }

  // 最初から育ち直す（収穫後にも使う）
  regrow() {
    this.type = pickLemonType();
    this.mesh.material = getLemonMaterial(this.type);

    this.growth = 0; // 0 = 生まれたて、1 = 成長しきった
    this.isRipe = false;
    this.growSeconds = randomBetween(CONFIG.growSeconds.min, CONFIG.growSeconds.max);
    this.applyScale();
  }

  // セーブデータから、種類と育ち具合を戻す
  restore(type, growth) {
    this.type = type;
    this.mesh.material = getLemonMaterial(type);
    this.growth = growth;
    this.isRipe = growth >= 1;
    this.applyScale();
  }

  // 毎フレーム呼ばれる。dt は前のフレームからの経過秒数。
  update(dt) {
    if (this.isRipe) return; // 成長しきったら止まる

    this.growth = Math.min(1, this.growth + dt / this.growSeconds);
    if (this.growth >= 1) this.isRipe = true;
    this.applyScale();
  }

  // 成長度をモデルの大きさに反映する（ゼロだと見えないので少しだけ下駄をはかせる）
  applyScale() {
    const s = 0.1 + 0.9 * this.growth;
    this.mesh.scale.setScalar(s);
  }
}

// 金のレモンが出る確率の上乗せ分（アップグレードで増える）。
// 増えた分だけ、普通のレモンの確率が減る。
let goldBonus = 0;
export function setGoldBonus(bonus) {
  goldBonus = bonus;
}

// 確率に従ってレモンの種類を1つ選ぶ。
// 0〜1の乱数を、虹 → 金 → 銀 の順に確率の幅で区切り、どこに入ったかで決める（残りは普通）
function pickLemonType() {
  const { silver, gold, rainbow } = CONFIG.lemonTypes;
  const goldChance = gold.chance + goldBonus;
  const rainbowChance = goldChance * rainbow.chanceOfGold; // 虹は金の1/10

  const r = Math.random();
  if (r < rainbowChance) return 'rainbow';
  if (r < rainbowChance + goldChance) return 'gold';
  if (r < rainbowChance + goldChance + silver.chance) return 'silver';
  return 'normal';
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}
