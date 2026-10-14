import * as THREE from 'three';
import { CONFIG } from './config.js';
import { Tree } from './tree.js';
import { createSkyTexture } from './style.js';

export const TREE_EDGE_MARGIN = 2.5; // 木を、土地の端からこれだけ内側に生やす

// 空・光・最初の木を作ってシーンに置く。地面は land.js が敷く。
// 戻り値：木の一覧と、太陽の光（土地が広がったら影の範囲を広げるため）
export function createWorld(scene, land) {
  scene.background = createSkyTexture(); // 上が濃い青、下が明るい水色の空
  // 遠くを少しかすませて、奥行きを出す。カメラは最大60メートル離れるので、それより遠くからかすませる
  scene.fog = new THREE.Fog(0xd8f0ff, 85, 190);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x88cc66, 1.2)); // 空（上）と地面（下）からの柔らかい光
  const sun = createSun();
  scene.add(sun, sun.target);
  fitShadowToLand(sun, land.bounds());

  // 最初の木：土地の上で、手前のコンベア用の帯（予約エリア）は避ける
  const trees = [];
  const accept = (x, z) => land.containsPoint(x, z, TREE_EDGE_MARGIN) && z < CONFIG.conveyorReservedZ - 3;
  for (let i = 0; i < CONFIG.treeCount; i++) {
    plantTree(scene, trees, { animate: false, area: land.bounds(), accept });
  }
  return { trees, sun };
}

// 太陽の光（影を落とす）
function createSun() {
  const sun = new THREE.DirectionalLight(0xffffff, 1.8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  return sun;
}

// 影を落とす範囲を、土地全体が入るように合わせる（土地が広がったら呼び直す）
export function fitShadowToLand(sun, bounds) {
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerZ = (bounds.minZ + bounds.maxZ) / 2;
  const half = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) / 2 + 2;

  sun.position.set(centerX + 15, 30, centerZ + 10);
  sun.target.position.set(centerX, 0, centerZ);
  Object.assign(sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, far: 120 });
  sun.shadow.camera.updateProjectionMatrix();
}

// 空いている場所に木を1本植えて、trees に加える。植えられた木を返す（空きがなければ null）。
// animate：true なら、地面からぽこっと生えてくる演出をする
// area：探す範囲（{ minX, maxX, minZ, maxZ }、メートル）
// accept(x, z)：その位置に植えてよいなら true（土地の上か、設備の近くでないか、など）
export function plantTree(scene, trees, { animate = true, area, accept = () => true }) {
  const position = findFreeTreePosition(trees, area, accept);
  if (!position) return null;

  const tree = new Tree(position.x, position.z, { animate });
  scene.add(tree.group);
  trees.push(tree);
  return tree;
}

// 空いている場所があるか（木を植えるボタンを押す前の確認用）
export function hasFreeTreeSpace(trees, area, accept = () => true) {
  return findFreeTreePosition(trees, area, accept) !== null;
}

// ほかの木と近すぎず、accept が OK を出す位置を探す。
// 範囲を1メートルずつ「すべて」調べて候補を集め、その中からランダムに1つ選ぶ。
// （ランダムに数回試すだけだと、空きがあるのに見つけられないことがあるため）
// 候補が1つもなければ null（もう空きがない）。
function findFreeTreePosition(trees, area, accept) {
  const candidates = [];
  for (let x = Math.ceil(area.minX); x <= area.maxX; x += 1) {
    for (let z = Math.ceil(area.minZ); z <= area.maxZ; z += 1) {
      const farEnough = trees.every(
        (t) => Math.hypot(t.group.position.x - x, t.group.position.z - z) >= CONFIG.treeMinDistance,
      );
      if (farEnough && accept(x, z)) candidates.push({ x, z });
    }
  }
  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}
