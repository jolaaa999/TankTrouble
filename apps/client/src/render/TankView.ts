import Phaser from 'phaser';
import { GAME } from '@tanktrouble/shared';

export class TankView {
  readonly body: Phaser.GameObjects.Container;

  constructor(scene: Phaser.Scene, color: string) {
    const g = scene.add.graphics();
    const c = Phaser.Display.Color.HexStringToColor(color).color;
    g.fillStyle(c, 1);
    g.fillCircle(0, 0, GAME.tankRadius);
    g.fillStyle(0x111111, 1);
    g.fillRect(4, -4, GAME.tankRadius + 6, 8);
    this.body = scene.add.container(0, 0, [g]);
  }

  setPose(x: number, y: number, angle: number, alive: boolean): void {
    this.body.setPosition(x, y);
    this.body.setRotation(angle);
    this.body.setAlpha(alive ? 1 : 0.25);
    this.body.setVisible(true);
  }

  destroy(): void {
    this.body.destroy(true);
  }
}
