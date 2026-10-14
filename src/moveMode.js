import * as THREE from 'three';

const OK_COLOR = 0x66dd66; // 置ける場所
const NG_COLOR = 0xff5555; // 置けない場所

// 動かす・撤去モード。
//   木・農家：クリックで持ち上げ → 移動先をクリックして置く（右クリックで持ち上げをやめる）
//   ライン：クリックで選ぶ →「このラインを撤去」で消す
// 「何を選べるか」「どこに置けるか」の判定は、main.js から関数で受け取る。
export class MoveMode {
  // pickAt(e)：クリックした場所の物を返す（{ kind: 'tree' | 'farmer' | 'line', object, position } または null）
  // placementAt(選んだ物, 地面の位置)：置く場所を返す（{ position, ok }）。ok が false なら置けない
  // onMove(選んだ物, 置く場所)：移動させる
  // onRemoveLine(ライン)：ラインを撤去する。撤去できなければ理由の文字を返す
  // describeLine(ライン)：撤去ボタンに出す説明（戻ってくるお金など）
  // onError(メッセージ)：できないことを知らせる
  constructor({ scene, camera, domElement, pickAt, placementAt, onMove, onRemoveLine, describeLine, onError }) {
    Object.assign(this, { camera, pickAt, placementAt, onMove, onRemoveLine, describeLine, onError });
    this.state = 'off'; // 'off' / 'select'（選ぶ）/ 'carry'（持ち上げ中）/ 'line'（ラインを選んだ）
    this.target = null; // 選んでいる物

    this.raycaster = new THREE.Raycaster();
    this.ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    // 選んでいる物の足もとの黄色い輪と、置く場所の見本
    this.selectRing = new THREE.Mesh(
      new THREE.RingGeometry(1.6, 2, 32),
      new THREE.MeshBasicMaterial({ color: 0xffd84d, transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
    );
    this.selectRing.rotation.x = -Math.PI / 2;
    this.ghost = new THREE.Mesh(
      new THREE.CylinderGeometry(1.8, 1.8, 0.3, 24),
      new THREE.MeshBasicMaterial({ color: OK_COLOR, transparent: true, opacity: 0.5, depthWrite: false }),
    );
    this.selectRing.visible = false;
    this.ghost.visible = false;
    scene.add(this.selectRing, this.ghost);

    this.createUi();

    domElement.addEventListener('pointermove', (e) => this.onPointerMove(e));
    domElement.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    domElement.addEventListener('contextmenu', (e) => {
      if (this.active) e.preventDefault();
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
    this.button.id = 'move-button';
    this.button.textContent = '✋ 動かす・撤去';
    this.button.addEventListener('click', () => (this.active ? this.cancel() : this.start()));
    document.body.appendChild(this.button);

    this.panel = document.createElement('div');
    this.panel.id = 'move-panel';
    this.panel.hidden = true;
    this.panel.innerHTML = `
      <div class="move-text"></div>
      <div class="move-buttons">
        <button data-action="remove">このラインを撤去</button>
        <button data-action="back">選びなおす</button>
      </div>`;
    document.body.appendChild(this.panel);
    this.panel.querySelector('[data-action="remove"]').addEventListener('click', () => this.removeSelectedLine());
    this.panel.querySelector('[data-action="back"]').addEventListener('click', () => this.setState('select'));
  }

  start() {
    this.setState('select');
    this.button.textContent = '✖ 動かすのをやめる';
  }

  cancel() {
    this.setState('off');
    this.button.textContent = '✋ 動かす・撤去';
  }

  // 状態を切り替えて、説明文・ボタン・見本の表示を合わせる
  setState(state, target = null) {
    this.state = state;
    this.target = target;
    this.panel.hidden = state === 'off';
    this.panel.querySelector('.move-buttons').hidden = state !== 'line';
    this.ghost.visible = false;

    this.selectRing.visible = Boolean(target);
    if (target) this.selectRing.position.copy(target.position).setY(0.06);

    const texts = {
      select: '✋ 動かしたい木・農家、または撤去したいラインをクリック（Esc・右クリックでやめる）',
      carry: `${target?.kind === 'tree' ? '🌳 木' : '👨‍🌾 農家'}を置く場所をクリック（右クリックで選びなおす）`,
      line: target ? this.describeLine(target.object) : '',
    };
    this.panel.querySelector('.move-text').textContent = texts[state] ?? '';
  }

  groundPointAt(e) {
    const pointer = new THREE.Vector2(
      (e.clientX / window.innerWidth) * 2 - 1,
      -(e.clientY / window.innerHeight) * 2 + 1,
    );
    this.raycaster.setFromCamera(pointer, this.camera);
    return this.raycaster.ray.intersectPlane(this.ground, new THREE.Vector3());
  }

  onPointerMove(e) {
    if (this.state !== 'carry') return;
    const point = this.groundPointAt(e);
    if (!point) return;
    const { position, ok } = this.placementAt(this.target, point);
    this.ghost.visible = true;
    this.ghost.position.copy(position).setY(0.15);
    this.ghost.material.color.setHex(ok ? OK_COLOR : NG_COLOR);
  }

  onPointerDown(e) {
    if (!this.active) return;

    // 右クリック：持ち上げ中なら選びなおし、選んでいる途中ならモードを終わる
    if (e.button === 2) {
      if (this.state === 'select') this.cancel();
      else this.setState('select');
      return;
    }
    if (e.button !== 0) return;

    if (this.state === 'carry') {
      const point = this.groundPointAt(e);
      if (!point) return;
      const placement = this.placementAt(this.target, point);
      if (!placement.ok) {
        this.onError('ここには置けません');
        return;
      }
      this.onMove(this.target, placement);
      this.setState('select');
      return;
    }

    // 選ぶ：木・農家なら持ち上げ、ラインなら撤去の確認へ
    const picked = this.pickAt(e);
    if (!picked) return;
    this.setState(picked.kind === 'line' ? 'line' : 'carry', picked);
  }

  removeSelectedLine() {
    if (this.state !== 'line') return;
    const reason = this.onRemoveLine(this.target.object);
    if (reason) {
      this.onError(reason);
      return;
    }
    this.setState('select');
  }
}
