// ゲームの調整用の数値をここに集める。
// 「数値を変えたいときは、このファイルだけ見ればいい」状態を保つ。

export const CONFIG = {
  // 土地。世界は「区画」（1区画 = plotCells × plotCells マス）が並んだもの。
  // 最初は中心から ±initialRadius 区画（3×3区画）を持っていて、「土地を広げる」で1区画ずつ増やせる。
  land: {
    plotCells: 7, // 1区画の一辺のマス数（7マス = 14メートル）
    initialRadius: 1, // 最初の土地：中心から±1区画 = 3×3区画
    maxRadius: 2, // 広げられる限界：中心から±2区画 = 5×5区画
    treesPerNewPlot: 2, // 新しく広げた区画に生える木の数
  },

  // コンベア用に空けておくエリア（最初の土地の手前側の帯）。最初の木はここに生えない。
  // z がこの値より大きい場所が予約エリア。
  conveyorReservedZ: 12,

  // 木
  treeCount: 5,
  treeMinDistance: 6, // 木同士の最小距離
  lemonsPerTree: { min: 3, max: 5 },

  // レモンの成長にかかる秒数（1個ごとにこの範囲でばらつく）
  growSeconds: { min: 8, max: 12 },

  // レモンの種類。chance は出る確率、price は1個の値段。
  // 虹は「金の確率 × chanceOfGold」で出る（金の確率アップを買うと虹も一緒に上がる）。
  // 普通は「残り全部」なので、金・銀・虹が増えた分だけ減る。
  lemonTypes: {
    // 値段の目安：普通10個の箱（¥1,000）100箱分 ＝ 虹の箱1つ ＝ 土地1区画（¥100,000）
    normal: { chance: 0.85, price: 100, color: 0xffe14d },
    silver: { chance: 0.12, price: 250, color: 0xd9dde3 },
    gold: { chance: 0.03, price: 1000, color: 0xffb300 },
    rainbow: { chanceOfGold: 0.1, price: 30000, color: 0xff66cc }, // 色は虹色に変わり続ける
  },

  // ベルトコンベア。
  // path は「マスの並び」（マス単位の座標 [x, z]）。隣り合うマスを順番に並べる。
  // 最初のマスに回収機が乗り、最後のマスの先に出口がつく。
  // ⑦で自由に設置できるようにするときは、この並びをプレイヤーが作る形にする。
  conveyor: {
    cellSize: 2, // 1マスの大きさ
    path: [
      [-6, 7], [-5, 7], [-4, 7], [-3, 7], [-2, 7], [-1, 7], [0, 7],
      [0, 8], [0, 9],
      [1, 9], [2, 9], [3, 9], [4, 9], [5, 9],
    ],
    speed: 2.5, // レモンが流れる速さ（1秒あたりの距離）。⑤のアップグレードで上がる
    gap: 0.9, // ベルト上のレモン同士の最小間隔
  },

  // 収穫したレモンが回収機まで飛ぶ演出
  flight: {
    seconds: 0.8, // 飛んでいる時間
    arcHeight: 6, // 山なりの高さ
    spins: 2, // 飛んでいる間に回る回数
  },

  // 箱詰めと出荷
  packing: {
    boxCapacity: 10, // 1箱に入るレモンの数
    insertInterval: 0.12, // ポコポコ入れるときの1個ごとの間隔（秒）
    hopSeconds: 0.3, // 1個が箱に跳び込むまでの時間
    // 金の箱イベント：新しい箱が来るとき、この確率で金の箱になり、出荷額が multiplier 倍になる
    goldenBox: { chance: 0.05, multiplier: 3 },
    // 虹の箱イベント：「金の箱の確率 × chanceOfGolden」で虹の箱になり、出荷額が multiplier 倍になる
    rainbowBox: { chanceOfGolden: 0.3, multiplier: 100 }, // 金の箱の3/10（最初は1.5%）
  },

  // 建設モードで新しいラインを作るときの値段
  build: {
    collector: 800, // 回収機
    beltPerCell: 40, // コンベア1マス
    exit: 800, // 出口と箱のセット
  },

  // 収穫係（家・農家）。近くの成長しきったレモンを自動で収穫する。最初の値（アップグレードで変わる）
  house: {
    radius: 9, // この距離までのレモンを収穫する
    interval: 2.5, // 何秒に1個収穫するか
  },

  // レモンをためておける上限（アップグレードで広がる）
  capacity: {
    collector: 10, // 回収機（飛んでいる途中のレモンも数に入れる）
    exitTray: 18, // 出口の受け皿（3×3 で2段分）
    warnRatio: 0.8, // この割合を超えたら、表示をオレンジにして注意をうながす
  },

  // アップグレードのマップ（スキルツリー）の、各ノードのアイコン
  upgradeIcons: {
    conveyorSpeed: '⏩', packingMachine: '🤖', machineSpeed: '⚡', machineBatch: '📦',
    multiHarvest: '🧺', multiPickup: '✋', packingSpeed: '🎁',
    house: '🏠', farmer: '👨‍🌾', workerSpeed: '👟', workerRange: '📡',
    goldChance: '🌟', goldenBoxChance: '🎉', magicMachine: '🔮', magicChance: '✨',
    collectorCapacity: '🫙', trayCapacity: '📥',
    growthSpeed: '🌱', plantTree: '🌳', expandLand: '🗺️',
  },

  // マップの枝（カテゴリ）。ids の順に、根元から先へ並ぶ。
  // 1つ前のノードを Lv.1 以上にすると、次のノードが買えるようになる
  upgradeCategories: [
    { label: '⚙️ 自動化', ids: ['conveyorSpeed', 'packingMachine', 'machineSpeed', 'machineBatch'] },
    { label: '✋ 手作業', ids: ['multiHarvest', 'multiPickup', 'packingSpeed'] },
    { label: '👨‍🌾 収穫係', ids: ['house', 'farmer', 'workerSpeed', 'workerRange'] },
    { label: '🌈 運・レア', ids: ['goldChance', 'goldenBoxChance', 'magicMachine', 'magicChance'] },
    { label: '📦 容量', ids: ['collectorCapacity', 'trayCapacity'] },
    { label: '🌳 土地・木', ids: ['growthSpeed', 'plantTree', 'expandLand'] },
  ],

  // アップグレード。値段は「最初の値段 × costGrowth の（買った回数）乗」で上がっていく。
  upgrades: {
    conveyorSpeed: {
      name: 'コンベアの速度',
      description: '流れる速さ +25%',
      baseCost: 150,
      costGrowth: 1.5,
      maxLevel: 10,
      bonusPerLevel: 0.25,
    },
    growthSpeed: {
      name: '成長速度',
      description: '育つ速さ +20%',
      baseCost: 150,
      costGrowth: 1.5,
      maxLevel: 10,
      bonusPerLevel: 0.2,
    },
    packingMachine: {
      name: '箱詰めマシーン',
      description: '自動で箱詰め（1.5秒に1個）',
      baseCost: 600,
      costGrowth: 1,
      maxLevel: 1,
      interval: 1.5, // 何秒に1個入れるか。手で連打するより遅くしておく
    },
    machineSpeed: {
      name: 'マシーンの速度',
      description: '箱詰めマシーンが速くなる +50%',
      baseCost: 400,
      costGrowth: 1.6,
      maxLevel: 6, // 最大で 0.375秒に1個（1秒に約2.7個）。本気で連打する手の方がまだ速い
      bonusPerLevel: 0.5,
      requires: 'packingMachine', // これを買うまでは押せない
    },
    machineBatch: {
      name: 'マシーンのまとめ詰め',
      description: '箱詰めマシーンが1回で複数個まとめて送る',
      baseCost: 8000,
      costGrowth: 1.8,
      maxLevel: 4, // Lv.4 で1回5個
      requires: 'packingMachine',
    },
    goldChance: {
      name: '金のレモン確率',
      description: '金のレモンが出やすくなる',
      baseCost: 300,
      costGrowth: 1.7,
      maxLevel: 10,
      // 上がり幅は、レベルが上がるほど小さくなる：
      //   増える確率 = maxBonus × (1 − decay^レベル)
      //   Lv.1 で +2.4%、Lv.3 で +5.9%、Lv.10 で +10.7%（元の3%と合わせて約14%）
      maxBonus: 0.12,
      decay: 0.8,
    },
    goldenBoxChance: {
      name: '金の箱の確率',
      description: '金の箱（出荷額×3）が出やすくなる',
      baseCost: 400,
      costGrowth: 1.7,
      maxLevel: 10,
      // 金のレモン確率と同じく、上がり幅はだんだん小さくなる（Lv.10で約19%）
      maxBonus: 0.15,
      decay: 0.8,
    },
    multiHarvest: {
      name: 'まとめ収穫',
      description: '1クリックで近くのレモンもまとめて投げる',
      baseCost: 250,
      costGrowth: 1.8,
      maxLevel: 4, // Lv.4 で1クリック5個
    },
    multiPickup: {
      name: 'まとめ拾い',
      description: '出口のレモンを1クリックでまとめて拾う',
      baseCost: 200,
      costGrowth: 1.8,
      maxLevel: 4, // Lv.4 で1クリック5個
    },
    packingSpeed: {
      name: '箱に入れる速さ',
      description: 'ポコポコ入る速さ +50%',
      baseCost: 200,
      costGrowth: 1.6,
      maxLevel: 5,
      bonusPerLevel: 0.5,
    },
    collectorCapacity: {
      name: '回収機の容量',
      description: '回収機にためられる数が増える',
      baseCost: 300,
      costGrowth: 1.7,
      maxLevel: 6,
      amountPerLevel: 5,
    },
    trayCapacity: {
      name: '出口の容量',
      description: '出口にためられる数が増える',
      baseCost: 300,
      costGrowth: 1.7,
      maxLevel: 6,
      amountPerLevel: 9, // 1段（3×3）ずつ増える
    },
    magicMachine: {
      name: '魔法のマシーン',
      description: '下を通ったレモンが確率で金に',
      baseCost: 1500,
      costGrowth: 1,
      maxLevel: 1,
      chance: 0.05, // 金に変わる確率（買ったとき）
      routeRatio: 0.3, // コンベアのどこに置くか（入口0 〜 出口1 の割合）
    },
    magicChance: {
      name: '魔法の成功率',
      description: '魔法で金に変わる確率が上がる',
      baseCost: 800,
      costGrowth: 1.8,
      maxLevel: 8,
      // 金は普通の10倍の値段なので、上がり幅は控えめに、だんだん小さくなる（元の5%と合わせてLv.8で約26%）
      maxBonus: 0.25,
      decay: 0.8,
      requires: 'magicMachine',
    },
    house: {
      name: '家を建てる',
      description: '収穫係が近くのレモンを自動で収穫',
      baseCost: 1000,
      costGrowth: 1.8,
      maxLevel: 5,
      unit: '軒',
      placeable: true, // 買うときに、置く場所を選ぶ（置いた時点でお金を払う）
    },
    farmer: {
      name: '農家を増やす',
      description: '農家が1人、木の多い場所に自動で立つ',
      baseCost: 5000,
      costGrowth: 1.6,
      maxLevel: 10,
      unit: '人',
    },
    workerSpeed: {
      name: '収穫係の速さ',
      description: '家・農家の収穫が速くなる +30%',
      baseCost: 3000,
      costGrowth: 1.7,
      maxLevel: 5, // Lv.5 で 2.5秒 → 1秒に1個
      bonusPerLevel: 0.3,
    },
    workerRange: {
      name: '収穫係の届く範囲',
      description: '家・農家が届く範囲が広がる',
      baseCost: 3000,
      costGrowth: 1.7,
      maxLevel: 5, // Lv.5 で 半径9 → 19メートル
      amountPerLevel: 2,
    },
    expandLand: {
      name: '土地を広げる',
      description: '隣の区画を1つ買って、土地を広げる',
      baseCost: 100000,
      costGrowth: 1.5,
      maxLevel: 16, // 5×5区画 − 最初の3×3区画 = 16区画
      unit: '区画',
      placeable: true, // 買うときに、広げる区画を選ぶ
    },
    plantTree: {
      name: '木を植える',
      description: '空いている場所に木を1本',
      baseCost: 500,
      costGrowth: 1.6,
      maxLevel: 15,
      unit: '本', // 「Lv」ではなく「+3本」のように表示する
    },
  },

  // 効果音の全体の音量（0〜1）
  soundVolume: 0.5,

  // クリック判定：画面上でこのピクセル数以内なら、そのレモンを選んだことにする
  pickRadiusPx: 28,

  // カメラ
  camera: {
    moveSpeed: 15, // WASD で動く速さ（1秒あたり）
    angleDeg: 55, // 見下ろす角度
    distance: 30, // 最初の距離
    minDistance: 18,
    maxDistance: 60,
    zoomStep: 0.0015, // ホイール1目盛りあたりの拡大・縮小の強さ
  },
};
