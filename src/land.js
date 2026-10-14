import * as THREE from 'three';
import { CONFIG } from './config.js';
import { CELL } from './grid.js';
import { createGroundPattern } from './style.js';

// 地面のうっすらした三角模様（全部の区画で使い回す。1区画に6×6回くり返す）
const GROUND_PATTERN = createGroundPattern();
GROUND_PATTERN.repeat.set(6, 6);

const PLOT_CELLS = CONFIG.land.plotCells;
const PLOT_SIZE = PLOT_CELLS * CELL; // 1区画の一辺の長さ（メートル）

// 持っている土地。世界を「区画」に分けて、どの区画を持っているかを管理し、地面を描く。
//
// 区画の番号 (px, pz) は、中心の区画が (0, 0)。
// 区画 (px, pz) には、マス x = 7px−3 〜 7px+3（z も同じ）の 7×7 マスが入る。
export class Land {
  constructor(scene) {
    this.owned = new Set(); // 持っている区画（"px,pz" の形の文字列）
    this.group = new THREE.Group();
    scene.add(this.group);

    const r = CONFIG.land.initialRadius;
    for (let px = -r; px <= r; px++) {
      for (let pz = -r; pz <= r; pz++) this.add(px, pz, { animate: false });
    }
  }

  // --- 区画とマス・位置の対応 ---

  // マスの番号から、そのマスが入っている区画の番号を求める
  static plotOfCell(c) {
    return Math.floor((c + PLOT_CELLS / 2) / PLOT_CELLS);
  }

  // 3D位置（メートル）から、そこがどの区画かを求める
  static plotOfPosition(v) {
    return Math.floor((v + PLOT_SIZE / 2) / PLOT_SIZE);
  }

  ownsPlot(px, pz) {
    return this.owned.has(`${px},${pz}`);
  }

  ownsCell(x, z) {
    return this.ownsPlot(Land.plotOfCell(x), Land.plotOfCell(z));
  }

  // その位置が持っている土地の上か。margin：端からこれだけ内側でないとダメ（木を端ぎりぎりに生やさないため）
  containsPoint(x, z, margin = 0) {
    const corners = [[x - margin, z - margin], [x + margin, z - margin], [x - margin, z + margin], [x + margin, z + margin]];
    return corners.every(([cx, cz]) => this.ownsPlot(Land.plotOfPosition(cx), Land.plotOfPosition(cz)));
  }

  // 区画の範囲（メートル）
  static plotRect(px, pz) {
    return {
      minX: px * PLOT_SIZE - PLOT_SIZE / 2,
      maxX: px * PLOT_SIZE + PLOT_SIZE / 2,
      minZ: pz * PLOT_SIZE - PLOT_SIZE / 2,
      maxZ: pz * PLOT_SIZE + PLOT_SIZE / 2,
    };
  }

  static plotCenter(px, pz) {
    return new THREE.Vector3(px * PLOT_SIZE, 0, pz * PLOT_SIZE);
  }

  // 持っている土地全体を囲む四角（カメラの動ける範囲や影の範囲に使う）
  bounds() {
    const rects = this.ownedPlots().map(([px, pz]) => Land.plotRect(px, pz));
    return {
      minX: Math.min(...rects.map((r) => r.minX)),
      maxX: Math.max(...rects.map((r) => r.maxX)),
      minZ: Math.min(...rects.map((r) => r.minZ)),
      maxZ: Math.max(...rects.map((r) => r.maxZ)),
    };
  }

  ownedPlots() {
    return [...this.owned].map((key) => key.split(',').map(Number));
  }

  // 持っている土地の、すべてのマス
  ownedCells() {
    const cells = [];
    const half = Math.floor(PLOT_CELLS / 2);
    for (const [px, pz] of this.ownedPlots()) {
      for (let dx = -half; dx <= half; dx++) {
        for (let dz = -half; dz <= half; dz++) cells.push({ x: px * PLOT_CELLS + dx, z: pz * PLOT_CELLS + dz });
      }
    }
    return cells;
  }

  // 次に買える区画：持っている区画の上下左右の隣で、まだ持っておらず、広げられる限界の内側にあるもの
  purchasablePlots() {
    const max = CONFIG.land.maxRadius;
    const result = new Map();
    for (const [px, pz] of this.ownedPlots()) {
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = px + dx;
        const nz = pz + dz;
        if (Math.abs(nx) > max || Math.abs(nz) > max || this.ownsPlot(nx, nz)) continue;
        result.set(`${nx},${nz}`, [nx, nz]);
      }
    }
    return [...result.values()];
  }

  // --- 区画を増やす ---

  // 区画を持っている土地に加え、地面を敷く。animate：true なら、地面がぐーんと広がる演出をする
  add(px, pz, { animate = true } = {}) {
    this.owned.add(`${px},${pz}`);

    // 区画ごとにほんの少し色を変えて、市松模様にする（区画の区切りが分かるように）
    const color = (px + pz) % 2 === 0 ? 0x8fd16a : 0x97d873;
    const tile = new THREE.Mesh(
      new THREE.PlaneGeometry(PLOT_SIZE, PLOT_SIZE),
      new THREE.MeshToonMaterial({ color, map: GROUND_PATTERN }),
    );
    tile.rotation.x = -Math.PI / 2; // 立っている板を寝かせて地面にする
    tile.position.copy(Land.plotCenter(px, pz));
    tile.receiveShadow = true;
    tile.userData.noOutline = true; // 地面には輪郭線を付けない
    if (animate) {
      tile.scale.setScalar(0.01);
      tile.userData.grow = 0;
    }
    this.group.add(tile);
  }

  // 地面が広がる演出を進める（毎フレーム呼ぶ）
  update(dt) {
    for (const tile of this.group.children) {
      if (tile.userData.grow === undefined || tile.userData.grow >= 1) continue;
      tile.userData.grow = Math.min(1, tile.userData.grow + dt / 0.5);
      tile.scale.setScalar(Math.max(0.01, tile.userData.grow));
    }
  }
}
