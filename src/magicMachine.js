import * as THREE from 'three';
import { CONFIG } from './config.js';
import { getLemonMaterial } from './lemon.js';

const ORB_Y = 2.3; // 水晶玉が浮かぶ高さ（アーチのてっぺんの少し上）

// 魔法のマシーン。コンベアの途中にまたがる紫のアーチで、
// 下を通ったレモンを、一定の確率で金のレモンに変える。買うまでは見えない。
export class MagicMachine {
  // onConvert(位置)：レモンが金に変わったときに呼ばれる（エフェクト・音・統計用）
  constructor(conveyor, { onConvert }) {
    this.onConvert = onConvert;

    this.group = new THREE.Group();
    this.group.visible = false;
    this.attachTo(conveyor);

    this.body = new THREE.Group();
    this.group.add(this.body);

    // アーチ（ベルトをまたぐ半円の輪）。ベルトの進む向きに対して横に立てる
    this.archMaterial = new THREE.MeshToonMaterial({ color: 0x9b59d0 });
    // （半径1.6：ベルトの上を通るレモンがアーチにぶつからない高さ）
    const arch = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.18, 10, 24, Math.PI), this.archMaterial);
    arch.rotation.y = Math.PI / 2;
    arch.castShadow = true;
    this.body.add(arch);

    // てっぺんに浮かぶ水晶玉（くるくる回りながら上下にゆれる）
    this.orb = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.35),
      new THREE.MeshToonMaterial({ color: 0xe0b3ff, emissive: 0x6a2a9a }),
    );
    this.orb.position.y = ORB_Y;
    this.body.add(this.orb);

    this.enabled = false;
    this.chance = CONFIG.upgrades.magicMachine.chance; // 金に変わる確率（アップグレードで上がる）
    this.time = 0;
    this.glow = 0; // 金に変えた瞬間の光り具合（1 = 一番明るい）
    this.appear = 1; // 現れる演出の進み具合（1 = 完了）
  }

  // コンベアの道筋の、入口から routeRatio の割合だけ進んだ場所に、ベルトをまたぐ向きで置く。
  // ラインを撤去したときは、別のラインのコンベアに付け替える
  attachTo(conveyor) {
    this.checkpoint = conveyor.routeLength * CONFIG.upgrades.magicMachine.routeRatio;
    const here = conveyor.positionAt(this.checkpoint, new THREE.Vector3()).setY(0);
    const ahead = conveyor.positionAt(this.checkpoint + 0.1, new THREE.Vector3()).setY(0);
    const dir = ahead.sub(here).normalize();
    this.group.position.copy(here);
    this.group.rotation.y = Math.atan2(-dir.z, dir.x); // アーチをベルトの向きにそろえる
  }

  enable() {
    this.enabled = true;
    this.group.visible = true;
    this.appear = 0;
  }

  update(dt, conveyor) {
    if (!this.enabled) return;
    this.time += dt;

    // 下を通過したレモンを、1個につき1回だけ判定する
    for (const item of conveyor.items) {
      if (item.magicChecked || item.s < this.checkpoint) continue;
      item.magicChecked = true;
      // 金と虹は対象外（虹を金に変えると値段が下がってしまうため）
      if (item.type === 'gold' || item.type === 'rainbow' || Math.random() >= this.chance) continue;

      // 金のレモンに変える（中身の種類と見た目の両方を差し替える）
      item.type = 'gold';
      item.mesh.material = getLemonMaterial('gold');
      this.glow = 1;
      this.onConvert(item.mesh.getWorldPosition(new THREE.Vector3()));
    }

    // 現れるとき：上から落ちてきて着地する
    if (this.appear < 1) {
      this.appear = Math.min(1, this.appear + dt / 0.5);
      this.body.position.y = 5 * (1 - this.appear) ** 2;
    }

    // 水晶玉がくるくる回り、ふわふわ上下する
    this.orb.rotation.y = this.time * 2;
    this.orb.position.y = ORB_Y + Math.sin(this.time * 3) * 0.1;

    // 金に変えた瞬間、アーチが金色に光ってから紫に戻る
    this.glow = Math.max(0, this.glow - dt * 2);
    this.archMaterial.color.setHex(0x9b59d0).lerp(new THREE.Color(0xffd84d), this.glow);
  }
}
