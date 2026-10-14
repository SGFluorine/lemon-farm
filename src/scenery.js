import * as THREE from 'three';
import { CONFIG } from './config.js';
import { CELL } from './grid.js';
import { createGroundPattern } from './style.js';

// 土地のまわりの景色：外側の地面・川・崖（一段高い台地）・森・丘。
// どれも遊ぶ場所（土地を広げられる最大の範囲）の外側に置くので、ゲームの操作とはぶつからない。
//
// 配置（上から見た図。北が上）：
//     丘   丘        丘
//   ──台地（森）────────  ← 一段高い
//   ════ 崖の面 ════════
//   ～～～～ 川 ～～～～～
//   森 │ 土地（最大5×5区画）│ 森
//      │                    │
//           森（南）

const MAX_LAND = (CONFIG.land.maxRadius + 0.5) * CONFIG.land.plotCells * CELL; // 土地の最大の端（35メートル）
const RIVER = { north: -48, south: -41 }; // 川が流れる範囲（z）
const PLATEAU_EDGE = -50; // ここより北は一段高い台地
const PLATEAU_HEIGHT = 2.5; // 台地の高さ
const WORLD_HALF = 130; // 景色を作る範囲

export function createScenery(scene) {
  const scenery = new THREE.Group();
  scene.add(scenery);

  addOuterGround(scenery);
  const water = addRiver(scenery);
  addPlateau(scenery);
  addForest(scenery);
  addHills(scenery);

  // 川の模様を流す（毎フレーム呼ぶ）
  return {
    update(dt) {
      water.offset.x += dt * 0.03;
    },
  };
}

// 土地の外まで広がる地面。まだ買っていない区画の下にも見える
function addOuterGround(group) {
  const pattern = createGroundPattern();
  pattern.repeat.set(WORLD_HALF / 2.5, WORLD_HALF / 2.5);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_HALF * 2, WORLD_HALF * 2),
    new THREE.MeshToonMaterial({ color: 0x86c463, map: pattern }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.05; // 持っている土地（高さ0）より少しだけ下に敷く
  ground.receiveShadow = true;
  ground.userData.noOutline = true;
  group.add(ground);
}

// 川：水面（流れる縞模様）と、両岸の砂の帯
function addRiver(group) {
  const width = RIVER.south - RIVER.north;
  const centerZ = (RIVER.north + RIVER.south) / 2;

  const waterTexture = createWaterTexture();
  waterTexture.repeat.set(WORLD_HALF / 4, 1);
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_HALF * 2, width),
    new THREE.MeshToonMaterial({ color: 0xffffff, map: waterTexture }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -0.02, centerZ);
  water.userData.noOutline = true;
  group.add(water);

  // 両岸の砂の帯（手前の岸と、崖の足もと）
  const sand = new THREE.MeshToonMaterial({ color: 0xf0dca0 });
  for (const [z, w] of [[RIVER.south + 0.6, 1.2], [(RIVER.north + PLATEAU_EDGE) / 2, PLATEAU_EDGE - RIVER.north]]) {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_HALF * 2, Math.abs(w)), sand);
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(0, -0.01, z);
    strip.userData.noOutline = true;
    group.add(strip);
  }
  return waterTexture;
}

// 水の模様：水色の地に、明るい波線を何本か
function createWaterTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#7fd0f0';
  ctx.fillRect(0, 0, 64, 64);
  ctx.strokeStyle = '#c4ecfb';
  ctx.lineWidth = 3;
  for (const y of [14, 34, 52]) {
    ctx.beginPath();
    for (let x = 0; x <= 64; x += 4) ctx.lineTo(x, y + Math.sin((x / 64) * Math.PI * 2) * 3);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// 川の向こう岸の、一段高い台地。上は草、手前の面は土色の崖
function addPlateau(group) {
  const depth = WORLD_HALF + PLATEAU_EDGE; // 台地の奥行き（崖の面から、景色の北の端まで）
  const grass = new THREE.MeshToonMaterial({ color: 0x8fd16a });
  const earth = new THREE.MeshToonMaterial({ color: 0xc89a62 });
  // 箱の6面の材質：[右, 左, 上, 下, 手前, 奥]。上だけ草、ほかは土
  const plateau = new THREE.Mesh(
    new THREE.BoxGeometry(WORLD_HALF * 2, PLATEAU_HEIGHT, depth),
    [earth, earth, grass, earth, earth, earth],
  );
  plateau.position.set(0, PLATEAU_HEIGHT / 2 - 0.05, PLATEAU_EDGE - depth / 2);
  plateau.receiveShadow = true;
  group.add(plateau);

  // 崖の面に入れる横じま（地層のような段々）
  const stripe = new THREE.MeshToonMaterial({ color: 0xb4854f });
  for (const y of [0.7, 1.6]) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(WORLD_HALF * 2, 0.15, 0.1), stripe);
    line.position.set(0, y, PLATEAU_EDGE + 0.02);
    line.userData.noOutline = true;
    group.add(line);
  }
}

