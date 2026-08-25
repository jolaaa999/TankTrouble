import Phaser from 'phaser';

export type ResultData =
  | { mode: 'local'; message: string }
  | { mode: 'online'; message: string; room: unknown; sessionId: string };

export class ResultScene extends Phaser.Scene {
  private result!: ResultData;

  constructor() {
    super('result');
  }

  init(data: ResultData): void {
    this.result = data;
  }

  create(): void {
    const { width, height } = this.scale;
    this.add
      .text(width / 2, height / 2 - 40, this.result.message, {
        fontFamily: 'Georgia, serif',
        fontSize: '36px',
        color: '#f5f0e6',
      })
      .setOrigin(0.5);

    const again = this.add
      .rectangle(width / 2, height / 2 + 40, 200, 44, 0x2f6fed)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(width / 2, height / 2 + 40, '再来一局', {
        fontFamily: 'Segoe UI, sans-serif',
        fontSize: '20px',
        color: '#fff',
      })
      .setOrigin(0.5);

    again.on('pointerdown', () => {
      if (this.result.mode === 'local') {
        this.scene.start('game', { mode: 'local' });
      } else {
        this.scene.start('menu');
      }
    });

    const menu = this.add
      .rectangle(width / 2, height / 2 + 100, 200, 44, 0x445566)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(width / 2, height / 2 + 100, '主菜单', {
        fontFamily: 'Segoe UI, sans-serif',
        fontSize: '20px',
        color: '#fff',
      })
      .setOrigin(0.5);
    menu.on('pointerdown', () => this.scene.start('menu'));
  }
}
