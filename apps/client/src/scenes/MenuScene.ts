import Phaser from 'phaser';
import { GAME, VERSION } from '@tanktrouble/shared';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('menu');
  }

  create(): void {
    const { width } = this.scale;
    this.add
      .text(width / 2, 120, 'TANK TROUBLE', {
        fontFamily: 'Georgia, serif',
        fontSize: '48px',
        color: '#f5f0e6',
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, 175, `online · 先到 ${GAME.scoreToWin} 分 · v${VERSION}`, {
        fontFamily: 'Segoe UI, sans-serif',
        fontSize: '16px',
        color: '#9aa7b5',
      })
      .setOrigin(0.5);

    this.makeButton(width / 2, 280, '本地双人', () => {
      this.scene.start('game', { mode: 'local' });
    });
    this.makeButton(width / 2, 350, '创建房间', () => {
      this.scene.start('lobby', { action: 'create' });
    });
    this.makeButton(width / 2, 420, '加入房间', () => {
      this.scene.start('lobby', { action: 'join' });
    });
  }

  private makeButton(x: number, y: number, label: string, onClick: () => void): void {
    const bg = this.add
      .rectangle(x, y, 240, 48, 0x2f6fed, 1)
      .setInteractive({ useHandCursor: true });
    const text = this.add
      .text(x, y, label, {
        fontFamily: 'Segoe UI, sans-serif',
        fontSize: '22px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    bg.on('pointerover', () => bg.setFillStyle(0x3d7dff));
    bg.on('pointerout', () => bg.setFillStyle(0x2f6fed));
    bg.on('pointerdown', onClick);
    text.setDepth(1);
  }
}
