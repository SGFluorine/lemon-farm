import * as THREE from 'three';
import { createWorld, plantTree, hasFreeTreeSpace, fitShadowToLand, TREE_EDGE_MARGIN } from './world.js';
import { Land } from './land.js';
import { createScenery } from './scenery.js';
import { ExpandMode } from './expandMode.js';
import { setGoldBonus, updateLemonShine, createLemonMesh } from './lemon.js';
import { Tree } from './tree.js';
import { SAVE_VERSION, loadSave, writeSave, deleteSave } from './save.js';
import { boxMultiplier } from './packingStation.js';
import { Stats } from './stats.js';
import { MagicMachine } from './magicMachine.js';
import { createDevTools } from './devTools.js';
import { CameraControls } from './cameraControls.js';
import { Effects } from './effects.js';
import { FlyingLemon } from './flyingLemon.js';
import { Harvester } from './harvest.js';
import { Hand } from './hand.js';
import { Line } from './line.js';
import { BuildMode } from './buildMode.js';
import { PlaceMode } from './placeMode.js';
import { House } from './house.js';
import { CELL, cellCenter, cellKey, worldToCell } from './grid.js';
import { MoveMode } from './moveMode.js';
import { showFloatingText } from './floatingText.js';
import { sound } from './sound.js';
import { UpgradeShop } from './upgradeShop.js';
import { applyStyle, updateStyleAspect } from './style.js';
import { CONFIG } from './config.js';

// --- 描画の準備 ---
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap; // 影のふちを少しぼかして、やわらかく見せる
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 500);

// --- ゲームの中身を組み立てる ---
const land = new Land(scene); // 持っている土地（最初は3×3区画）
const { trees, sun } = createWorld(scene, land);
const scenery = createScenery(scene); // まわりの景色（川・崖・森・丘）
const cameraControls = new CameraControls(camera, renderer.domElement);
cameraControls.setBounds(land.bounds());
const effects = new Effects(scene, camera);
let flyingLemons = [];
let money = 0;

// --- ライン（回収機 → コンベア → 出口 → 箱）---
// 最初は1本。建設モードで増やせる。
const lines = [];

// アップグレードの効果のうち「全部のラインに効くもの」。後から作ったラインにもこの値を当てはめる
const lineUpgrades = {
  conveyorSpeed: CONFIG.conveyor.speed,
  collectorCapacity: CONFIG.capacity.collector,
  trayCapacity: CONFIG.capacity.exitTray,
  packingSpeed: 1,
  goldenChance: CONFIG.packing.goldenBox.chance,
  machineInterval: CONFIG.upgrades.packingMachine.interval,
  machineBatch: 1,
  machineEnabled: false,
};

// 箱詰めの合図（どのラインの箱でも同じ反応をする）
const packingHandlers = {
  onShip: (value, position, boxKind) => {
    money += value;
    stats.recordShipment(value);
    effects.burst(position, boxKind === 'rainbow' ? 'rainbow' : 'gold');
    const multiplier = boxMultiplier(boxKind);
    const bonusText = boxKind === 'normal' ? '' : `（×${multiplier}${boxKind === 'rainbow' ? '!!' : '!'}）`;
    showFloatingText(camera, position, `+¥${value.toLocaleString()}${bonusText}`);
    if (boxKind === 'rainbow') sound.jackpot(); // 虹の箱は大当たりの音
    else sound.ship();
  },
  onPlop: (index) => sound.plop(index),
  // 金の箱・虹の箱が来たら、キラキラと特別な音で知らせる
  onSpecialBox: (position, boxKind) => {
    if (boxKind === 'rainbow') {
      for (let i = 0; i < 3; i++) effects.burst(position, 'rainbow');
      sound.rainbowBox();
    } else {
      effects.burst(position, 'gold');
      effects.burst(position, 'gold');
      sound.goldenBox();
    }
  },
};

function addLine(path) {
  const line = new Line(path, packingHandlers);
  line.applyUpgrades(lineUpgrades);
  lines.push(line);
  scene.add(line.group);
  return line;
}

function applyUpgradesToAllLines() {
  for (const line of lines) line.applyUpgrades(lineUpgrades);
}

addLine(CONFIG.conveyor.path);

// 魔法のマシーンは、最初のラインのコンベアの途中にまたがって置く（買うまで見えない）。
// そのラインを撤去したら、残っているラインに付け替える
let magicLine = lines[0];
const magicMachine = new MagicMachine(magicLine.conveyor, {
  onConvert: (position) => {
    effects.burst(position, 'gold');
    sound.magic();
    stats.recordMagic();
  },
});
scene.add(magicMachine.group);

// --- 家と農家（収穫係）---
const houses = []; // { house, cell: [x, z] }。house.kind が 'house'（家）か 'farmer'（農家）

// kind：'house'（家）または 'farmer'（農家）。quiet：true なら、建てたときのエフェクトを出さない（読み込み用）
function addHouse(x, z, kind = 'house', { quiet = false } = {}) {
  const house = new House(cellCenter(x, z), { kind });
  houses.push({ house, cell: [x, z] });
  scene.add(house.group);
  if (!quiet) effects.burst(cellCenter(x, z).setY(1.5), 'normal');
  refreshAutoHarvestButton(); // 1人目の収穫係が来たら、ON・OFFボタンを出す
  return house;
}

const countOf = (kind) => houses.filter(({ house }) => house.kind === kind).length;

