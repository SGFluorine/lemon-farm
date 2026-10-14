import * as THREE from 'three';
import { CONFIG } from './config.js';
import { CELL, cellCenter, worldToCell, lineFootprint } from './grid.js';

const OK_COLOR = 0x66dd66; // 置けるマス
const NG_COLOR = 0xff5555; // 置けないマス

// 建設モード：新しいライン（回収機 → コンベア → 出口・箱）を、マス目をクリックして作る。
//
// 流れ：
//   「🏗 ラインを作る」→ ①回収機のマスをクリック → ②隣のマスを順にクリックしてコンベアを延ばす
//   →「完成」でお金を払って建てる（最後のマスの先に、出口・箱が自動でつく）
// 右クリックで1マス戻す、Esc か「キャンセル」でやめる。
export class BuildMode {
  // getMoney()：今の所持金、spend(金額)：お金を払う
  // isBlocked(x, z)：そのマスが木や設備でふさがっているか（持っている土地の外も、ふさがり扱い）
  // onBuild(path)：完成したときに呼ばれる（path はマスの並び）
  // onError(メッセージ)：建てられない理由を知らせる
  constructor({ scene, camera, domElement, getMoney, spend, isBlocked, onBuild, onError }) {
    Object.assign(this, { camera, domElement, getMoney, spend, isBlocked, onBuild, onError });
    this.state = 'off'; // 'off'（使っていない）/ 'collector'（回収機を置く）/ 'belt'（コンベアを延ばす）
    this.path = [];

    // 置く場所の見本（半透明の箱）
    this.ghosts = new THREE.Group();
    this.ghosts.visible = false;
    this.hoverGhost = createGhost(0.3);
    this.pathGhosts = new THREE.Group();
    this.ghosts.add(this.hoverGhost, this.pathGhosts);
    scene.add(this.ghosts);

    this.raycaster = new THREE.Raycaster();
    this.ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    this.createUi();

    domElement.addEventListener('pointermove', (e) => this.onPointerMove(e));
    domElement.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    domElement.addEventListener('contextmenu', (e) => {
      if (this.active) e.preventDefault(); // 右クリックのメニューを出さない
    });
    window.addEventListener('keydown', (e) => {
      if (this.active && e.code === 'Escape') this.cancel();
    });
  }

  get active() {
    return this.state !== 'off';
  }

  createUi() {
    this.button = document.createElement('button');
    this.button.id = 'build-button';
    this.button.textContent = '🏗 ラインを作る';
    this.button.addEventListener('click', () => (this.active ? this.cancel() : this.start()));
    document.body.appendChild(this.button);

    this.panel = document.createElement('div');
    this.panel.id = 'build-panel';
    this.panel.hidden = true;
    this.panel.innerHTML = `
      <div class="build-step"></div>
      <div class="build-buttons">
        <button data-action="finish">完成</button>
        <button data-action="cancel">キャンセル</button>
      </div>`;
    document.body.appendChild(this.panel);
    this.panel.querySelector('[data-action="finish"]').addEventListener('click', () => this.finish());
    this.panel.querySelector('[data-action="cancel"]').addEventListener('click', () => this.cancel());
  }

  start() {
    this.state = 'collector';
    this.path = [];
    this.ghosts.visible = true;
    this.panel.hidden = false;
    this.button.textContent = '✖ 建設をやめる';
    this.redraw();
  }

  cancel() {
    this.state = 'off';
    this.path = [];
    this.ghosts.visible = false;
    this.panel.hidden = true;
    this.button.textContent = '🏗 ラインを作る';
    this.redraw();
  }

  // --- マスの判定 ---

  // マウスの位置から、指している地面のマスを求める
  cellAt(e) {
    const pointer = new THREE.Vector2(
      (e.clientX / window.innerWidth) * 2 - 1,
      -(e.clientY / window.innerHeight) * 2 + 1,
    );
    this.raycaster.setFromCamera(pointer, this.camera);
    const hit = this.raycaster.ray.intersectPlane(this.ground, new THREE.Vector3());
    return hit ? worldToCell(hit) : null;
  }

  isInPath(x, z) {
    return this.path.some(([px, pz]) => px === x && pz === z);
  }

  // そのマスに、次の1マスを置けるか
  canPlaceNext(x, z) {
    if (this.isBlocked(x, z) || this.isInPath(x, z)) return false; // 土地の外も isBlocked でふさがり扱い
    if (this.state === 'collector') return true;
    // コンベアは、最後に置いたマスの上下左右の隣だけ
    const [lastX, lastZ] = this.path[this.path.length - 1];
    return Math.abs(lastX - x) + Math.abs(lastZ - z) === 1;
  }

