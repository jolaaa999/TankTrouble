import Phaser from 'phaser';
import { GAME, VERSION } from '@tanktrouble/shared';
import { getColyseusUrl, pingServer } from '../net/ColyseusClient';

export class MenuScene extends Phaser.Scene {
  private fillWithBots = true;
  private aiToggleLabel: Phaser.GameObjects.Text | null = null;
  private aiToggleBg: Phaser.GameObjects.Rectangle | null = null;
  private soloBtnBg: Phaser.GameObjects.Rectangle | null = null;
  private soloBtnLabel: Phaser.GameObjects.Text | null = null;
  private tipText: Phaser.GameObjects.Text | null = null;

  constructor() {
    super('menu');
  }

  create(): void {
    const { width } = this.scale;
    this.add
      .text(width / 2, 90, 'TANK TROUBLE', {
        fontFamily: 'Georgia, serif',
        fontSize: '48px',
        color: '#f5f0e6',
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, 140, `online · 先到 ${GAME.scoreToWin} 分 · v${VERSION}`, {
        fontFamily: 'Segoe UI, sans-serif',
        fontSize: '16px',
        color: '#9aa7b5',
      })
      .setOrigin(0.5);

    const serverHint = this.add
      .text(width / 2, 172, `服务器：${getColyseusUrl()}`, {
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

    this.makeAiToggle(width / 2, 220);

    this.makeButton(width / 2, 290, '本地双人', () => {
      this.scene.start('game', {
        mode: 'local',
        fillBots: this.fillWithBots,
      });
    });
    this.makeSoloButton(width / 2, 350);
    this.makeButton(width / 2, 410, '创建房间', () => {
      this.scene.start('lobby', {
        action: 'create',
        fillWithBots: this.fillWithBots,
      });
    });
    this.makeButton(width / 2, 470, '加入房间', () => {
      this.scene.start('lobby', { action: 'join' });
    });

    this.tipText = this.add
      .text(width / 2, 530, '', {
        fontFamily: 'Segoe UI, sans-serif',
        fontSize: '12px',
        color: '#90a4ae',
        align: 'center',
      })
      .setOrigin(0.5);
    this.refreshAiUi();
  }

  private makeAiToggle(x: number, y: number): void {
    this.aiToggleBg = this.add
      .rectangle(x, y, 280, 44, 0x455a64, 1)
      .setInteractive({ useHandCursor: true });
    this.aiToggleLabel = this.add
      .text(x, y, '', {
        fontFamily: 'Segoe UI, sans-serif',
        fontSize: '18px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    this.aiToggleBg.on('pointerdown', () => {
      this.fillWithBots = !this.fillWithBots;
      this.refreshAiUi();
    });
    this.aiToggleBg.on('pointerover', () => {
      this.aiToggleBg?.setFillStyle(this.fillWithBots ? 0x43a047 : 0x607d8b);
    });
    this.aiToggleBg.on('pointerout', () => {
      this.aiToggleBg?.setFillStyle(this.fillWithBots ? 0x2e7d32 : 0x455a64);
    });
  }

  private makeSoloButton(x: number, y: number): void {
    this.soloBtnBg = this.add
      .rectangle(x, y, 240, 48, 0x2f6fed, 1)
      .setInteractive({ useHandCursor: true });
    this.soloBtnLabel = this.add
      .text(x, y, '单人 + AI', {
        fontFamily: 'Segoe UI, sans-serif',
        fontSize: '22px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    this.soloBtnBg.on('pointerover', () => {
      if (!this.fillWithBots) return;
      this.soloBtnBg?.setFillStyle(0x3d7dff);
    });
    this.soloBtnBg.on('pointerout', () => {
      this.soloBtnBg?.setFillStyle(this.fillWithBots ? 0x2f6fed : 0x546e7a);
    });
    this.soloBtnBg.on('pointerdown', () => {
      if (!this.fillWithBots) return;
      this.scene.start('game', { mode: 'local', withBots: true, fillBots: true });
    });
  }

  private refreshAiUi(): void {
    const on = this.fillWithBots;
    this.aiToggleBg?.setFillStyle(on ? 0x2e7d32 : 0x455a64);
    this.aiToggleLabel?.setText(on ? 'AI 凑满 4 人：开' : 'AI 凑满 4 人：关');
    this.soloBtnBg?.setFillStyle(on ? 0x2f6fed : 0x546e7a);
    this.soloBtnLabel?.setAlpha(on ? 1 : 0.45);
    this.tipText?.setText(
      on
        ? '开：本地/联机不足 4 人时用 AI 补齐 · 关：只用人人开打'
        : 'AI 已关 · 联机至少 2 人 · 单人模式不可用',
    );
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
