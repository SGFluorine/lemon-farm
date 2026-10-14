// これまでの記録（売上・出荷した箱・収穫したレモンの数と内訳）を数えて、
// 「📊 統計」ボタンで開け閉めできるパネルに表示する。
export class Stats {
  constructor() {
    this.totalSales = 0;
    this.boxesShipped = 0;
    this.harvested = { normal: 0, silver: 0, gold: 0, rainbow: 0 };
    this.magicConverted = 0; // 魔法のマシーンで金に変えた数

    // 開け閉めのボタンと、中身のパネル
    const wrapper = document.createElement('div');
    wrapper.id = 'stats';
    wrapper.innerHTML = `
      <button id="stats-toggle">📊 統計</button>
      <div id="stats-panel" hidden></div>`;
    document.body.appendChild(wrapper);

    this.panel = wrapper.querySelector('#stats-panel');
    wrapper.querySelector('#stats-toggle').addEventListener('click', () => {
      this.panel.hidden = !this.panel.hidden;
      this.render();
    });
  }

  // セーブ用：記録をそのまま保存できる形で取り出す／戻す
  toJSON() {
    const { totalSales, boxesShipped, harvested, magicConverted } = this;
    return { totalSales, boxesShipped, harvested: { ...harvested }, magicConverted };
  }

  restore(data) {
    this.totalSales = data.totalSales ?? 0;
    this.boxesShipped = data.boxesShipped ?? 0;
    this.harvested = { ...this.harvested, ...data.harvested };
    this.magicConverted = data.magicConverted ?? 0;
    this.render();
  }

  recordHarvest(type) {
    this.harvested[type] += 1;
    this.render();
  }

  recordMagic() {
    this.magicConverted += 1;
    this.render();
  }

  recordShipment(value) {
    this.totalSales += value;
    this.boxesShipped += 1;
    this.render();
  }

  render() {
    if (this.panel.hidden) return; // 閉じているときは書き換えない

    const { normal, silver, gold, rainbow } = this.harvested;
    const total = normal + silver + gold + rainbow;
    // 全体に対する割合（収穫が0個のときは 0%）。虹はとても少ないので小数第2位まで出す
    const rate = (n, digits = 1) => (total === 0 ? (0).toFixed(digits) : ((n / total) * 100).toFixed(digits));

    this.panel.innerHTML = `
      <div class="stats-row"><span>売上の合計</span><b>¥${this.totalSales.toLocaleString()}</b></div>
      <div class="stats-row"><span>出荷した箱</span><b>${this.boxesShipped}箱</b></div>
      <div class="stats-row"><span>収穫したレモン</span><b>${total}個</b></div>
      <div class="stats-sub"><span>🍋 普通</span><span>${normal}個（${rate(normal)}%）</span></div>
      <div class="stats-sub"><span>⚪ 銀</span><span>${silver}個（${rate(silver)}%）</span></div>
      <div class="stats-sub"><span>🌟 金</span><span>${gold}個（${rate(gold)}%）</span></div>
      <div class="stats-sub"><span>🌈 虹</span><span>${rainbow}個（${rate(rainbow, 2)}%）</span></div>
      <div class="stats-row"><span>魔法で金にした数</span><b>${this.magicConverted}個</b></div>`;
  }
}
