import Phaser from 'phaser';
import { GAME, SKILLS, pickupLetter, parsePickup, type PickupKind } from '@tanktrouble/shared';

function pickupColor(kind: PickupKind): number {
  const parsed = parsePickup(kind);
  if (!parsed) return 0xffffff;
  return SKILLS[parsed.skillId].color;
}

export class PickupView {
  readonly root: Phaser.GameObjects.Container;
  private bob = 0;

  constructor(scene: Phaser.Scene, kind: PickupKind) {
    const g = scene.add.graphics();
    const col = pickupColor(kind);
    const parsed = parsePickup(kind);
    const isPlus = parsed?.plus ?? false;
    g.fillStyle(0x111111, 0.35);
    g.fillRoundedRect(-16, -16, 32, 32, 4);
    g.lineStyle(2, isPlus ? 0xffd54f : 0xffffff, 0.9);
    g.strokeRoundedRect(-15, -15, 30, 30, 4);
    g.fillStyle(col, 1);
    g.fillRoundedRect(-12, -12, 24, 24, 3);

    const label = scene.add
      .text(0, 0, pickupLetter(kind), {
        fontFamily: 'Courier New, monospace',
        fontSize: isPlus ? '13px' : '16px',
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
