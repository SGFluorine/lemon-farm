import { CONFIG } from './config.js';
import { createLemonMesh } from './lemon.js';

// 収穫されて、回収機まで山なりに飛んでいくレモン。
// 木になっていたレモンとは別の「演出用のコピー」なので、木の方はすぐに育ち直せる。
export class FlyingLemon {
  // delay：何秒待ってから飛び始めるか（まとめ収穫で、ポンポンと順番に飛ばすため）
  constructor(scene, { type, from, to, onArrive, delay = 0 }) {
    this.scene = scene;
    this.type = type; // セーブのとき、飛んでいる途中のレモンも数に入れるため
    this.from = from.clone();
    this.to = to.clone();
    this.onArrive = onArrive;
    this.wait = delay;
    this.t = 0; // 0 = 出発、1 = 到着

    this.mesh = createLemonMesh(type);
    this.mesh.position.copy(from);
    scene.add(this.mesh);
  }

  // 到着したら true を返す（呼び出し側が一覧から外す）
  update(dt) {
    // 出発まで待っている間は、木になっていた場所にとどまる
    if (this.wait > 0) {
      this.wait -= dt;
      return false;
    }

    const { seconds, arcHeight, spins } = CONFIG.flight;
    this.t = Math.min(1, this.t + dt / seconds);

    // 出発点と到着点をまっすぐ結んだ線に、山なりの高さを足す
    // 4t(1-t) は t=0.5 で 1 になる「山」の形
    this.mesh.position.lerpVectors(this.from, this.to, this.t);
    this.mesh.position.y += arcHeight * 4 * this.t * (1 - this.t);

    // くるくる回りながら、到着直前に少し小さくなって吸い込まれる
    this.mesh.rotation.z = this.t * spins * Math.PI * 2;
    this.mesh.scale.setScalar(this.t > 0.85 ? 1 - (this.t - 0.85) / 0.15 * 0.6 : 1);

    if (this.t < 1) return false;

    this.scene.remove(this.mesh);
    this.onArrive();
    return true;
  }
}
