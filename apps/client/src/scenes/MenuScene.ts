import Phaser from 'phaser';
import { GAME, VERSION } from '@tanktrouble/shared';
import { getColyseusUrl, pingServer } from '../net/ColyseusClient';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('menu');
  }

  create(): void {
    const { width } = this.scale;
    this.add
      .text(width / 2, 100, 'TANK TROUBLE', {
        fontFamily: 'Georgia, serif',
        fontSize: '48px',
        color: '#f5f0e6',
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, 150, `online · 先到 ${GAME.scoreToWin} 分 · v${VERSION}`, {
        fontFamily: 'Segoe UI, sans-serif',
        fontSize: '16px',
        color: '#9aa7b5',
      })
      .setOrigin(0.5);

    const serverHint = this.add
      .text(width / 2, 185, `服务器：${getColyseusUrl()}`, {
        fontFamily: 'Segoe UI, sans-serif',
        fontSize: '13px',
        color: '#80cbc4',
        align: 'center',
      })
      .setOrigin(0.5);

    void pingServer().then((p) => {
      serverHint.setColor(p.ok ? '#81c784' : '#ef9a9a');
      serverHint.setText(p.ok ? p.detail : `未连接：${getColyseusUrl()}`);
    });

    this.makeButton(width / 2, 260, '本地双人', () => {
      this.scene.start('game', { mode: 'local' });
    });
    this.makeButton(width / 2, 330, '创建房间', () => {
      this.scene.start('lobby', { action: 'create' });
    });
    this.makeButton(width / 2, 400, '加入房间', () => {
      this.scene.start('lobby', { action: 'join' });
    });

    this.add
      .text(
        width / 2,
        470,
        '技能：L激光 S散弹 G加特林 H追踪 B地雷 F破片 D死光 +护盾\n拾取后炮管/挂件会变样',
        {
          fontFamily: 'Segoe UI, sans-serif',
          fontSize: '12px',
          color: '#90a4ae',
          align: 'center',
        },
      )
      .setOrigin(0.5);
  }

  private makeButton(x: number, y: number, label: string, onClick: () => void): void {
    const bg = this.add
      .rectangle(x, y, 240, 48, 0x2f6fed, 1)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(x, y, label, {
        fontFamily: 'Segoe UI, sans-serif',
        fontSize: '22px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    bg.on('pointerover', () => bg.setFillStyle(0x3d7dff));
    bg.on('pointerout', () => bg.setFillStyle(0x2f6fed));
    bg.on('pointerdown', onClick);
  }
}
