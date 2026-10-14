import * as THREE from 'three';

// かわいいエフェクト（星やキラキラが弾ける）をまとめて管理する。
// 粒（パーティクル）は数秒で消えるので、毎フレーム update() で動かして、寿命が来たら片付ける。
export class Effects {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.particles = [];
    this.starGeometry = createStarGeometry();
    this.dotGeometry = new THREE.CircleGeometry(0.12, 12);
  }

  // 収穫したときの「ぽんっ」：星とキラキラが放射状に弾ける
  burst(position, lemonType) {
    const palette = {
      normal: [0xffffff, 0xfff27a, 0xff9ecf],
      silver: [0xffffff, 0xd9e6ff, 0xb8c4ff],
      gold: [0xffffff, 0xffd84d, 0xffa31a],
      rainbow: [0xff5a5a, 0xffa53a, 0xfff35a, 0x5ae05a, 0x5ab4ff, 0xa45aff],
    }[lemonType];
    // 金・銀は少し豪華に、虹はもっと豪華に
    const count = { normal: 8, silver: 14, gold: 14, rainbow: 30 }[lemonType];

    for (let i = 0; i < count; i++) {
      const isStar = i % 2 === 0;
      this.spawn({
        geometry: isStar ? this.starGeometry : this.dotGeometry,
        color: palette[i % palette.length],
        position,
        velocity: randomDirection().multiplyScalar(THREE.MathUtils.randFloat(2.5, 4.5)).setY(THREE.MathUtils.randFloat(2, 5)),
        life: THREE.MathUtils.randFloat(0.5, 0.8),
        size: isStar ? 1 : 0.8,
      });
    }
  }

  // レアなレモンのまわりに出る、小さな「キラッ」（その場でふわっと浮いて消える星）
  twinkle(position, color) {
    this.spawn({
      geometry: this.starGeometry,
      color,
      position,
      velocity: new THREE.Vector3(0, 0.8, 0),
      life: THREE.MathUtils.randFloat(0.4, 0.7),
      size: THREE.MathUtils.randFloat(0.7, 1.1),
      gravity: 0,
    });
  }

  // 回収機に届いたときの小さな「ぽふっ」
  puff(position) {
    for (let i = 0; i < 5; i++) {
      this.spawn({
        geometry: this.dotGeometry,
        color: 0xffffff,
        position,
        velocity: randomDirection().multiplyScalar(1.5).setY(2),
        life: 0.4,
        size: 1.2,
      });
    }
  }

  // gravity：粒が落ちる強さ（キラッとした星は 0 にして、ふわっと浮かせる）
  spawn({ geometry, color, position, velocity, life, size, gravity = 9 }) {
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(position);
    this.scene.add(mesh);
    this.particles.push({ mesh, velocity, life, age: 0, size, gravity, spin: THREE.MathUtils.randFloatSpread(10) });
  }

  update(dt) {
    for (const p of this.particles) {
      p.age += dt;
      p.velocity.y -= p.gravity * dt; // 重力で少し落ちる
      p.mesh.position.addScaledVector(p.velocity, dt);

      // いつもカメラの方を向かせ（板なので）、くるくる回す
      p.mesh.quaternion.copy(this.camera.quaternion);
      p.mesh.rotateZ(p.spin * p.age);

      // 出た瞬間にぷくっと大きくなり、だんだん小さく・薄くなって消える
      const t = p.age / p.life;
      const pop = t < 0.2 ? t / 0.2 : 1 - (t - 0.2) / 0.8;
      p.mesh.scale.setScalar(p.size * Math.max(pop, 0.01));
      p.mesh.material.opacity = 1 - t * t;
    }

    // 寿命が来た粒を片付ける
    this.particles = this.particles.filter((p) => {
      if (p.age < p.life) return true;
      this.scene.remove(p.mesh);
      p.mesh.material.dispose();
      return false;
    });
  }
}

// 5つの角を持つ星の形（平らな板）
function createStarGeometry() {
  const shape = new THREE.Shape();
  const outer = 0.3;
  const inner = 0.13;
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}

// 水平方向のランダムな向き（長さ1）
function randomDirection() {
  const a = Math.random() * Math.PI * 2;
  return new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
}