// 農家を立たせるマスを自動で選ぶ。
// 空いているマスのうち、「届く範囲の中に、まだほかの収穫係が届いていない木」が一番多いマスを選ぶ。
// （同じ点数なら、範囲内の木が多い方）。範囲内に木が1本もないマスは選ばない。見つからなければ null
function chooseFarmerCell() {
  const radius = houseHelpers.radius;
  const occupied = occupiedCells(); // 何百マスも調べるので、ふさがったマスの一覧は1回だけ作る
  const workerPositions = houses.map(({ house }) => house.group.position);
  const treePositions = trees.map((t) => t.group.position);
  const uncovered = treePositions.filter((p) => workerPositions.every((w) => w.distanceTo(p) > radius));

  let best = null;
  let bestScore = 0;
  for (const { x, z } of land.ownedCells()) {
    if (occupied.has(cellKey(x, z))) continue;
    const center = cellCenter(x, z);
    if (treePositions.some((p) => p.distanceTo(center) < TREE_CLEARANCE_FOR_BUILD)) continue; // 木の葉の下には立たない

    const inRange = (p) => p.distanceTo(center) <= radius;
    const score = uncovered.filter(inRange).length * 100 + treePositions.filter(inRange).length;
    if (score > bestScore) {
      best = { x, z };
      bestScore = score;
    }
  }
  return best;
}

// 「農家を増やす」ボタンを押せるか（置ける場所があるか）。重い計算なので1秒に1回だけ調べ直す
let farmerSpotCheck = { at: -Infinity, ok: true };
function hasFarmerSpot() {
  if (clock.elapsedTime - farmerSpotCheck.at > 1) {
    farmerSpotCheck = { at: clock.elapsedTime, ok: chooseFarmerCell() !== null };
  }
  return farmerSpotCheck.ok;
}

// --- マスの空き判定（建設モード・家・木を植えるときに使う）---

// 木の葉は幹から3メートルほど広がるので、設備と木はこれだけ離す（葉が設備に重ならないように）
const TREE_CLEARANCE_FOR_BUILD = 3.2; // 設備を置くとき：マスの中心と木の幹の距離
const TREE_CLEARANCE_FOR_PLANT = 3.6; // 木を植えるとき：木の幹と設備のマスの中心の距離

// 設備（全ラインの回収機・コンベア・出口・箱・箱詰めマシーン、家）が使っているマス
function structureCells() {
  return [...lines.flatMap((line) => line.footprint), ...houses.map((h) => h.cell)];
}

function occupiedCells() {
  return new Set(structureCells().map(([x, z]) => cellKey(x, z)));
}

// そのマスが、ふさがっているか（持っている土地の外・設備・木の近く）
function isCellBlocked(x, z) {
  if (!land.ownsCell(x, z)) return true;
  if (occupiedCells().has(cellKey(x, z))) return true;
  const center = cellCenter(x, z);
  return trees.some(
    (t) => Math.hypot(t.group.position.x - center.x, t.group.position.z - center.z) < TREE_CLEARANCE_FOR_BUILD,
  );
}

// 空いているマスをランダムに1つ選ぶ（開発者用の「全部解放」で家を自動で建てるのに使う）
function randomFreeCell() {
  const free = land.ownedCells().filter(({ x, z }) => !isCellBlocked(x, z));
  return free.length > 0 ? free[Math.floor(Math.random() * free.length)] : null;
}

// 木を植えてよい位置かの判定を作る：持っている土地の上で、設備のあるマスの近くではないこと。
// （木の候補地は何百か所も調べるので、設備のマスの一覧は最初に1回だけ作っておく）
function treeSpotChecker() {
  const centers = structureCells().map(([x, z]) => cellCenter(x, z));
  return (x, z) =>
    land.containsPoint(x, z, TREE_EDGE_MARGIN) && !centers.some((c) => Math.hypot(c.x - x, c.z - z) < TREE_CLEARANCE_FOR_PLANT);
}

// --- 土地を広げる ---
function expandLand(px, pz) {
  land.add(px, pz);
  // 新しい区画に木を何本か生やす
  const area = Land.plotRect(px, pz);
  const accept = treeSpotChecker();
  for (let i = 0; i < CONFIG.land.treesPerNewPlot; i++) plantTree(scene, trees, { area, accept });
  // カメラが動ける範囲と、影の範囲を広げる
  cameraControls.setBounds(land.bounds());
  fitShadowToLand(sun, land.bounds());
  effects.burst(Land.plotCenter(px, pz).setY(1), 'gold');
}

// --- アップグレード ---
let growthMultiplier = 1; // レモンが育つ速さの倍率

// 確率アップ系（金のレモン・金の箱・魔法）：レベルごとの上乗せ分。
// 「上限 maxBonus まで、残りの (1 − decay) ずつ近づく」ので、レベルが上がるほど伸びが小さくなる
function bonusAt(id, level) {
  const { maxBonus, decay } = CONFIG.upgrades[id];
  return maxBonus * (1 - Math.pow(decay, level));
}
const percent = (x) => `${(x * 100).toFixed(1)}%`;

// まとめ収穫：レベルに応じて、1クリックで投げられる個数（Lv.0 で1個）
let lemonsPerClick = 1;
// まとめ拾い：1クリックで出口から拾える個数（Lv.0 で1個）
let pickupsPerClick = 1;