  // 最後のマスの先に、出口・箱・箱詰めマシーンを置く場所が空いているか
  exitCells() {
    return this.path.length >= 2 ? lineFootprint(this.path).exitCells : [];
  }

  exitIsFree() {
    return this.exitCells().every(([x, z]) => !this.isBlocked(x, z) && !this.isInPath(x, z));
  }

  cost() {
    if (this.path.length === 0) return 0;
    const { collector, beltPerCell, exit } = CONFIG.build;
    return collector + beltPerCell * (this.path.length - 1) + exit;
  }

  // --- 操作 ---

  onPointerMove(e) {
    if (!this.active) return;
    const cell = this.cellAt(e);
    this.hoverGhost.visible = Boolean(cell);
    if (!cell) return;
    this.hoverGhost.position.copy(cellCenter(cell.x, cell.z)).setY(0.15);
    this.hoverGhost.material.color.setHex(this.canPlaceNext(cell.x, cell.z) ? OK_COLOR : NG_COLOR);
  }

  onPointerDown(e) {
    if (!this.active) return;
    if (e.button === 2) {
      this.undo();
      return;
    }
    if (e.button !== 0) return;

    const cell = this.cellAt(e);
    if (!cell || !this.canPlaceNext(cell.x, cell.z)) return;
    this.path.push([cell.x, cell.z]);
    this.state = 'belt';
    this.redraw();
  }

  undo() {
    this.path.pop();
    if (this.path.length === 0) this.state = 'collector';
    this.redraw();
  }

  finish() {
    if (this.path.length < 2) {
      this.onError('コンベアを1マス以上のばしてください');
      return;
    }
    if (!this.exitIsFree()) {
      this.onError('出口と箱を置く場所がふさがっています');
      return;
    }
    const cost = this.cost();
    if (this.getMoney() < cost) {
      this.onError(`お金が足りません（¥${cost.toLocaleString()} 必要）`);
      return;
    }
    this.spend(cost);
    const path = this.path.map(([x, z]) => [x, z]);
    this.cancel();
    this.onBuild(path);
  }

  // --- 見た目の更新 ---

  // 置いたマスの見本と、出口・箱の予定地を描き直し、説明と値段を更新する
  redraw() {
    this.pathGhosts.clear();
    this.path.forEach(([x, z], i) => {
      // 最初のマスは回収機（オレンジで高め）、それ以外はコンベア（灰色で平ら）
      const ghost = createGhost(i === 0 ? 1.4 : 0.5, i === 0 ? 0xff8a3d : 0x5b6b7a);
      ghost.position.copy(cellCenter(x, z)).setY(ghost.userData.height / 2);
      this.pathGhosts.add(ghost);
    });

    // 出口・箱の予定地（ふさがっていれば赤）
    const exitColor = this.exitIsFree() ? OK_COLOR : NG_COLOR;
    for (const [x, z] of this.exitCells()) {
      const ghost = createGhost(0.3, exitColor);
      ghost.position.copy(cellCenter(x, z)).setY(0.15);
      this.pathGhosts.add(ghost);
    }

    this.refresh();
  }

  // 説明文・値段・完成ボタンを、今の状態に合わせて更新する（所持金が変わるので毎フレーム呼ばれる）
  refresh() {
    if (!this.active) return;
    const step = this.state === 'collector'
      ? '① 回収機を置くマスをクリック'
      : '② 隣のマスをクリックしてコンベアをのばす（右クリックで1マス戻す）';
    const { collector, beltPerCell, exit } = CONFIG.build;
    const belts = Math.max(0, this.path.length - 1);
    const cost = this.cost();
    const html =
      `<div>${step}</div>` +
      `<div class="build-cost">回収機 ¥${collector} ＋ コンベア ${belts}マス × ¥${beltPerCell} ＋ 出口と箱 ¥${exit}` +
      `<br><b>合計 ¥${cost.toLocaleString()}</b>（所持 ¥${this.getMoney().toLocaleString()}）</div>`;

    const stepEl = this.panel.querySelector('.build-step');
    if (stepEl.innerHTML !== html) stepEl.innerHTML = html; // 変わったときだけ書き換える

    const finishButton = this.panel.querySelector('[data-action="finish"]');
    finishButton.disabled = this.path.length < 2 || !this.exitIsFree() || this.getMoney() < cost;
  }
}

// 半透明の箱（置く場所の見本）。height：箱の高さ
function createGhost(height, color = OK_COLOR) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(CELL * 0.92, height, CELL * 0.92),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, depthWrite: false }),
  );
  mesh.userData.height = height;
  return mesh;
}
