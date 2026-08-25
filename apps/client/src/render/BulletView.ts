import Phaser from 'phaser';

/** Renders bullets; shrapnel uses a small triangle that faces velocity. */
export class BulletView {
  readonly root: Phaser.GameObjects.GameObject;
  private readonly tri: Phaser.GameObjects.Triangle | null;
  private readonly dot: Phaser.GameObjects.Arc | null;

  constructor(scene: Phaser.Scene, kind = 'normal') {
    if (kind === 'shrapnel') {
      this.tri = scene.add.triangle(0, 0, 0, -5, 4.5, 4, -4.5, 4, 0xffea00);
      this.tri.setStrokeStyle(1, 0xff6f00, 1);
      this.dot = null;
      this.root = this.tri;
    } else {
      const radius =
        kind === 'pellet' ? 3 : kind === 'frag' ? 7 : kind === 'homing' ? 6 : kind === 'cannon' ? 9 : 5;
      const color =
        kind === 'homing'
          ? 0x651fff
          : kind === 'frag'
            ? 0xffea00
            : kind === 'cannon'
              ? 0x37474f
              : 0x212121;
      this.dot = scene.add.circle(0, 0, radius, color);
      this.tri = null;
      this.root = this.dot;
    }
  }

  setPose(x: number, y: number, angle = 0): void {
    if (this.tri) {
      this.tri.setPosition(x, y);
      this.tri.setRotation(angle + Math.PI / 2);
      this.tri.setVisible(true);
    } else if (this.dot) {
      this.dot.setPosition(x, y);
      this.dot.setVisible(true);
    }
  }

  destroy(): void {
    this.tri?.destroy();
    this.dot?.destroy();
  }
}
