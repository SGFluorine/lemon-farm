import * as THREE from 'three';

// 見た目の「画風」をまとめて決める場所（輪郭線・陰影・空）。
//
// 各ファイルで作った物には、毎フレーム applyStyle(scene) が自動で次の2つを付ける：
//   1. 陰影：アニメ調の材質（MeshToonMaterial）に、3段階の明るさの「段々」を設定する
//   2. 輪郭線：物と同じ形を少しだけ外側に広げ、裏側だけを濃い色で描く（「裏返しの殻」と呼ばれる軽い方法）
// 新しく作った物にも自動でかかるので、物を作るファイル側は画風を気にしなくてよい。
// 輪郭線を付けたくない物（地面など）は、mesh.userData.noOutline = true にしておく。

const OUTLINE_COLOR = 0x3a3f2a; // 真っ黒ではなく、少し緑がかった濃い色（やわらかく見える）
const OUTLINE_WIDTH = 0.0022; // 輪郭線の太さ（画面の高さに対する割合。細め）

// --- 陰影：3段階の明るさ（暗い・中間・明るい）。どうぶつの森のような、やわらかい段々 ---
const GRADIENT_MAP = (() => {
  const texture = new THREE.DataTexture(new Uint8Array([150, 210, 255]), 3, 1, THREE.RedFormat);
  texture.minFilter = THREE.NearestFilter; // 色をにじませず、段々のままにする
  texture.magFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  return texture;
})();

// --- 輪郭線用の材質（全部の物で1つだけ使い回す）---
// 形を、画面上で一定の太さぶんだけ外側に押し広げてから描く。
// 「画面上で一定」にしているので、遠い物・小さい物でも線の太さがそろう。
const outlineMaterial = new THREE.ShaderMaterial({
  side: THREE.BackSide, // 裏側だけ描く → 本体のまわりに、はみ出した部分だけが線として見える
  fog: true,
  uniforms: THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      color: { value: new THREE.Color(OUTLINE_COLOR) },
      width: { value: OUTLINE_WIDTH },
      aspect: { value: window.innerWidth / window.innerHeight },
    },
  ]),
  vertexShader: /* glsl */ `
    uniform float width;
    uniform float aspect;
    #include <fog_pars_vertex>
    void main() {
      vec4 local = vec4(position, 1.0);
      vec3 n = normal;
      #ifdef USE_INSTANCING
        local = instanceMatrix * local;
        n = mat3(instanceMatrix) * n;
      #endif
      vec4 mvPosition = modelViewMatrix * local;
      vec3 viewNormal = normalize(normalMatrix * n);
      vec4 clip = projectionMatrix * mvPosition;
      // 画面上の、面の向き（法線）の方向へ押し出す。clip.w を掛けると遠近に関係なく一定の太さになる
      vec2 dir = normalize(viewNormal.xy + 1e-5);
      dir.x /= aspect; // 横長の画面で、横の線だけ太くならないように
      clip.xy += dir * width * 2.0 * clip.w;
      gl_Position = clip;
      #include <fog_vertex>
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3 color;
    #include <fog_pars_fragment>
    void main() {
      gl_FragColor = vec4(color, 1.0);
      #include <fog_fragment>
    }
  `,
});

// 画面の縦横比が変わったら呼ぶ（輪郭線の太さをそろえるため）
export function updateStyleAspect(aspect) {
  outlineMaterial.uniforms.aspect.value = aspect;
}

// シーンの中の物に、陰影と輪郭線を（まだ付いていなければ）付ける。毎フレーム呼ぶ
export function applyStyle(scene) {
  const newMeshes = [];
  scene.traverse((object) => {
    if (!object.isMesh || object.userData.styled || object.userData.isOutline) return;
    object.userData.styled = true;

    const materials = Array.isArray(object.material) ? object.material : [object.material];
    const isToon = materials.some((m) => m.isMeshToonMaterial);
    if (!isToon) return; // エフェクトの粒や見本など、アニメ調の材質でない物はそのまま

    for (const m of materials) {
      if (m.isMeshToonMaterial && !m.gradientMap) {
        m.gradientMap = GRADIENT_MAP;
        m.needsUpdate = true;
      }
    }
    if (!object.userData.noOutline) newMeshes.push(object);
  });

  // traverse の途中で子を足すと数え方が乱れるので、あとからまとめて輪郭線を付ける
  for (const mesh of newMeshes) {
    const outline = mesh.isInstancedMesh
      ? new THREE.InstancedMesh(mesh.geometry, outlineMaterial, mesh.count)
      : new THREE.Mesh(mesh.geometry, outlineMaterial);
    if (mesh.isInstancedMesh) outline.instanceMatrix = mesh.instanceMatrix; // 同じ並べ方を使い回す
    outline.userData.isOutline = true;
    outline.castShadow = false;
    outline.receiveShadow = false;
    outline.raycast = () => {}; // クリックの判定には使わない
    mesh.add(outline);
  }
}

// 空：上が濃い青、下（地平線あたり）が明るい水色のグラデーション
export function createSkyTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, '#5aaee8');
  gradient.addColorStop(0.6, '#a8dcf5');
  gradient.addColorStop(1, '#e4f6ff');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 2, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// 地面の模様：白地に、うっすらした小さな三角形を並べたもの（地面の色に掛け合わせて使う）
export function createGroundPattern() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#f0f8ea'; // 地面の色に掛け合わせるので、白に近いほど控えめになる
  // 互い違いに4つの小さな三角形
  for (const [x, y] of [[8, 10], [40, 10], [24, 42], [56, 42]]) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 7, y + 11);
    ctx.lineTo(x - 7, y + 11);
    ctx.closePath();
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
