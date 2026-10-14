// 開発者用のボタン。URLの末尾に ?dev を付けて開いたときだけ表示する
// （例：http://localhost:8000/?dev）。普通に遊ぶときは見えない。
// sounds：試し聞きボタンにする効果音（{ ボタンの文字: 鳴らす関数 }）
export function createDevTools({ onUnlockAll, onAddMoney, sounds = {} }) {
  if (!new URLSearchParams(location.search).has('dev')) return;

  const panel = document.createElement('div');
  panel.id = 'dev-tools';
  panel.innerHTML = `
    <div class="dev-title">🛠 開発者</div>
    <button data-action="unlock">全アップグレード解放</button>
    <button data-action="money">+¥10,000</button>`;
  document.body.appendChild(panel);

  panel.querySelector('[data-action="unlock"]').addEventListener('click', onUnlockAll);
  panel.querySelector('[data-action="money"]').addEventListener('click', () => onAddMoney(10000));

  // めったに出ない音（虹など）を確かめるための、試し聞きボタン
  for (const [label, play] of Object.entries(sounds)) {
    const button = document.createElement('button');
    button.textContent = `🔊 ${label}`;
    button.addEventListener('click', play);
    panel.appendChild(button);
  }
}
