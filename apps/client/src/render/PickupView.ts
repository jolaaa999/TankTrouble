import Phaser from 'phaser';
import { GAME, type PickupKind } from '@tanktrouble/shared';

const LABELS: Record<PickupKind, string> = {
  default: '?',
  laser: 'L',
  shotgun: 'S',
  gatling: 'G',
  homing: 'H',
  booby: 'B',
  frag: 'F',
  deathray: 'D',
  shield: '+',
  turbo: 'T',
  freeze: 'Z',
  blink: 'W',
  emp: 'E',
  airstrike: 'A',
};

const COLORS: Record<PickupKind, number> = {
  default: 0x888888,
  laser: 0xff1744,
  shotgun: 0xff9100,
  gatling: 0x00e676,
  homing: 0x651fff,
  booby: 0x795548,
  frag: 0xffea00,
  deathray: 0xd500f9,
  shield: 0x00e5ff,
  turbo: 0xff6d00,
  freeze: 0x82b1ff,
  blink: 0xb2ff59,
  emp: 0xffd740,
  airstrike: 0xff5252,
};

export class PickupView {
  readonly root: Phaser.GameObjects.Container;
  private bob = 0;

  constructor(scene: Phaser.Scene, kind: PickupKind) {
    const g = scene.add.graphics();
    const col = COLORS[kind] ?? 0xffffff;
    g.fillStyle(0x111111, 0.35);
    g.fillRoundedRect(-16, -16, 32, 32, 4);
    g.lineStyle(2, 0xffffff, 0.9);
    g.strokeRoundedRect(-15, -15, 30, 30, 4);
    g.fillStyle(col, 1);
    g.fillRoundedRect(-12, -12, 24, 24, 3);

    const label = scene.add
      .text(0, 0, LABELS[kind] ?? '?', {
        fontFamily: 'Courier New, monospace',
        fontSize: '16px',
        color: '#111',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    this.root = scene.add.container(0, 0, [g, label]);
  }

  setPose(x: number, y: number, t: number): void {
    this.bob = Math.sin(t * 4) * 2;
    this.root.setPosition(x, y + this.bob);
  }

  destroy(): void {
    this.root.destroy(true);
  }
}

export class MineView {
  readonly dot: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.dot = scene.add.graphics();
  }

  setPose(x: number, y: number, visible: boolean, triggered: boolean): void {
    this.dot.clear();
    if (!visible) {
      this.dot.setVisible(false);
      return;
    }
    this.dot.setVisible(true);
    this.dot.setPosition(x, y);
    this.dot.fillStyle(triggered ? 0xff1744 : 0x6d4c41, triggered ? 1 : 0.7);
    this.dot.fillTriangle(0, -GAME.mineRadius, -GAME.mineRadius, GAME.mineRadius, GAME.mineRadius, GAME.mineRadius);
  }

  destroy(): void {
    this.dot.destroy();
  }
}
