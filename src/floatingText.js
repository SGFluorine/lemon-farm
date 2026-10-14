// 3D空間の位置に、ふわっと浮かんで消える文字（「+¥120」など）を出す。
// 文字はHTMLで作り、3Dの位置を画面上の位置に変換して置く。
export function showFloatingText(camera, worldPosition, text) {
  const ndc = worldPosition.clone().project(camera);
  const x = (ndc.x + 1) / 2 * window.innerWidth;
  const y = (1 - ndc.y) / 2 * window.innerHeight;

  const el = document.createElement('div');
  el.className = 'floating-text';
  el.textContent = text;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  document.body.appendChild(el);

  // CSSアニメーション（index.html の .floating-text）が終わったら片付ける
  el.addEventListener('animationend', () => el.remove());
}
