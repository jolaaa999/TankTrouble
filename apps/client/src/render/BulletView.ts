import Phaser from 'phaser';
import { GAME } from '@tanktrouble/shared';

export class BulletView {
  readonly dot: Phaser.GameObjects.Arc;

  constructor(scene: Phaser.Scene) {
    this.dot = scene.add.circle(0, 0, GAME.bulletRadius, 0x222222);
  }

  setPose(x: number, y: number): void {
    this.dot.setPosition(x, y);
    this.dot.setVisible(true);
  }

  destroy(): void {
    this.dot.destroy();
  }
}
