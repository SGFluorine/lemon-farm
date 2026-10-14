// プレイヤーが手に持っているレモン。
// 持っている数を、カーソルの横に小さな数字で表示する。
export class Hand {
  constructor() {
    this.types = []; // 持っているレモンの種類（拾った順）

    this.label = document.createElement('div');
    this.label.id = 'hand-label';
    document.body.appendChild(this.label);

    // マウスを動かしたときも、クリックしたときも、カーソルの横に付いていく
    const follow = (e) => {
      this.label.style.left = `${e.clientX + 16}px`;
      this.label.style.top = `${e.clientY + 12}px`;
    };
    window.addEventListener('pointermove', follow);
    window.addEventListener('pointerdown', follow);
    this.refresh();
  }

  add(type) {
    this.types.push(type);
    this.refresh();
    // 増えたことが分かるように、数字をぷくっと弾ませる
    this.label.classList.remove('pop');
    void this.label.offsetWidth; // アニメーションを最初からやり直すためのおまじない
    this.label.classList.add('pop');
  }

  // 持っているレモンを全部手放して、その種類の一覧を返す
  releaseAll() {
    const released = this.types;
    this.types = [];
    this.refresh();
    return released;
  }

  refresh() {
    this.label.textContent = `🍋×${this.types.length}`;
    this.label.style.display = this.types.length > 0 ? 'block' : 'none';
  }
}