const shop = new UpgradeShop({
  tryPay: (cost) => {
    if (money < cost) return false;
    money -= cost;
    return true;
  },
  blockedReason: (id) => {
    if (id === 'plantTree' && !hasFreeTreeSpace(trees, land.bounds(), treeSpotChecker())) return '空きがありません';
    if (id === 'expandLand' && land.purchasablePlots().length === 0) return 'これ以上広げられません';
    if (id === 'farmer' && !hasFarmerSpot()) return '置ける場所がありません';
    return null;
  },
  // 説明文に「今 → 次」の数字を出して、買うと何が変わるか分かるようにする
  describe: (id, level) => {
    const info = CONFIG.upgrades[id];
    // 「今 → 次」を作る。最大レベルなら、次はないので今の値だけ出す
    const maxed = level >= info.maxLevel;
    const change = (label, now, next) => (maxed ? `${label} ${now}` : `${label} ${now} → ${next}`);
    const chance = (label, base) =>
      change(label, percent(base + bonusAt(id, level)), percent(base + bonusAt(id, level + 1)));

    // 金の確率アップは虹にも効くので、虹の確率（金の1/10）も並べて出す
    if (id === 'goldChance') {
      const now = CONFIG.lemonTypes.gold.chance + bonusAt(id, level);
      return `${chance('金の確率', CONFIG.lemonTypes.gold.chance)}（虹 ${percent(now * CONFIG.lemonTypes.rainbow.chanceOfGold)}）`;
    }
    if (id === 'goldenBoxChance') {
      const now = CONFIG.packing.goldenBox.chance + bonusAt(id, level);
      return `${chance('金の箱', CONFIG.packing.goldenBox.chance)}（虹の箱 ${percent(now * CONFIG.packing.rainbowBox.chanceOfGolden)}）`;
    }
    if (id === 'magicChance') return chance('金に変わる確率', CONFIG.upgrades.magicMachine.chance);
    if (id === 'machineBatch') return change('マシーンが1回で', `${level + 1}個`, `${level + 2}個`);
    if (id === 'multiHarvest') return change('1クリックで', `${level + 1}個`, `${level + 2}個`);
    if (id === 'multiPickup') return change('出口で1クリック', `${level + 1}個`, `${level + 2}個`);
    if (id === 'collectorCapacity') {
      const now = lineUpgrades.collectorCapacity;
      return change('回収機の上限', `${now}個`, `${now + CONFIG.upgrades[id].amountPerLevel}個`);
    }
    if (id === 'trayCapacity') {
      const now = lineUpgrades.trayCapacity;
      return change('出口の上限', `${now}個`, `${now + CONFIG.upgrades[id].amountPerLevel}個`);
    }
    if (id === 'plantTree') return `空いている場所に木を1本（今 ${trees.length}本）`;
    if (id === 'house') return `収穫係が近くのレモンを自動で収穫（今 ${countOf('house')}軒）`;
    if (id === 'farmer') return `木の多い場所に自動で立つ（今 ${countOf('farmer')}人）`;
    if (id === 'workerSpeed') {
      const next = CONFIG.house.interval / (1 + info.bonusPerLevel * (level + 1));
      return change('収穫の間隔', `${houseHelpers.interval.toFixed(2)}秒`, `${next.toFixed(2)}秒`);
    }
    if (id === 'workerRange') {
      return change('届く範囲 半径', `${houseHelpers.radius}m`, `${houseHelpers.radius + info.amountPerLevel}m`);
    }
    if (id === 'expandLand') return `隣の区画を1つ買って広げる（今 ${land.owned.size}区画）`;
    return null;
  },
  // 家・土地：ボタンを押したら置き場所（広げる区画）を選び、選んだ時点でお金を払う
  onStartPlacement: (id, cost) => {
    cancelAllModes();
    if (id === 'expandLand') {
      expandMode.start({
        cost,
        onBuy: (px, pz) => {
          if (money < cost) {
            sound.blocked();
            showFloatingText(camera, Land.plotCenter(px, pz).setY(2), 'お金が足りません');
            return;
          }
          money -= cost;
          expandLand(px, pz);
          shop.confirmPurchase(id);
        },
      });
      return;
    }
    placeMode.start({
      label: `🏠 家を置くマスをクリック（¥${cost.toLocaleString()}）。円の中のレモンを収穫係が取ってくれる`,
      rangeRadius: houseHelpers.radius,
      onPlace: ({ x, z }) => {
        if (money < cost) {
          sound.blocked();
          showFloatingText(camera, cellCenter(x, z).setY(2), 'お金が足りません');
          return;
        }
        money -= cost;
        addHouse(x, z);
        shop.confirmPurchase(id);
      },
    });
  },
  onPurchased: (id, level, { silent = false } = {}) => {
    applyUpgradeEffect(id, level);

    // 買った瞬間に1回だけ起きる出来事（読み込みのときは起こさない）
    if (id === 'packingMachine') {
      for (const line of lines) effects.burst(line.machinePosition.clone().setY(1.5), 'silver');
    } else if (id === 'magicMachine') {
      effects.burst(magicMachine.group.position.clone().setY(2), 'gold');
    } else if (id === 'plantTree') {
      const tree = plantTree(scene, trees, { area: land.bounds(), accept: treeSpotChecker() });
      effects.burst(tree.group.position.clone().setY(1), 'normal');
    } else if (id === 'farmer') {
      // 木の多い場所を自動で選ぶ（万一見つからなければ、空いているマスならどこでも）
      const cell = chooseFarmerCell() ?? randomFreeCell();
      if (cell) addHouse(cell.x, cell.z, 'farmer');
      farmerSpotCheck.at = -Infinity; // 置ける場所が変わったので、次に調べ直す
    }
    if (!silent) sound.purchase();
  },
});

