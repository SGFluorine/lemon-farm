import * as THREE from 'three';
import { Conveyor } from './conveyor.js';
import { Collector } from './collector.js';
import { ExitTray } from './exitTray.js';
import { PackingStation } from './packingStation.js';
import { PackingMachine } from './packingMachine.js';
import { WorldLabel } from './worldLabel.js';
import { lineFootprint } from './grid.js';
import { CONFIG } from './config.js';

// ラインを建てる値段：回収機 ＋ コンベアのマス数 × 1マスの値段 ＋ 出口と箱
export function lineBuildCost(path) {
  const { collector, beltPerCell, exit } = CONFIG.build;
  return collector + beltPerCell * (path.length - 1) + exit;
}

// 1本の「ライン」：回収機 → コンベア → 出口の受け皿 → 箱（＋箱詰めマシーン）のひとまとまり。
// 建設モードで何本でも増やせる。
export class Line {
  // path：回収機とコンベアのマスの並び（[[x, z], ...]、最初のマスに回収機が乗る）
  // handlers：箱詰めの合図（onShip / onPlop / onSpecialBox）。PackingStation にそのまま渡す
  constructor(path, handlers) {
    this.path = path;
    this.buildCost = lineBuildCost(path); // 撤去したときに全額戻すため、建てた値段を覚えておく
    this.conveyor = new Conveyor(path);
    this.collector = new Collector(this.conveyor.startPoint);
    this.exitTray = new ExitTray(this.conveyor.exitPoint);

    // 箱は出口のすぐ先（コンベアの延長線上）に置く
    const { exitPoint, exitDirection } = this.conveyor;
    this.boxPosition = exitPoint.clone().addScaledVector(exitDirection, 2.9);
    this.packing = new PackingStation(this.boxPosition, handlers);

    // 箱詰めマシーンは、受け皿と箱の間の、少し横にずらした場所に置く（買うまで見えない）
    const side = new THREE.Vector3(exitDirection.z, 0, -exitDirection.x);
    this.machinePosition = exitPoint.clone().lerp(this.boxPosition, 0.5).addScaledVector(side, 2.2);
    this.packingMachine = new PackingMachine(this.machinePosition);

    this.group = new THREE.Group();
    this.group.add(
      this.conveyor.group, this.collector.group, this.exitTray.group,
      this.packing.group, this.packingMachine.group,
    );

    // 回収機・出口の上に浮かぶ「満杯！」の札
    this.collectorFullLabel = new WorldLabel('満杯！');
    this.trayFullLabel = new WorldLabel('満杯！');
  }

  // このラインに残っているレモン（回収機・ベルト・出口・箱）の種類の一覧。撤去するときに使う
  remainingLemons() {
    const { collector, conveyor, exitTray, packing } = this;
    return [
      ...collector.queue,
      ...conveyor.items.map((item) => item.type),
      ...exitTray.items.map((item) => item.type),
      ...packing.pending,
      ...packing.hopping.map((h) => h.type),
      ...packing.contents.map((c) => c.type),
    ];
  }

  // 撤去：画面に出している「満杯！」の札を片付ける（3Dの物は、呼び出し側がシーンから外す）
  dispose() {
    this.collectorFullLabel.remove();
    this.trayFullLabel.remove();
  }

  // このラインが使っているマス（建設モードで重なりを防ぐのに使う）
  get footprint() {
    const { pathCells, exitCells } = lineFootprint(this.path);
    return [...pathCells, ...exitCells];
  }

  // アップグレードの効果を、このラインの設備に反映する。
  // 後から作ったラインにも同じ効果が効くように、全部の値をまとめて受け取る
  applyUpgrades(u) {
    this.conveyor.speed = u.conveyorSpeed;
    this.collector.capacity = u.collectorCapacity;
    this.exitTray.capacity = u.trayCapacity;
    this.packing.speed = u.packingSpeed;
    this.packing.goldenChance = u.goldenChance;
    this.packingMachine.interval = u.machineInterval;
    this.packingMachine.batch = u.machineBatch;
    if (u.machineEnabled && !this.packingMachine.enabled) this.packingMachine.enable();
  }

  get collectorFull() {
    return this.collector.load >= this.collector.capacity;
  }

  // コンベアの先頭が出口の手前で止まっている（出口がいっぱいで渋滞している）か
  get jammed() {
    const { items, routeLength } = this.conveyor;
    return this.exitTray.isFull && items.length > 0 && items[0].s >= routeLength;
  }

  update(dt) {
    this.collector.update(dt);
    this.conveyor.update(dt, this.collector, this.exitTray);
    this.exitTray.update(dt);
    this.packingMachine.update(dt, this.exitTray, this.packing);
    this.packing.update(dt);
  }

  // 「満杯！」の札を、今の状態に合わせて出したり消したりする
  updateLabels(camera) {
    this.collectorFullLabel.update(camera, this.collector.entryPoint.clone().setY(4), this.collectorFull);
    this.trayFullLabel.update(camera, this.exitTray.group.position.clone().setY(3), this.exitTray.isFull);
  }
}
