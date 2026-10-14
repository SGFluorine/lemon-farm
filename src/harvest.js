import * as THREE from 'three';
import { CONFIG } from './config.js';

// クリックした位置から「成長しきったレモン」を探す係。
// 小さいレモンを正確に狙わなくてもいいように、画面上でクリック位置に
// 一番近い（かつ CONFIG.pickRadiusPx 以内の）レモンを選ぶ。
// （クリックの受け付け自体は main.js でまとめて行う）
export class Harvester {
  constructor(camera, domElement, trees) {
    this.camera = camera;
    this.domElement = domElement;
    this.trees = trees;
  }

  pickRipeLemon(clientX, clientY) {
    const rect = this.domElement.getBoundingClientRect();
    const worldPos = new THREE.Vector3();
    let best = null;
    let bestDist = CONFIG.pickRadiusPx;

    for (const tree of this.trees) {
      for (const lemon of tree.lemons) {
        if (!lemon.isRipe) continue;

        // レモンの3D位置を、画面上のピクセル位置に変換する
        lemon.mesh.getWorldPosition(worldPos);
        const ndc = worldPos.clone().project(this.camera); // -1〜1 の座標
        if (ndc.z > 1) continue; // カメラの後ろにあるものは対象外
        const x = rect.left + (ndc.x + 1) / 2 * rect.width;
        const y = rect.top + (1 - ndc.y) / 2 * rect.height;

        const dist = Math.hypot(x - clientX, y - clientY);
        if (dist < bestDist) {
          best = lemon;
          bestDist = dist;
        }
      }
    }
    return best;
  }

  // まとめ収穫用：起点のレモンと、そこから3D空間で近い順に、成長しきったレモンを最大 count 個集める
  // （たいていは同じ木のレモンが選ばれる）
  gatherNearbyRipe(origin, count) {
    const originPos = origin.mesh.getWorldPosition(new THREE.Vector3());
    const candidates = [];
    for (const tree of this.trees) {
      for (const lemon of tree.lemons) {
        if (!lemon.isRipe || lemon === origin) continue;
        const dist = lemon.mesh.getWorldPosition(new THREE.Vector3()).distanceTo(originPos);
        candidates.push({ lemon, dist });
      }
    }
    candidates.sort((a, b) => a.dist - b.dist);
    return [origin, ...candidates.slice(0, count - 1).map((c) => c.lemon)];
  }
}