// アップグレードのレベルに合わせて、効果（速さ・確率・上限など）を反映する。
// 何度呼んでも同じ結果になる（買ったときにも、セーブデータを読み込んだときにも使う）。
// 木を植える・農家を立てるなど「物が増える」ものは、ここではなく onPurchased で行う
function applyUpgradeEffect(id, level) {
  const info = CONFIG.upgrades[id];
  if (id === 'conveyorSpeed') {
    lineUpgrades.conveyorSpeed = CONFIG.conveyor.speed * (1 + info.bonusPerLevel * level);
  } else if (id === 'growthSpeed') {
    growthMultiplier = 1 + info.bonusPerLevel * level;
  } else if (id === 'packingMachine') {
    lineUpgrades.machineEnabled = level > 0;
  } else if (id === 'machineSpeed') {
    lineUpgrades.machineInterval = CONFIG.upgrades.packingMachine.interval / (1 + info.bonusPerLevel * level);
  } else if (id === 'machineBatch') {
    lineUpgrades.machineBatch = 1 + level;
  } else if (id === 'goldChance') {
    setGoldBonus(bonusAt(id, level));
  } else if (id === 'goldenBoxChance') {
    lineUpgrades.goldenChance = CONFIG.packing.goldenBox.chance + bonusAt(id, level);
  } else if (id === 'magicMachine') {
    if (level > 0 && !magicMachine.enabled) magicMachine.enable();
  } else if (id === 'magicChance') {
    magicMachine.chance = CONFIG.upgrades.magicMachine.chance + bonusAt(id, level);
  } else if (id === 'multiHarvest') {
    lemonsPerClick = 1 + level;
  } else if (id === 'multiPickup') {
    pickupsPerClick = 1 + level;
  } else if (id === 'packingSpeed') {
    lineUpgrades.packingSpeed = 1 + info.bonusPerLevel * level;
  } else if (id === 'collectorCapacity') {
    lineUpgrades.collectorCapacity = CONFIG.capacity.collector + info.amountPerLevel * level;
  } else if (id === 'trayCapacity') {
    lineUpgrades.trayCapacity = CONFIG.capacity.exitTray + info.amountPerLevel * level;
  } else if (id === 'workerSpeed') {
    houseHelpers.interval = CONFIG.house.interval / (1 + info.bonusPerLevel * level);
  } else if (id === 'workerRange') {
    houseHelpers.radius = CONFIG.house.radius + info.amountPerLevel * level;
  }
  applyUpgradesToAllLines();
}

const stats = new Stats();

// 開発者用ボタン（URLに ?dev を付けたときだけ表示）
createDevTools({
  onUnlockAll: () => {
    shop.unlockAll();
    // 土地は広げる区画を選ぶ必要があるので、買える区画を順に自動で買う
    while (!shop.isMaxed('expandLand') && land.purchasablePlots().length > 0) {
      const [px, pz] = land.purchasablePlots()[0];
      expandLand(px, pz);
      shop.confirmPurchase('expandLand', { silent: true });
    }
    // 家は置き場所が必要なので、空いているマスに自動で建てる
    while (!shop.isMaxed('house')) {
      const cell = randomFreeCell();
      if (!cell) break;
      addHouse(cell.x, cell.z);
      shop.confirmPurchase('house', { silent: true });
    }
    // 家や土地のあとにつながっているノード（農家など）を解放するため、もう一度まとめて上げる
    shop.unlockAll();
    sound.purchase(); // まとめて1回だけ鳴らす
  },
  onAddMoney: (amount) => {
    money += amount;
  },
  sounds: {
    虹のレモン: () => sound.rainbowLemon(),
    虹の箱: () => sound.rainbowBox(),
    大当たり出荷: () => sound.jackpot(),
  },
});

// --- 建設モード ---
const buildMode = new BuildMode({
  scene,
  camera,
  domElement: renderer.domElement,
  getMoney: () => money,
  spend: (amount) => {
    money -= amount;
  },
  isBlocked: isCellBlocked,
  onBuild: (path) => {
    const line = addLine(path);
    effects.burst(line.collector.entryPoint, 'gold');
    effects.burst(line.boxPosition.clone().setY(1.5), 'gold');
    sound.purchase();
  },
  onError: (message) => {
    sound.blocked();
    showFloatingText(camera, cameraControls.target.clone().setY(2), message);
  },
});

// 1マスを選んで置くモード（家に使う）
const placeMode = new PlaceMode({ scene, camera, domElement: renderer.domElement, isBlocked: isCellBlocked });

// 土地を広げる区画を選ぶモード
const expandMode = new ExpandMode({ scene, camera, domElement: renderer.domElement, land });

const hand = new Hand();
const harvester = new Harvester(camera, renderer.domElement, trees);

// --- 動かす・撤去モード（木・農家を動かす、ラインを撤去する）---
const moveMode = new MoveMode({
  scene,
  camera,
  domElement: renderer.domElement,
  pickAt: pickMovable,
  placementAt: movePlacement,
  onMove: moveObject,
  onRemoveLine: removeLine,
  describeLine: (line) => {
    const lemons = line.remainingLemons().length;
    return `このラインを撤去すると ¥${line.buildCost.toLocaleString()} 戻ってきます。` +
      `中のレモン${lemons}個は、手に持った状態になります`;
  },
  onError: (message) => {
    sound.blocked();
    showFloatingText(camera, cameraControls.target.clone().setY(2), message);
  },
});