// 森：レモンではない木を、土地のまわりにたくさん並べる。
// 何百本もあるので、同じ形をまとめて1回で描く「インスタンス描画」を使う
function addForest(group) {
  const spots = [];
  const step = 5;
  for (let x = -90; x <= 90; x += step) {
    for (let z = -90; z <= 90; z += step) {
      const px = x + THREE.MathUtils.randFloatSpread(step * 0.7);
      const pz = z + THREE.MathUtils.randFloatSpread(step * 0.7);
      if (Math.max(Math.abs(px), Math.abs(pz)) < MAX_LAND + 4) continue; // 土地の近くには生やさない
      if (pz > RIVER.north - 2 && pz < RIVER.south + 2) continue; // 川の中には生やさない
      if (pz > PLATEAU_EDGE - 2 && pz <= RIVER.north - 2) continue; // 崖のすぐ下（砂浜）にも生やさない
      if (Math.random() < 0.25) continue; // ところどころ間をあけて、自然に見せる
      const y = pz < PLATEAU_EDGE ? PLATEAU_HEIGHT : 0; // 台地の上なら一段高く
      spots.push({ x: px, z: pz, y, scale: THREE.MathUtils.randFloat(0.8, 1.4), conifer: Math.random() < 0.35 });
    }
  }

  const round = spots.filter((s) => !s.conifer);
  const conifers = spots.filter((s) => s.conifer);

  // 幹（全部の木で共通）
  addInstances(group, new THREE.CylinderGeometry(0.3, 0.4, 2, 6), 0x8b5a2b, spots, (s, m) => {
    m.compose(new THREE.Vector3(s.x, s.y + s.scale, s.z), new THREE.Quaternion(), new THREE.Vector3(s.scale, s.scale, s.scale));
  });

  // 丸い木の葉（濃い緑。レモンの木と区別がつくように、少し暗めで色をばらつかせる）
  addInstances(group, new THREE.IcosahedronGeometry(1.8, 1), 0x4f9d4a, round, (s, m) => {
    m.compose(new THREE.Vector3(s.x, s.y + 2.8 * s.scale, s.z), new THREE.Quaternion(), new THREE.Vector3(s.scale, s.scale * 1.1, s.scale));
  }, [0x4f9d4a, 0x5aa850, 0x468f42, 0x63b05a]);

  // 針葉樹の葉（とんがった円すい）
  addInstances(group, new THREE.ConeGeometry(1.5, 4, 7), 0x3d8a4a, conifers, (s, m) => {
    m.compose(new THREE.Vector3(s.x, s.y + 3.4 * s.scale, s.z), new THREE.Quaternion(), new THREE.Vector3(s.scale, s.scale, s.scale));
  }, [0x3d8a4a, 0x357d42, 0x46955a]);
}

// 同じ形の物をたくさん並べる。place(場所, 行列) で1本ずつの位置・大きさを決める。colors があれば1本ずつ色を変える
function addInstances(group, geometry, color, spots, place, colors) {
  const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshToonMaterial({ color: 0xffffff }), spots.length);
  const matrix = new THREE.Matrix4();
  const tint = new THREE.Color();
  spots.forEach((spot, i) => {
    place(spot, matrix);
    mesh.setMatrixAt(i, matrix);
    tint.setHex(colors ? colors[i % colors.length] : color);
    mesh.setColorAt(i, tint);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = false; // 森は影を落とさない（遊ぶ場所の外なので、影の計算を増やさない）
  group.add(mesh);
}

// 森の奥のなだらかな丘（平たくつぶした大きな球）
function addHills(group) {
  const hills = [
    [-80, -95, 22], [-30, -105, 26], [25, -98, 20], [80, -100, 24],
    [-105, -30, 18], [105, 10, 20], [-100, 60, 22], [95, 75, 24], [-20, 100, 26], [45, 105, 20],
  ];
  const colors = [0x7cc35a, 0x86c963, 0x73b852];
  hills.forEach(([x, z, r], i) => {
    const hill = new THREE.Mesh(
      new THREE.SphereGeometry(r, 24, 12),
      new THREE.MeshToonMaterial({ color: colors[i % colors.length] }),
    );
    hill.scale.y = 0.35;
    const y = z < PLATEAU_EDGE ? PLATEAU_HEIGHT : 0;
    hill.position.set(x, y - r * 0.08, z);
    group.add(hill);
  });
}
