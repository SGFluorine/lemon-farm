import * as THREE from 'three';
import { CONFIG } from './config.js';

const FUNNEL_TOP_Y = 2.6; // じょうごの口の高さ

// 回収機。収穫したレモンが飛び込む先で、コンベアの入口になる。
// ためておける数には上限（capacity）があり、アップグレードで広がる。
export class Collector {
  // position：置く場所（コンベアの最初のマスの中心）
  constructor(position) {
    this.group = new THREE.Group();
    this.group.position.copy(position);

    // 土台の箱
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 1.4, 2.2),
      new THREE.MeshToonMaterial({ color: 0xff8a3d }),
    );
    base.position.y = 0.7;
    base.castShadow = true;

    // 上に乗ったじょうご（上が広い筒）
    const funnel = new THREE.Mesh(
      new THREE.CylinderGeometry(1.5, 0.8, 1.2, 20, 1, true),
      new THREE.MeshToonMaterial({ color: 0xffc94d, side: THREE.DoubleSide }),
    );
    funnel.position.y = FUNNEL_TOP_Y - 0.6;
    funnel.castShadow = true;

    // 弾む・震える動きは「見た目の部分」だけに付けたいので、まとめて body に入れる
    this.body = new THREE.Group();
    this.body.add(base, funnel);
    this.group.add(this.body);

    // 回収機に入ったレモンの種類を、入った順に並べておく（コンベアが先頭から取り出す）
    this.queue = [];
    this.capacity = CONFIG.capacity.collector;
    this.incoming = 0; // こちらへ飛んでいる途中のレモンの数（上限の計算に入れる）
    this.bounceTime = 1; // 1 = 弾んでいない
    this.shakeTime = 1; // 1 = 震えていない
  }

  // レモンが飛び込む位置（じょうごの口の中心）
  get entryPoint() {
    return new THREE.Vector3(this.group.position.x, FUNNEL_TOP_Y, this.group.position.z);
  }

  // 中にあるレモン＋飛んでくる途中のレモン（上限と比べる数）
  get load() {
    return this.queue.length + this.incoming;
  }

  receive(lemonType) {
    this.queue.push(lemonType);
    this.bounceTime = 0;
  }

  // いっぱいで受け取れないことを、ブルッと震えて知らせる
  shake() {
    this.shakeTime = 0;
  }

  update(dt) {
    // 受け取った瞬間に、ぷにっと縦につぶれて元に戻る
    if (this.bounceTime < 1) {
      this.bounceTime = Math.min(1, this.bounceTime + dt / 0.3);
      const squash = Math.sin(this.bounceTime * Math.PI) * 0.18;
      this.body.scale.set(1 + squash, 1 - squash, 1 + squash);
    }

    // 震え：左右に細かく揺れて、だんだん収まる
    if (this.shakeTime < 1) {
      this.shakeTime = Math.min(1, this.shakeTime + dt / 0.4);
      this.body.position.x = Math.sin(this.shakeTime * 40) * 0.2 * (1 - this.shakeTime);
    }
  }
}