// 建設・家・土地・動かすのモードは、同時には使えないようにする（新しく始めるときに、ほかを閉じる）
function cancelAllModes() {
  buildMode.cancel();
  placeMode.cancel();
  expandMode.cancel();
  moveMode.cancel();
}
buildMode.button.addEventListener('click', () => {
  placeMode.cancel();
  expandMode.cancel();
  moveMode.cancel();
});
moveMode.button.addEventListener('click', () => {
  buildMode.cancel();
  placeMode.cancel();
  expandMode.cancel();
});
const anyModeActive = () => buildMode.active || placeMode.active || expandMode.active || moveMode.active;

// 動かす・撤去モードで、クリックした場所の物を探す（木・農家・ラインのうち、一番手前にあるもの）
function pickMovable(e) {
  pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);

  const candidates = [
    ...trees.map((tree) => ({ kind: 'tree', object: tree, root: tree.group })),
    ...houses
      .filter(({ house }) => house.kind === 'farmer') // 家は動かせない
      .map((entry) => ({ kind: 'farmer', object: entry, root: entry.house.group })),
    ...lines.map((line) => ({ kind: 'line', object: line, root: line.group })),
  ];
  let best = null;
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    const hit = raycaster.intersectObject(candidate.root, true)[0];
    if (hit && hit.distance < bestDistance) {
      best = candidate;
      bestDistance = hit.distance;
    }
  }
  if (!best) return null;
  const position = best.kind === 'line' ? best.object.collector.group.position : best.root.position;
  return { kind: best.kind, object: best.object, position: position.clone() };
}

// 持ち上げている物を、地面のその位置に置けるか
function movePlacement(target, point) {
  if (target.kind === 'tree') {
    // 木：1メートル単位にそろえ、土地の上で、設備から離れていて、ほかの木から十分離れていればOK
    const x = Math.round(point.x);
    const z = Math.round(point.z);
    const farFromTrees = trees.every(
      (t) => t === target.object || Math.hypot(t.group.position.x - x, t.group.position.z - z) >= CONFIG.treeMinDistance,
    );
    return { position: new THREE.Vector3(x, 0, z), ok: farFromTrees && treeSpotChecker()(x, z) };
  }
  // 農家：マスにそろえ、空いているマスならOK（今いるマスでもOK）
  const { x, z } = worldToCell(point);
  const [ownX, ownZ] = target.object.cell;
  const ok = (x === ownX && z === ownZ) || !isCellBlocked(x, z);
  return { position: cellCenter(x, z), ok, cell: [x, z] };
}

function moveObject(target, placement) {
  if (target.kind === 'tree') {
    target.object.group.position.copy(placement.position);
  } else {
    target.object.cell = placement.cell;
    target.object.house.group.position.copy(placement.position);
    farmerSpotCheck.at = -Infinity; // 置ける場所が変わったので、次に調べ直す
  }
  effects.burst(placement.position.clone().setY(1), 'normal');
  sound.pickup();
}

// ラインを撤去する。撤去できないときは理由を返す
function removeLine(line) {
  if (lines.length <= 1) return '最後の1本は撤去できません';
  if (line.collector.incoming > 0) return 'レモンが飛んでいる途中です。少し待ってください';

  // 中に残っていたレモンは、消さずに手に持たせる
  for (const type of line.remainingLemons()) hand.add(type);
  money += line.buildCost; // 建てたときのお金を全額戻す

  lines.splice(lines.indexOf(line), 1);
  scene.remove(line.group);
  line.dispose();

  // 魔法のマシーンが付いていたラインなら、残っているラインに付け替える
  if (magicLine === line) {
    magicLine = lines[0];
    magicMachine.attachTo(magicLine.conveyor);
  }

  effects.burst(line.collector.entryPoint, 'silver');
  showFloatingText(camera, line.collector.entryPoint.clone().setY(3), `撤去 +¥${line.buildCost.toLocaleString()}`);
  sound.ship();
  return null;
}

// 開発者用：?dev のときだけ、ブラウザの開発者ツールからゲームの中身を確認・操作できるようにする
if (new URLSearchParams(location.search).has('dev')) {
  window.lemonGame = {
    lines, trees, houses, land, buildMode, placeMode, expandMode, moveMode, isCellBlocked, harvestFromClick,
    pickMovable, movePlacement, moveObject, removeLine,
    getMoney: () => money,
  };
}

// --- クリックの受け付け ---
// クリックした場所にあるものを、「箱 → 出口の受け皿 → 木のレモン」の順に調べ、
// 最初に見つかったものに対して操作する。（建設モード中は建設の操作だけを受け付ける）
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function findClickTarget(e) {
  // クリック位置から3D空間に「光線」を飛ばし、当たったものを調べる
  pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hits = (object) => raycaster.intersectObject(object, true).length > 0;

  for (const line of lines) {
    if (hand.types.length > 0 && hits(line.packing.group)) return { kind: 'box', line };
    if (line.exitTray.items.length > 0 && hits(line.exitTray.group)) return { kind: 'tray', line };
  }
  const lemon = harvester.pickRipeLemon(e.clientX, e.clientY);
  if (lemon) return { kind: 'lemon', lemon };
  return null;
}

