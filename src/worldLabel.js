// 3D空間の決まった場所の上に浮かぶ札（「満杯！」など）。
// 文字はHTMLで作り、毎フレーム3Dの位置を画面上の位置に変換して付いていかせる。
export class WorldLabel {
  constructor(text) {
    this.el = document.createElement('div');
    this.el.className = 'world-label';
    this.el.textContent = text;
    this.el.hidden = true;
    document.body.appendChild(this.el);
  }

  // 札を画面から取り除く（もう使わないとき）
  remove() {
    this.el.remove();
  }

  // visible：表示するかどうか、worldPosition：札を出したい3Dの位置
  update(camera, worldPosition, visible) {
    this.el.hidden = !visible;
    if (!visible) return;

    const ndc = worldPosition.clone().project(camera);
    this.el.style.left = `${(ndc.x + 1) / 2 * window.innerWidth}px`;
    this.el.style.top = `${(1 - ndc.y) / 2 * window.innerHeight}px`;
  }
}
