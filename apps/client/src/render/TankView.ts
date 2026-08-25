import Phaser from 'phaser';
import { GAME } from '@tanktrouble/shared';

/** Classic Tank Trouble–style top-down tank (procedural, not ripped assets). */
export class TankView {
  readonly body: Phaser.GameObjects.Container;
  private readonly shieldRing: Phaser.GameObjects.Graphics;
  private readonly g: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, colorIndex: number) {
    const color = GAME.playerColors[colorIndex % GAME.playerColors.length]!;
    const dark = GAME.playerColorDark[colorIndex % GAME.playerColorDark.length]!;
    const c = Phaser.Display.Color.HexStringToColor(color).color;
    const d = Phaser.Display.Color.HexStringToColor(dark).color;

    this.g = scene.add.graphics();
    // tracks
    this.g.fillStyle(0x2b2b2b, 1);
    this.g.fillRoundedRect(-16, -14, 6, 28, 2);
    this.g.fillRoundedRect(10, -14, 6, 28, 2);
    // body
    this.g.fillStyle(d, 1);
    this.g.fillRoundedRect(-12, -12, 24, 24, 6);
    this.g.fillStyle(c, 1);
    this.g.fillRoundedRect(-10, -10, 20, 20, 5);
    // hatch
    this.g.fillStyle(0xffffff, 0.22);
    this.g.fillCircle(-2, -2, 4);
    // barrel base
    this.g.fillStyle(d, 1);
    this.g.fillRoundedRect(4, -5, 18, 10, 2);
    this.g.fillStyle(0x1a1a1a, 1);
    this.g.fillRoundedRect(6, -3, 16, 6, 1);

    this.shieldRing = scene.add.graphics();
    this.body = scene.add.container(0, 0, [this.g, this.shieldRing]);
  }

  setPose(
    x: number,
    y: number,
    angle: number,
    alive: boolean,
    shieldTime = 0,
  ): void {
    this.body.setPosition(x, y);
    this.body.setRotation(angle);
    this.body.setAlpha(alive ? 1 : 0.2);
    this.shieldRing.clear();
    if (alive && shieldTime > 0) {
      this.shieldRing.lineStyle(3, 0x80deea, 0.85);
      this.shieldRing.strokeCircle(0, 0, GAME.tankRadius + 6);
    }
  }

  destroy(): void {
    this.body.destroy(true);
  }
}
