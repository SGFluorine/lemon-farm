import * as THREE from 'three';
import { CONFIG } from './config.js';

// 設備を置くための「マス目」の計算をまとめたもの。
// マスの座標は整数 (x, z) で、1マスの大きさは CONFIG.conveyor.cellSize。

// （どのマスが「持っている土地」かは land.js が管理する）
export const CELL = CONFIG.conveyor.cellSize;

// マスの中心の3D位置
export function cellCenter(x, z) {
  return new THREE.Vector3(x * CELL, 0, z * CELL);
}

// 3D位置から、いちばん近いマスを求める
export function worldToCell(position) {
  return { x: Math.round(position.x / CELL), z: Math.round(position.z / CELL) };
}

export function cellKey(x, z) {
  return `${x},${z}`;
}

// 1本のラインが使うマスの一覧。
// path（回収機＋コンベアのマス）に加えて、その先にできる「出口・箱・箱詰めマシーン」のマスも含める。
//   最後のマスの先：出口の受け皿 → 箱（2マス分）、箱の横：箱詰めマシーン
export function lineFootprint(path) {
  const [lastX, lastZ] = path[path.length - 1];
  const [prevX, prevZ] = path[path.length - 2];
  const dx = lastX - prevX; // 最後の向き
  const dz = lastZ - prevZ;
  const sideX = dz; // 向きに対して横（箱詰めマシーンが置かれる側）
  const sideZ = -dx;

  const exitCells = [
    [lastX + dx, lastZ + dz], // 出口の受け皿
    [lastX + 2 * dx, lastZ + 2 * dz], // 箱
    [lastX + 3 * dx, lastZ + 3 * dz], // 箱
    [lastX + 2 * dx + sideX, lastZ + 2 * dz + sideZ], // 箱詰めマシーン
  ];
  return { pathCells: path, exitCells };
}