renderer.domElement.addEventListener('pointerdown', (e) => {
  if (anyModeActive() || e.button !== 0) return; // 左クリックだけ
  const target = findClickTarget(e);
  if (!target) return;

  if (target.kind === 'box') {
    target.line.packing.insert(hand.releaseAll());
  } else if (target.kind === 'tray') {
    // まとめ拾い：上から順に、最大 pickupsPerClick 個まで拾う
    const tray = target.line.exitTray;
    const count = Math.min(pickupsPerClick, tray.items.length);
    for (let i = 0; i < count; i++) hand.add(tray.takeTop());
    sound.pickup();
  } else if (target.kind === 'lemon') {
    harvestFromClick(target.lemon);
  }
});

// 操作できるものの上では、カーソルを指の形にする
renderer.domElement.addEventListener('pointermove', (e) => {
  if (anyModeActive()) {
    renderer.domElement.style.cursor = 'crosshair';
    return;
  }
  renderer.domElement.style.cursor = findClickTarget(e) ? 'pointer' : 'default';
});

// --- 収穫：レモンを回収機へ飛ばす ---
const worldPos = new THREE.Vector3();

// そのレモンの位置から一番近い、空きのある回収機を探す（どこも空いていなければ null）
function nearestCollectorWithSpace(position) {
  let best = null;
  let bestDist = Infinity;
  for (const { collector } of lines) {
    if (collector.load >= collector.capacity) continue;
    const dist = collector.entryPoint.distanceTo(position);
    if (dist < bestDist) {
      best = collector;
      bestDist = dist;
    }
  }
  return best;
}

// クリックで収穫：まとめ収穫なら、近くの成長しきったレモンも集めて順番に投げる
function harvestFromClick(clickedLemon) {
  const lemons = harvester.gatherNearbyRipe(clickedLemon, lemonsPerClick);
  const types = [];
  for (const lemon of lemons) {
    lemon.mesh.getWorldPosition(worldPos);
    const collector = nearestCollectorWithSpace(worldPos);
    if (!collector) break; // どの回収機もいっぱい
    types.push(harvest(lemon, collector, types.length * 0.08));
  }

  if (types.length === 0) {
    warnCollectorsFull(worldPos);
    return;
  }
  // 音は1回だけ。一番レアなレモンの音を鳴らす
  const rarest = ['rainbow', 'gold', 'silver'].find((t) => types.includes(t)) ?? 'normal';
  sound.harvest(rarest);
}

// レモン1個を、指定した回収機へ飛ばす。
// delay：何秒後に飛び始めるか（まとめ収穫で順番に飛ばすため）
// 戻り値：収穫したレモンの種類
function harvest(lemon, collector, delay = 0) {
  const type = lemon.type; // 育ち直す前に種類を覚えておく
  lemon.mesh.getWorldPosition(worldPos);

  effects.burst(worldPos, type);
  stats.recordHarvest(type);
  collector.incoming += 1; // 飛んでいる途中も、回収機の上限に数える
  flyingLemons.push(new FlyingLemon(scene, {
    type,
    from: worldPos,
    to: collector.entryPoint,
    delay,
    onArrive: () => {
      collector.incoming -= 1;
      collector.receive(type);
      effects.puff(collector.entryPoint);
      sound.arrive();
    },
  }));

  lemon.regrow(); // 木の方は、同じ場所で小さい状態から育ち直す
  return type;
}

// --- 収穫係（家）の自動収穫 ---

// 指定した位置から半径 radius 以内で、一番近い成長しきったレモンを探す（なければ null）
function findRipeLemonNear(position, radius) {
  let best = null;
  let bestDist = radius;
  for (const tree of trees) {
    // 木そのものが範囲から大きく外れていれば、その木のレモンは調べない
    if (tree.group.position.distanceTo(position) > radius + 3) continue;
    for (const lemon of tree.lemons) {
      if (!lemon.isRipe) continue;
      const dist = lemon.mesh.getWorldPosition(worldPos).setY(0).distanceTo(position);
      if (dist <= bestDist) {
        best = lemon;
        bestDist = dist;
      }
    }
  }
  return best;
}

// 収穫係がレモンを1個収穫する。空きのある回収機がなければ false（あとでまた試す）
function tryAutoHarvest(lemon) {
  lemon.mesh.getWorldPosition(worldPos);
  const collector = nearestCollectorWithSpace(worldPos);
  if (!collector) return false;
  const type = harvest(lemon, collector);
  // 収穫係が取ったときは控えめな音。ただし虹のレモンだけは、手で取ったときと同じ派手な音
  if (type === 'rainbow') sound.rainbowLemon();
  else sound.autoHarvest();
  return true;
}

// 家と農家の収穫係みんなに渡す情報。interval（収穫の間隔）と radius（届く範囲）はアップグレードで変わる
const houseHelpers = {
  findRipeLemon: findRipeLemonNear,
  tryHarvest: tryAutoHarvest,
  enabled: true,
  interval: CONFIG.house.interval,
  radius: CONFIG.house.radius,
};

// 自動収穫のON・OFFボタン（家を1軒以上建てたら表示する）。すべての家の収穫係に効く
const autoHarvestButton = document.createElement('button');
autoHarvestButton.id = 'auto-harvest-button';
autoHarvestButton.hidden = true;
document.body.appendChild(autoHarvestButton);

function refreshAutoHarvestButton() {
  autoHarvestButton.hidden = houses.length === 0;
  autoHarvestButton.textContent = `👨‍🌾 自動収穫：${houseHelpers.enabled ? 'ON' : 'OFF'}`;
  autoHarvestButton.classList.toggle('off', !houseHelpers.enabled);
}

autoHarvestButton.addEventListener('click', () => {
  houseHelpers.enabled = !houseHelpers.enabled;
  refreshAutoHarvestButton();
  sound.pickup();
});

