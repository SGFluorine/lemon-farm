import { CONFIG } from './config.js';

// アップグレードのお店。「マップ（スキルツリー）」の形で表示する。
//
//   真ん中の 🍋 から、カテゴリごとの「枝」が伸び、各アップグレードが「ノード（丸いアイコン）」として並ぶ。
//   枝の根元から順に解放される：1つ前のノードを Lv.1 以上にすると、次のノードが買えるようになる。
//   買えるノードの1つ先は 🔒 付きで薄く見え、さらに先は「？」だけが見える（まだ先がある、と感じられるように）。
//
// 実際の効果（コンベアを速くする等）は、買ったときに onPurchased で main.js に任せる。

const MAP_SIZE = 900; // マップの大きさ（この大きさで並べてから、画面に収まるように縮める）
const CENTER = MAP_SIZE / 2;
const FIRST_RADIUS = 125; // 真ん中から、枝の最初のノードまでの距離
const STEP = 95; // ノードとノードの間隔

export class UpgradeShop {
  // tryPay(値段)：払えたら true を返す
  // onPurchased(種類, 新しいレベル, { silent })：買えたときに呼ばれる（silent = 音を鳴らさない）
  // blockedReason(種類)：今は買えない理由（例「空きがありません」）。買えるなら null（省略可）
  // describe(種類, レベル)：説明文を、今の状態に合わせて差し替えたいときに使う（省略可）
  // onStartPlacement(種類, 値段)：置く場所を選ぶもの（placeable）が押されたときに呼ばれる。
  //   置き終わったら、呼び出し側が confirmPurchase(種類) を呼んでレベルを上げる
  constructor({ tryPay, onPurchased, blockedReason = () => null, describe = () => null, onStartPlacement }) {
    Object.assign(this, { tryPay, onPurchased, blockedReason, describe, onStartPlacement });
    this.levels = {};
    this.nodes = {}; // 種類 → { el, level, prev（1つ前のノード）, info }
    this.hints = new Set(); // 「買えば解決」で光らせているノード
    this.money = 0;
    this.hoveredId = null;

    for (const id of Object.keys(CONFIG.upgrades)) this.levels[id] = 0;

    this.createOpenButton();
    this.createMap();
    window.addEventListener('resize', () => this.fitMap());
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.isOpen) this.close();
    });
  }

  // --- 画面の部品を作る ---

  // 所持金の下の「⬆ アップグレード」ボタン
  createOpenButton() {
    this.openButton = document.createElement('button');
    this.openButton.id = 'upgrade-open';
    this.openButton.innerHTML = '⬆ アップグレード <span class="upgrade-badge"></span>';
    this.openButton.addEventListener('click', () => (this.isOpen ? this.close() : this.open()));
    document.body.appendChild(this.openButton);
    this.badge = this.openButton.querySelector('.upgrade-badge');
  }

  // 暗い背景の上に、枝とノードを並べたマップ
  createMap() {
    this.overlay = document.createElement('div');
    this.overlay.id = 'upgrade-map';
    this.overlay.hidden = true;
    this.overlay.innerHTML = `
      <div class="map-header">
        <span>⬆ アップグレード</span>
        <button class="map-close">✖</button>
      </div>
      <div class="map-area"><div class="map-canvas"></div></div>
      <div class="map-tooltip" hidden></div>`;
    document.body.appendChild(this.overlay);

    this.canvas = this.overlay.querySelector('.map-canvas');
    this.tooltip = this.overlay.querySelector('.map-tooltip');
    this.overlay.querySelector('.map-close').addEventListener('click', () => this.close());
    // 背景（ノード以外）をクリックしたら閉じる
    this.overlay.querySelector('.map-area').addEventListener('click', (e) => {
      if (e.target.classList.contains('map-area') || e.target === this.canvas) this.close();
    });

    // 線は SVG（図形を描く仕組み）で、ノードは HTML のボタンで作る
    const svgNs = 'http://www.w3.org/2000/svg';
    this.svg = document.createElementNS(svgNs, 'svg');
    this.svg.setAttribute('width', MAP_SIZE);
    this.svg.setAttribute('height', MAP_SIZE);
    this.canvas.appendChild(this.svg);

    // 真ん中の 🍋
    const root = document.createElement('div');
    root.className = 'map-root';
    root.textContent = '🍋';
    placeAt(root, CENTER, CENTER);
    this.canvas.appendChild(root);

    const categories = categoriesWithLeftovers();
    categories.forEach(({ label, ids }, branch) => {
      // 枝の向き：真上から、カテゴリの数で等分した角度ずつ回す
      const angle = -Math.PI / 2 + (branch * 2 * Math.PI) / categories.length;
      const at = (radius) => [CENTER + Math.cos(angle) * radius, CENTER + Math.sin(angle) * radius];

      // カテゴリ名：最初のノードの横（枝の向きに対して直角の方向）にずらして置く。線や名前どうしが重ならないように
      const title = document.createElement('div');
      title.className = 'map-branch-title';
      title.textContent = label;
      const [firstX, firstY] = at(FIRST_RADIUS + STEP / 2);
      const side = 52; // 枝からの離れ具合
      placeAt(title, firstX + Math.cos(angle + Math.PI / 2) * side, firstY + Math.sin(angle + Math.PI / 2) * side);
      this.canvas.appendChild(title);

      let prevPoint = at(36); // 最初の線は、真ん中の 🍋 のふちから出す
      ids.forEach((id, index) => {
        const point = at(FIRST_RADIUS + index * STEP);
        const line = document.createElementNS(svgNs, 'line');
        line.setAttribute('x1', prevPoint[0]);
        line.setAttribute('y1', prevPoint[1]);
        line.setAttribute('x2', point[0]);
        line.setAttribute('y2', point[1]);
        this.svg.appendChild(line);
        prevPoint = point;

        const el = document.createElement('button');
        el.className = 'map-node';
        el.innerHTML = `<span class="node-icon"></span><span class="node-level"></span>`;
        placeAt(el, ...point);
        el.addEventListener('mouseenter', () => this.showTooltip(id));
        el.addEventListener('mouseleave', () => this.hideTooltip());
        el.addEventListener('click', () => this.buy(id));
        this.canvas.appendChild(el);

        this.nodes[id] = { el, line, prev: index > 0 ? ids[index - 1] : null, info: CONFIG.upgrades[id] };
      });
    });
  }

  // --- 開け閉め ---

  get isOpen() {
    return !this.overlay.hidden;
  }

  open() {
    this.overlay.hidden = false;
    this.fitMap();
    this.refresh(this.money);
  }

  close() {
    this.overlay.hidden = true;
    this.hideTooltip();
  }

  // マップを、画面に収まる大きさに縮める
  fitMap() {
    const area = this.overlay.querySelector('.map-area');
    const scale = Math.min(area.clientWidth / MAP_SIZE, area.clientHeight / MAP_SIZE, 1);
    this.canvas.style.transform = `translate(-50%, -50%) scale(${scale})`; // 真ん中に置いたまま縮める
  }

  // --- 買う ---

  buy(id) {
    if (this.nodeState(id) === 'hidden' || this.isMaxed(id) || this.lockReason(id)) return;
    const { info } = this.nodes[id];
    // 置く場所を選ぶもの：ここでは払わず、マップを閉じて置き場所選びに進む
    if (info.placeable) {
      this.close();
      this.onStartPlacement(id, this.cost(id));
      return;
    }
    if (!this.tryPay(this.cost(id))) return;
    this.confirmPurchase(id);
    this.showTooltip(id); // 説明を新しいレベルに更新する
  }

  // 買った（置いた）ことを確定して、レベルを1つ上げる
  confirmPurchase(id, { silent = false } = {}) {
    this.levels[id] += 1;
    this.onPurchased(id, this.levels[id], { silent });
  }

  // 開発者用：すべてのアップグレードを、お金を使わずに最大まで上げる。
  // 前提が必要なもの（1つ前のノードなど）もあるので、何も上げられなくなるまで繰り返す。
  // 置く場所を選ぶもの（家・土地）は、ここでは上げない（呼び出し側が自動で置く）
  unlockAll() {
    let changed = true;
    while (changed) {
      changed = false;
      for (const id of Object.keys(this.levels)) {
        if (CONFIG.upgrades[id].placeable || this.isMaxed(id) || this.lockReason(id)) continue;
        this.confirmPurchase(id, { silent: true });
        changed = true;
      }
    }
  }

  // 「これを買えば解決するよ」と知らせるため、ノードを光らせる（on = false で消す）
  setHint(id, on) {
    if (on && !this.isMaxed(id)) this.hints.add(id);
    else this.hints.delete(id);
  }

  // --- 状態の判定 ---

  // 次に買うときの値段
  cost(id) {
    const { baseCost, costGrowth } = CONFIG.upgrades[id];
    return Math.round(baseCost * Math.pow(costGrowth, this.levels[id]));
  }

  isMaxed(id) {
    return this.levels[id] >= CONFIG.upgrades[id].maxLevel;
  }

  // お金以外の理由で買えないとき、その理由を返す（買えるなら null）
  lockReason(id) {
    const prev = this.nodes[id].prev;
    if (prev && this.levels[prev] === 0) return `要：${CONFIG.upgrades[prev].name}`;
    const { requires } = CONFIG.upgrades[id];
    if (requires && this.levels[requires] === 0) return `要：${CONFIG.upgrades[requires].name}`;
    return this.blockedReason(id);
  }

  // ノードの見え方：
  //   'open'（買える・または買った）/ 'peek'（1つ前がまだ。🔒付きで薄く見える）/ 'hidden'（もっと先。「？」だけ）
  nodeState(id) {
    const prev = this.nodes[id].prev;
    if (!prev || this.levels[prev] > 0) return 'open';
    const prevPrev = this.nodes[prev].prev;
    return !prevPrev || this.levels[prevPrev] > 0 ? 'peek' : 'hidden';
  }

  canBuyNow(id) {
    return this.nodeState(id) === 'open' && !this.isMaxed(id) && !this.lockReason(id) && this.money >= this.cost(id);
  }

  // --- 表示の更新（毎フレーム呼ばれる）---

  refresh(money) {
    this.money = money;

    // 開くボタン：買える数と、「買えば解決」のヒント
    const affordable = Object.keys(this.nodes).filter((id) => this.canBuyNow(id)).length;
    const badgeText = affordable > 0 ? `買える ${affordable}` : '';
    if (this.badge.textContent !== badgeText) this.badge.textContent = badgeText;
    this.openButton.classList.toggle('hint', this.hints.size > 0);

    if (!this.isOpen) return; // マップを閉じているときは、ノードは書き換えない

    for (const [id, { el, line, info }] of Object.entries(this.nodes)) {
      const state = this.nodeState(id);
      const maxed = this.isMaxed(id);
      const icon = state === 'hidden' ? '？' : CONFIG.upgradeIcons[id] ?? '⬆';
      const levelText = state === 'hidden' ? '' : `${this.levels[id]}/${info.maxLevel}`;
      setText(el.querySelector('.node-icon'), icon);
      setText(el.querySelector('.node-level'), levelText);

      el.className = 'map-node';
      el.classList.add(`state-${state}`);
      if (maxed) el.classList.add('maxed');
      else if (this.levels[id] > 0) el.classList.add('owned');
      if (this.canBuyNow(id)) el.classList.add('affordable');
      if (this.hints.has(id)) el.classList.add('hint');

      // 線：1つ前（または真ん中）からここまで。買い進めた道は金色、まだの道は点線
      line.setAttribute('class', state === 'open' ? (this.levels[id] > 0 ? 'path-owned' : 'path-open') : 'path-locked');
    }
    if (this.hoveredId) this.showTooltip(this.hoveredId);
  }

  // ノードに重ねる説明の枠（名前・効果・Lv・値段）
  showTooltip(id) {
    this.hoveredId = id;
    const { el, info } = this.nodes[id];
    const state = this.nodeState(id);
    const level = this.levels[id];

    let html;
    if (state === 'hidden') {
      html = '<div class="tip-name">？？？</div><div class="tip-desc">もっと先に進むと分かる</div>';
    } else {
      let footer = `¥${this.cost(id).toLocaleString()}`;
      let footerClass = this.money >= this.cost(id) ? 'tip-buy' : 'tip-poor';
      const locked = this.lockReason(id);
      if (this.isMaxed(id)) [footer, footerClass] = ['MAX', 'tip-max'];
      else if (locked) [footer, footerClass] = [`🔒 ${locked}`, 'tip-locked'];

      html =
        `<div class="tip-name">${CONFIG.upgradeIcons[id] ?? ''} ${info.name}</div>` +
        `<div class="tip-desc">${this.describe(id, level) ?? info.description}</div>` +
        `<div class="tip-level">Lv. ${level} / ${info.maxLevel}</div>` +
        `<div class="tip-footer ${footerClass}">${footer}</div>`;
    }
    if (this.tooltip.innerHTML !== html) this.tooltip.innerHTML = html;
    this.tooltip.hidden = false;

    // ノードの上に出す（画面の上にはみ出すなら下に）
    const rect = el.getBoundingClientRect();
    const tipHeight = this.tooltip.offsetHeight;
    const top = rect.top - tipHeight - 8 > 0 ? rect.top - tipHeight - 8 : rect.bottom + 8;
    this.tooltip.style.left = `${rect.left + rect.width / 2}px`;
    this.tooltip.style.top = `${top}px`;
  }

  hideTooltip() {
    this.hoveredId = null;
    this.tooltip.hidden = true;
  }
}

// 要素の真ん中が (x, y) に来るように置く
function placeAt(el, x, y) {
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
}

// 文字が変わったときだけ書き換える（毎フレーム書き換えると重くなるため）
function setText(el, text) {
  if (el.textContent !== text) el.textContent = text;
}

// 設定のカテゴリに入っていないアップグレードがあれば、「その他」にまとめる（入れ忘れても表示されるように）
function categoriesWithLeftovers() {
  const listed = new Set(CONFIG.upgradeCategories.flatMap((c) => c.ids));
  const leftovers = Object.keys(CONFIG.upgrades).filter((id) => !listed.has(id));
  return leftovers.length > 0
    ? [...CONFIG.upgradeCategories, { label: '📎 その他', ids: leftovers }]
    : CONFIG.upgradeCategories;
}
