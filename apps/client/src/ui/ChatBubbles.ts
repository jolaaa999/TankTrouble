import Phaser from 'phaser';

const BUBBLE_TTL_MS = 4200;
const MAX_WIDTH = 148;
const PAD_X = 10;
const PAD_Y = 6;

type ActiveBubble = {
  container: Phaser.GameObjects.Container;
  expiresAt: number;
};

export class ChatBubbles {
  private readonly scene: Phaser.Scene;
  private readonly bubbles = new Map<string, ActiveBubble>();

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  show(tankId: string, text: string): void {
    this.clear(tankId);

    const label = this.scene.add
      .text(0, 0, text, {
        fontFamily: 'Segoe UI, Microsoft YaHei, sans-serif',
        fontSize: '13px',
        color: '#1a2430',
        wordWrap: { width: MAX_WIDTH },
        align: 'center',
      })
      .setOrigin(0.5);

    const w = Math.min(MAX_WIDTH + PAD_X * 2, label.width + PAD_X * 2);
    const h = label.height + PAD_Y * 2;
    const gfx = this.scene.add.graphics();
    gfx.fillStyle(0xffffff, 0.94);
    gfx.lineStyle(2, 0x263238, 0.35);
    gfx.fillRoundedRect(-w / 2, -h / 2, w, h, 8);
    gfx.strokeRoundedRect(-w / 2, -h / 2, w, h, 8);
    gfx.fillTriangle(-5, h / 2, 5, h / 2, 0, h / 2 + 8);

    const container = this.scene.add
      .container(0, 0, [gfx, label])
      .setDepth(25)
      .setAlpha(0);

    this.bubbles.set(tankId, {
      container,
      expiresAt: this.scene.time.now + BUBBLE_TTL_MS,
    });

    this.scene.tweens.add({
      targets: container,
      alpha: 1,
      y: '-=6',
      duration: 160,
      ease: 'Back.easeOut',
    });
  }

  update(positions: Map<string, { x: number; y: number }>, now: number): void {
    for (const [tankId, bubble] of this.bubbles) {
      const pos = positions.get(tankId);
      if (!pos) {
        bubble.container.setVisible(false);
        continue;
      }
      bubble.container.setVisible(true);
      bubble.container.setPosition(pos.x, pos.y - 46);

      const left = bubble.expiresAt - now;
      if (left < 600) {
        bubble.container.setAlpha(Math.max(0, left / 600));
      }

      if (now >= bubble.expiresAt) {
        this.clear(tankId);
      }
    }
  }

  destroy(): void {
    for (const id of [...this.bubbles.keys()]) this.clear(id);
  }

  private clear(tankId: string): void {
    const bubble = this.bubbles.get(tankId);
    if (!bubble) return;
    bubble.container.destroy();
    this.bubbles.delete(tankId);
  }
}