// --- 左下のメニュー ---
// 「🛠 メニュー」を押すと、ラインを作る・動かす・自動収穫の3つのボタンが展開する
const actionMenu = document.createElement('div');
actionMenu.id = 'action-menu';
actionMenu.innerHTML = '<button id="menu-toggle">🛠 メニュー</button><div class="menu-items"></div>';
actionMenu.querySelector('.menu-items').append(buildMode.button, moveMode.button, autoHarvestButton);
document.body.appendChild(actionMenu);
actionMenu.querySelector('#menu-toggle').addEventListener('click', () => {
  actionMenu.classList.toggle('open');
});

// --- いっぱいの警告 ---

// どの回収機もいっぱいで収穫できなかったとき：一番近い回収機が震え、ブザーと文字で知らせる
function warnCollectorsFull(position) {
  const nearest = lines
    .map((l) => l.collector)
    .reduce((a, b) => (a.entryPoint.distanceTo(position) <= b.entryPoint.distanceTo(position) ? a : b));
  nearest.shake();
  sound.blocked();
  showFloatingText(camera, nearest.entryPoint.clone().setY(4), '回収機がいっぱい！');
}

// 「8/10」のような表示を、空きの具合に合わせて色分けする（8割でオレンジ、満杯で赤く点滅）
function capacityText(count, capacity) {
  const level = count >= capacity ? 'full' : count >= capacity * CONFIG.capacity.warnRatio ? 'warn' : '';
  return `<span class="cap ${level}">${count}/${capacity}</span>`;
}

// --- 画面表示 ---
const hud = document.getElementById('hud');
const moneyLabel = document.getElementById('money');
let lastHudHtml = '';
function updateHud() {
  // 全ラインの合計を表示する
  const sum = (fn) => lines.reduce((total, line) => total + fn(line), 0);
  const collectorLoad = sum((l) => l.collector.load);
  const collectorCapacity = sum((l) => l.collector.capacity);
  const onBelts = sum((l) => l.conveyor.items.length);
  const trayCount = sum((l) => l.exitTray.items.length);
  const trayCapacity = sum((l) => l.exitTray.capacity);
  const jammed = lines.some((l) => l.jammed);
  const lineText = lines.length > 1 ? `ライン${lines.length}本：` : '';

  const html =
    `${lineText}回収機 ${capacityText(collectorLoad, collectorCapacity)}` +
    ` → コンベア ${onBelts}個${jammed ? ' <span class="cap full">渋滞中</span>' : ''}` +
    ` → 出口 ${capacityText(trayCount, trayCapacity)}`;
  // 毎フレーム書き換えると点滅アニメーションが最初からやり直しになるので、変わったときだけ書き換える
  if (html !== lastHudHtml) {
    hud.innerHTML = html;
    lastHudHtml = html;
  }
  moneyLabel.textContent = `¥${money.toLocaleString()}`;

  // 満杯の札と、「これを買えば解決」のボタンの光
  for (const line of lines) line.updateLabels(camera);
  shop.setHint('collectorCapacity', lines.some((l) => l.collectorFull));
  shop.setHint('trayCapacity', lines.some((l) => l.exitTray.isFull));
  shop.refresh(money);
  buildMode.refresh();
  expandMode.update();
}

// --- レアなレモンのキラキラ ---
// 金・銀・虹のレモンのまわりに、ときどき小さな「キラッ」を出す（レアなほど多く）。
// 毎フレームだと多すぎるので、0.12秒ごとにまとめて判定する
const SPARKLE = {
  silver: { chance: 0.12, color: () => 0xffffff },
  gold: { chance: 0.22, color: () => 0xffe23d },
  rainbow: { chance: 0.5, color: () => new THREE.Color().setHSL(Math.random(), 0.9, 0.65).getHex() }, // 毎回ちがう色
};
let sparkleTimer = 0;
const sparklePos = new THREE.Vector3();

function sparkleRareLemons(dt) {
  sparkleTimer -= dt;
  if (sparkleTimer > 0) return;
  sparkleTimer = 0.12;

  const visit = (mesh, type) => {
    const sparkle = SPARKLE[type];
    if (!sparkle || Math.random() > sparkle.chance) return;
    mesh.getWorldPosition(sparklePos);
    // レモンのまわりの、少しずれた場所に出す
    sparklePos.x += THREE.MathUtils.randFloatSpread(0.8);
    sparklePos.y += THREE.MathUtils.randFloat(0, 0.6);
    sparklePos.z += THREE.MathUtils.randFloatSpread(0.8);
    effects.twinkle(sparklePos, sparkle.color());
  };

  // 木になっているもの（ある程度育ってから）・コンベアの上・出口・箱の中
  for (const tree of trees) {
    for (const lemon of tree.lemons) if (lemon.growth > 0.5) visit(lemon.mesh, lemon.type);
  }
  for (const line of lines) {
    for (const item of line.conveyor.items) visit(item.mesh, item.type);
    for (const item of line.exitTray.items) visit(item.mesh, item.type);
    for (const item of line.packing.contents) visit(item.mesh, item.type);
  }
}

// ウィンドウの大きさが変わったら、描画サイズを合わせる
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  updateStyleAspect(camera.aspect);
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- セーブ（ブラウザに保存して、次に開いたとき続きから遊べるようにする）---

