// セーブデータの保存・読み込み・削除。
// 遊んでいる人のブラウザの中（localStorage）に保存するので、サーバーはいらない。
// 人ごと・ブラウザごとに別々のデータになる。
//
// 開発者モード（?dev）のときは別の名前で保存する。全部解放などで、普通に遊んだデータを上書きしないため。
// 保存できない環境（プライベートモード・容量オーバーなど）でも、ゲームは止まらないようにする。

export const SAVE_VERSION = 1; // データの形を変えたら上げる（古い形のデータは読み込まない）

const KEY = new URLSearchParams(location.search).has('dev') ? 'lemon-farm-save-dev' : 'lemon-farm-save';

export function loadSave() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY));
    return data?.version === SAVE_VERSION ? data : null;
  } catch {
    return null;
  }
}

export function writeSave(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function deleteSave() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // 消せなくても困らないので、何もしない
  }
}
