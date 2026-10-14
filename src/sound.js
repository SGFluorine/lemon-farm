import { CONFIG } from './config.js';

// 効果音。音声ファイルは使わず、ブラウザの音を作る機能（Web Audio）で合成する。
//
// 音の基本の作り方：
//   「発振器（一定の高さの音を出し続ける部品）」→「音量のつまみ」→ スピーカー
// 音量のつまみを一瞬で上げて、すぐ下げると「ポッ」という短い音になる。
// 音の高さ（周波数）を鳴らしながら上げ下げすると、「ぴょこ」「ポコ」のような表情がつく。

let ctx = null; // 音を作る場所（AudioContext）
let master = null; // 全体の音量

// ブラウザは「ユーザーが一度クリックするまで音を出せない」決まりがあるので、
// 最初のクリックのときに準備する
window.addEventListener('pointerdown', () => {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = CONFIG.soundVolume;
    // コンプレッサー：大きすぎる音を自動で抑える部品。派手な音を重ねても音が割れにくくなる
    const compressor = ctx.createDynamicsCompressor();
    master.connect(compressor).connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
}, { capture: true }); // ゲームのクリック処理より先に準備しておく

// 1つの音を鳴らす
//   freq → freqEnd：鳴り始めと鳴り終わりの高さ（Hz）
//   wave：音色（'sine' = 丸い、'triangle' = 少し明るい、'square' = ピコピコ、'sawtooth' = ラッパのように太い）
//   delay：何秒後に鳴らすか（和音や連続音に使う）
//   vibrato：音の高さを細かく揺らす（{ rate: 1秒に何回, depth: 揺れ幅Hz }）。伸ばす音に迫力が出る
//   filterCutoff：これより高い成分を削る（太い音色をまろやかにする）
function tone({ freq, freqEnd = freq, duration, wave = 'sine', volume = 1, delay = 0, vibrato, filterCutoff }) {
  if (!ctx) return;
  const start = ctx.currentTime + delay;

  const osc = ctx.createOscillator();
  osc.type = wave;
  osc.frequency.setValueAtTime(freq, start);
  osc.frequency.exponentialRampToValueAtTime(freqEnd, start + duration);

  if (vibrato) {
    const lfo = ctx.createOscillator(); // 揺らすための、とても低い音
    const lfoGain = ctx.createGain();
    lfo.frequency.value = vibrato.rate;
    lfoGain.gain.value = vibrato.depth;
    lfo.connect(lfoGain).connect(osc.frequency);
    lfo.start(start);
    lfo.stop(start + duration + 0.02);
  }

  // 音量：一瞬で立ち上がって、なめらかに消える
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(volume, start + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration);

  let node = osc;
  if (filterCutoff) {
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterCutoff;
    node = node.connect(filter);
  }
  node.connect(gain).connect(master);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

// ざらっとした音（ノイズ）を鳴らす。「ぽふっ」「シュワーッ」「シャーン」に使う
//   type：削り方（'lowpass' = 低い音だけ残す、'highpass' = 高い音だけ、'bandpass' = 真ん中だけ）
//   cutoff → cutoffEnd：残す高さを鳴らしながら動かす（上げていくと「シュワーッ」と吹き上がる）
//   shape：'decay'（すぐ鳴ってだんだん消える）/ 'swell'（だんだん大きくなる）
function noise({ duration, volume = 1, cutoff = 800, cutoffEnd = cutoff, type = 'lowpass', shape = 'decay', delay = 0 }) {
  if (!ctx) return;
  const start = ctx.currentTime + delay;
  const length = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    const t = i / length;
    data[i] = (Math.random() * 2 - 1) * (shape === 'swell' ? t * t : 1 - t);
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.setValueAtTime(cutoff, start);
  filter.frequency.exponentialRampToValueAtTime(cutoffEnd, start + duration);
  const gain = ctx.createGain();
  gain.gain.value = volume;

  source.connect(filter).connect(gain).connect(master);
  source.start(start);
}

// 「ドーン」という重低音（音程が急に下がる低い音＋こもったノイズ）
function boom(delay = 0, volume = 0.9) {
  tone({ freq: 160, freqEnd: 35, duration: 0.9, wave: 'sine', volume, delay });
  noise({ duration: 0.35, volume: 0.6, cutoff: 250, delay });
}

// キラキラが降ってくる：高い音を、ばらばらのタイミングでたくさん鳴らす
function sparkleRain(delay, count, span) {
  for (let i = 0; i < count; i++) {
    const freq = 2000 + Math.random() * 3000;
    tone({ freq, freqEnd: freq * 1.05, duration: 0.15, wave: 'sine', volume: 0.12, delay: delay + Math.random() * span });
  }
}

// 和音（いくつかの高さを同時に、震わせながら伸ばす）
function chord(freqs, { delay = 0, duration, volume = 0.08 }) {
  for (const freq of freqs) {
    tone({ freq, duration, wave: 'sawtooth', volume, delay, vibrato: { rate: 6, depth: freq * 0.01 }, filterCutoff: 3500 });
  }
}

export const sound = {
  // 収穫：キラッ（金・銀は音が増えて豪華に）
  harvest(type) {
    if (type === 'rainbow') {
      this.rainbowLemon(); // 虹だけは特別に派手な音
      return;
    }
    const notes = {
      normal: [1319, 1760],
      silver: [1319, 1568, 1976, 2637],
      gold: [1047, 1319, 1568, 2093, 2637],
    }[type];
    notes.forEach((freq, i) => {
      tone({ freq, duration: 0.18, wave: 'triangle', volume: 0.35, delay: i * 0.045 });
    });
  },

  // 収穫係が自動で収穫した：小さく「ぴっ」（手で収穫するより控えめに）
  autoHarvest() {
    tone({ freq: 1568, freqEnd: 1760, duration: 0.08, wave: 'triangle', volume: 0.15 });
  },

  // 回収機に届く：ぽふっ
  arrive() {
    noise({ duration: 0.12, volume: 0.5, cutoff: 600 });
    tone({ freq: 260, freqEnd: 140, duration: 0.1, volume: 0.4 });
  },

  // 出口のレモンを拾う：ぴょこ（下から上へ跳ねる音）
  pickup() {
    tone({ freq: 520, freqEnd: 1040, duration: 0.07, volume: 0.45 });
  },

  // 箱に入る：ポコッ。何個目かに合わせて少しずつ高くなる（index は 0〜9）
  plop(index) {
    const base = 520 * Math.pow(2, index / 12 * 2); // 1個ごとに全音（ドレミの1つ分）上がる
    tone({ freq: base, freqEnd: base * 0.5, duration: 0.09, volume: 0.6 });
    noise({ duration: 0.03, volume: 0.2, cutoff: 2000 });
  },

  // アップグレードを買った：ド・ミ・ソ・ドと駆け上がる
  purchase() {
    [523, 659, 784, 1047].forEach((freq, i) => {
      tone({ freq, duration: 0.15, wave: 'triangle', volume: 0.4, delay: i * 0.06 });
    });
  },

  // 金の箱が来た：キラキラと高く駆け上がる
  goldenBox() {
    [1047, 1319, 1568, 2093, 2637, 3136].forEach((freq, i) => {
      tone({ freq, duration: 0.25, wave: 'triangle', volume: 0.35, delay: i * 0.05 });
    });
  },

  // 魔法で金に変わった：シャララーンと高い音が連なって昇っていく
  magic() {
    [784, 988, 1175, 1568, 1976, 2349, 3136].forEach((freq, i) => {
      tone({ freq, freqEnd: freq * 1.02, duration: 0.3, wave: 'sine', volume: 0.25, delay: i * 0.035 });
    });
  },

  // いっぱいで受け付けられない：ブブー（低い音を2回）
  blocked() {
    tone({ freq: 180, duration: 0.1, wave: 'square', volume: 0.2 });
    tone({ freq: 150, duration: 0.14, wave: 'square', volume: 0.2, delay: 0.12 });
  },

  // 虹のレモンを収穫：シュワーッ → 一気に駆け上がる → ドーン＋震える大和音 → キラキラが降る（約2秒）
  rainbowLemon() {
    noise({ duration: 0.5, volume: 0.5, type: 'bandpass', cutoff: 300, cutoffEnd: 7000, shape: 'swell' });
    tone({ freq: 220, freqEnd: 1760, duration: 0.5, wave: 'sawtooth', volume: 0.15, filterCutoff: 4000 });
    tone({ freq: 330, freqEnd: 2637, duration: 0.5, wave: 'square', volume: 0.06 });

    boom(0.5);
    chord([523, 659, 784, 1047, 1319, 1568], { delay: 0.5, duration: 1.6, volume: 0.07 });
    // 虹の7色にちなんで、7音の速いアルペジオを上へ
    [1047, 1175, 1319, 1568, 1760, 2093, 2637].forEach((freq, i) => {
      tone({ freq, duration: 0.25, wave: 'triangle', volume: 0.25, delay: 0.5 + i * 0.04 });
    });
    sparkleRain(0.7, 20, 1.4);
  },

  // 虹の箱が来た：ドン・ドン・ドン・ドーン！のファンファーレ → シンバル → 大和音とキラキラの滝（約3秒）
  rainbowBox() {
    // ファンファーレ「ソ・ソ・ソ・ドーー」。ラッパのような太い音と、オクターブ上の音を重ねる
    const fanfare = [[392, 0], [392, 0.16], [392, 0.32], [523, 0.48]];
    fanfare.forEach(([freq, at], i) => {
      const long = i === fanfare.length - 1;
      const duration = long ? 1.4 : 0.14;
      tone({ freq, duration, wave: 'sawtooth', volume: 0.18, delay: at, filterCutoff: 2500, vibrato: long ? { rate: 6, depth: 6 } : undefined });
      tone({ freq: freq * 2, duration, wave: 'square', volume: 0.06, delay: at });
      boom(at, long ? 1 : 0.6); // 太鼓
    });

    // シンバル「シャーン」
    noise({ duration: 1.6, volume: 0.35, type: 'highpass', cutoff: 5000, delay: 0.48 });

    // 大和音（ド・ミ・ソ・シ♭・ド）
    chord([262, 523, 659, 784, 932, 1047], { delay: 0.48, duration: 2.2, volume: 0.06 });

    // キラキラの滝：高いところから一気に流れ落ちるアルペジオ＋降ってくるキラキラ
    [4186, 3136, 2637, 2093, 1568, 1319, 1047, 784].forEach((freq, i) => {
      tone({ freq, duration: 0.3, wave: 'triangle', volume: 0.22, delay: 1.0 + i * 0.05 });
    });
    sparkleRain(1.0, 35, 2.0);
  },

  // 虹の箱を出荷：コインがジャラジャラと大量に降る大当たりの音
  jackpot() {
    boom(0, 1);
    for (let i = 0; i < 30; i++) {
      const at = Math.random() * 1.8;
      const pitch = 0.9 + Math.random() * 0.25; // コインごとに少しずつ高さを変える
      tone({ freq: 1976 * pitch, duration: 0.08, wave: 'square', volume: 0.08, delay: at });
      tone({ freq: 2637 * pitch, duration: 0.35, wave: 'square', volume: 0.08, delay: at + 0.06 });
    }
    chord([523, 659, 784, 1047], { delay: 0.1, duration: 1.8, volume: 0.06 });
  },

  // 出荷：チャリーン
  ship() {
    tone({ freq: 1976, duration: 0.12, wave: 'square', volume: 0.15 });
    tone({ freq: 2637, duration: 0.6, wave: 'square', volume: 0.15, delay: 0.08 });
    tone({ freq: 3951, duration: 0.5, wave: 'sine', volume: 0.2, delay: 0.08 });
  },
};