// 今のゲームの状態を、保存できる形（数字と文字だけのデータ）にまとめる
function collectSaveData() {
  return {
    version: SAVE_VERSION,
    savedAt: Date.now(),
    money,
    levels: { ...shop.levels },
    land: land.ownedPlots(),
    trees: trees.map((tree) => ({
      x: tree.group.position.x,
      z: tree.group.position.z,
      lemons: tree.lemons.map((l) => ({ type: l.type, growth: Math.round(l.growth * 100) / 100 })),
    })),
    lines: lines.map((line) => ({
      path: line.path,
      // ベルトの上のレモンは、読み込んだら回収機からもう一度流す
      collector: [...line.collector.queue, ...line.conveyor.items.map((item) => item.type)],
      tray: line.exitTray.items.map((item) => item.type),
      box: [
        ...line.packing.pending,
        ...line.packing.hopping.map((h) => h.type),
        ...line.packing.contents.map((c) => c.type),
      ],
    })),
    magicLine: lines.indexOf(magicLine),
    houses: houses.map(({ house, cell }) => ({ x: cell[0], z: cell[1], kind: house.kind })),
    stats: stats.toJSON(),
    // 飛んでいる途中のレモンは、手に持った状態にして保存する
    hand: [...hand.types, ...flyingLemons.map((f) => f.type)],
    autoHarvest: houseHelpers.enabled,
  };
}

// 保存したデータから、ゲームの状態を組み立て直す（ページを開いたときに1回だけ呼ぶ）
function applySaveData(data) {
  // 土地
  for (const [px, pz] of data.land) {
    if (!land.ownsPlot(px, pz)) land.add(px, pz, { animate: false });
  }
  cameraControls.setBounds(land.bounds());
  fitShadowToLand(sun, land.bounds());

  // 木：最初に生えた木を片付けて、保存した木に置き換える（なっていたレモンの種類と育ち具合も戻す）
  for (const tree of trees) scene.remove(tree.group);
  trees.length = 0;
  for (const saved of data.trees) {
    const tree = new Tree(saved.x, saved.z, { lemonCount: saved.lemons.length });
    saved.lemons.forEach((lemon, i) => tree.lemons[i]?.restore(lemon.type, lemon.growth));
    scene.add(tree.group);
    trees.push(tree);
  }

  // ライン：最初のラインを片付けて、保存したラインに置き換える（中にあったレモンも戻す）
  for (const line of lines) {
    scene.remove(line.group);
    line.dispose();
  }
  lines.length = 0;
  for (const saved of data.lines) {
    const line = addLine(saved.path);
    line.collector.queue.push(...saved.collector);
    for (const type of saved.tray) line.exitTray.add(type, createLemonMesh(type));
    line.packing.insert(saved.box);
  }
  magicLine = lines[data.magicLine] ?? lines[0];
  magicMachine.attachTo(magicLine.conveyor);

  // 家・農家
  for (const h of data.houses) addHouse(h.x, h.z, h.kind, { quiet: true });

  // アップグレード：レベルを戻して、効果を反映する（木や農家は上で戻したので、増やさない）
  for (const [id, level] of Object.entries(data.levels)) {
    if (!(id in shop.levels)) continue; // 今はもうないアップグレードは飛ばす
    shop.levels[id] = level;
    applyUpgradeEffect(id, level);
  }

  money = data.money;
  stats.restore(data.stats);
  for (const type of data.hand) hand.add(type);
  houseHelpers.enabled = data.autoHarvest ?? true;
  refreshAutoHarvestButton();
}

let savingEnabled = true; // 「最初からやり直す」のあとは、ページを閉じるときに保存しない
function saveGame() {
  if (savingEnabled) writeSave(collectSaveData());
}

// 保存データがあれば、続きから始める
const savedData = loadSave();
if (savedData) applySaveData(savedData);

// 10秒ごと、タブを切り替えたとき、ページを閉じるときに自動で保存する
setInterval(saveGame, 10000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') saveGame();
});
window.addEventListener('pagehide', saveGame);

// 左下のメニューに「最初からやり直す」を追加（確認つき）
const resetButton = document.createElement('button');
resetButton.id = 'reset-button';
resetButton.textContent = '🗑 最初からやり直す';
resetButton.addEventListener('click', () => {
  if (!window.confirm('セーブデータを消して、最初からやり直しますか？（元に戻せません）')) return;
  savingEnabled = false;
  deleteSave();
  location.reload();
});
// メニューは下から上へ並ぶので、最後に追加すると、いちばん上（間違って押しにくい場所）に来る
actionMenu.querySelector('.menu-items').append(resetButton);

// --- メインループ：毎フレーム「状態を進める → 描画する」 ---
const clock = new THREE.Clock();
function loop() {
  // タブを裏に回していた後などに大きな値が来ないよう、上限をつける
  const dt = Math.min(clock.getDelta(), 0.1);

  for (const tree of trees) tree.update(dt * growthMultiplier); // 成長速度アップは「時間を早送り」する形で効かせる
  flyingLemons = flyingLemons.filter((f) => !f.update(dt)); // 到着したものは一覧から外す
  land.update(dt);
  scenery.update(dt);
  for (const line of lines) line.update(dt);
  for (const { house } of houses) house.update(dt, houseHelpers);
  magicMachine.update(dt, magicLine.conveyor);
  updateLemonShine(clock.elapsedTime);
  sparkleRareLemons(dt);
  effects.update(dt);
  updateHud();
  cameraControls.update(dt);

  applyStyle(scene); // 新しく出てきた物に、陰影と輪郭線を付ける
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
loop();
