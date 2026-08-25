import Phaser from 'phaser';

export class BulletView {
  readonly dot: Phaser.GameObjects.Arc;

  constructor(scene: Phaser.Scene, kind = 'normal') {
    const radius =
      kind === 'pellet' || kind === 'shrapnel' ? 3 : kind === 'frag' ? 7 : kind === 'homing' ? 6 : 5;
    const color =
      kind === 'homing' ? 0x651fff : kind === 'frag' ? 0xffea00 : 0x212121;
    this.dot = scene.add.circle(0, 0, radius, color);
  }

  setPose(x: number, y: number): void {
    this.dot.setPosition(x, y);
    this.dot.setVisible(true);
  }

  destroy(): void {
    this.dot.destroy();
  }
}
