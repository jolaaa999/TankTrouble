import Phaser from 'phaser';
import { VERSION, type MatchMode } from '@tanktrouble/shared';
import { getColyseusUrl, pingServer } from '../net/ColyseusClient';

const GITHUB_URL = 'https://github.com/jolaaa999/TankTrouble';

function docsUrl(): string {
  if (typeof window === 'undefined') return '/docs/';
  return `${window.location.origin}/docs/`;
}

function openExternal(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer');
}

export class MenuScene extends Phaser.Scene {
  private fillWithBots = false;
  private matchMode: MatchMode = 'classic';
  private rosterSize = 8;
  private aiToggleLabel: Phaser.GameObjects.Text | null = null;
  private aiToggleBg: Phaser.GameObjects.Rectangle | null = null;
  private modeToggleLabel: Phaser.GameObjects.Text | null = null;
  private modeToggleBg: Phaser.GameObjects.Rectangle | null = null;
  private rosterLabel: Phaser.GameObjects.Text | null = null;
  private rosterBg: Phaser.GameObjects.Rectangle | null = null;
  private soloBtnBg: Phaser.GameObjects.Rectangle | null = null;
  private soloBtnLabel: Phaser.GameObjects.Text | null = null;
  private tipText: Phaser.GameObjects.Text | null = null;

  constructor() {
    super('menu');
  }

  create(): void {
    const { width, height } = this.scale;
    this.add
      .text(width / 2, 70, 'TANK TROUBLE', {
        fontFamily: 'Georgia, serif',
        fontSize: '44px',
        color: '#f5f0e6',
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, 112, `v${VERSION} · A–Z 26 技能 · 联机对战`, {
        fontFamily: 'Segoe UI, sans-serif',
        fontSize: '14px',
        color: '#9aa7b5',
      })
      .setOrigin(0.5);

    const serverHint = this.add
      .text(width / 2, 138, `服务器：${getColyseusUrl()}`, {
        fontFamily: 'Segoe UI, sans-serif',
        fontSize: '12px',
        color: '#80cbc4',
        align: 'center',
      })
      .setOrigin(0.5);

    void pingServer().then((p) => {
      serverHint.setColor(p.ok ? '#81c784' : '#ef9a9a');
      serverHint.setText(p.ok ? p.detail : `未连接：${getColyseusUrl()}`);
    });

    this.makeAiToggle(width / 2, 178);
    this.makeModeToggle(width / 2, 228);
    this.makeRosterToggle(width / 2, 278);

    this.makeButton(width / 2, 338, '本地双人', () => {
      this.scene.start('game', {
        mode: 'local',
        fillBots: this.fillWithBots,
        matchMode: this.matchMode,
        rosterSize: this.matchMode === 'mega' ? this.rosterSize : 4,
      });
    });
    this.makeSoloButton(width / 2, 390);
    this.makeButton(width / 2, 442, '创建房间', () => {
      this.scene.start('lobby', {
        action: 'create',
        fillWithBots: this.fillWithBots,
        mode: this.matchMode,
        rosterSize: this.matchMode === 'mega' ? this.rosterSize : 4,
      });
    });
    this.makeButton(width / 2, 494, '加入房间', () => {
      this.scene.start('lobby', { action: 'join' });
    });
    this.makeButton(width / 2, 536, '地图编辑器', () => {
      this.scene.start('mazeEditor');
    }, 0x00838f);

    this.tipText = this.add
      .text(width / 2, 578, '', {
        fontFamily: 'Segoe UI, sans-serif',
        fontSize: '11px',
        color: '#90a4ae',
        align: 'center',
        wordWrap: { width: width - 60 },
      })
      .setOrigin(0.5);

    this.makeLinkButton(width / 2 - 72, 628, 128, '文档', docsUrl(), 0x5e35b1);
    this.makeLinkButton(width / 2 + 72, 628, 128, 'GitHub', GITHUB_URL, 0x37474f);
    this.makeFooter(width, height);

    this.refreshAiUi();
  }

  private makeAiToggle(x: number, y: number): void {
    this.aiToggleBg = this.add
      .rectangle(x, y, 300, 40, 0x455a64, 1)
      .setInteractive({ useHandCursor: true });
    this.aiToggleLabel = this.add
      .text(x, y, '', {
        fontFamily: 'Segoe UI, sans-serif',
        fontSize: '17px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    this.aiToggleBg.on('pointerdown', () => {
      this.fillWithBots = !this.fillWithBots;
      this.refreshAiUi();
    });
  }

  private makeModeToggle(x: number, y: number): void {
    this.modeToggleBg = this.add
      .rectangle(x, y, 300, 40, 0x37474f, 1)
      .setInteractive({ useHandCursor: true });
    this.modeToggleLabel = this.add
      .text(x, y, '', {
        fontFamily: 'Segoe UI, sans-serif',
        fontSize: '17px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    this.modeToggleBg.on('pointerdown', () => {
      this.matchMode = this.matchMode === 'classic' ? 'mega' : 'classic';
      this.refreshAiUi();
    });
  }

  private makeRosterToggle(x: number, y: number): void {
    this.rosterBg = this.add
      .rectangle(x, y, 300, 40, 0x455a64, 1)
      .setInteractive({ useHandCursor: true });
    this.rosterLabel = this.add
      .text(x, y, '', {
        fontFamily: 'Segoe UI, sans-serif',
        fontSize: '17px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    this.rosterBg.on('pointerdown', () => {
      if (this.matchMode !== 'mega') return;
      this.rosterSize = this.rosterSize === 8 ? 6 : 8;
      this.refreshAiUi();
    });
  }

  private makeSoloButton(x: number, y: number): void {
    this.soloBtnBg = this.add
      .rectangle(x, y, 240, 44, 0x2f6fed, 1)
      .setInteractive({ useHandCursor: true });
    this.soloBtnLabel = this.add
      .text(x, y, '单人 + AI', {
        fontFamily: 'Segoe UI, sans-serif',
        fontSize: '20px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    this.soloBtnBg.on('pointerover', () => {
      this.soloBtnBg?.setFillStyle(0x3d7dff);
    });
    this.soloBtnBg.on('pointerout', () => {
      this.soloBtnBg?.setFillStyle(0x2f6fed);
    });
    this.soloBtnBg.on('pointerdown', () => {
      // Solo always fills with bots, independent of the lobby AI-fill toggle
      this.scene.start('game', {
        mode: 'local',
        withBots: true,
        fillBots: true,
        matchMode: this.matchMode,
        rosterSize: this.matchMode === 'mega' ? this.rosterSize : 4,
      });
    });
  }

  private refreshAiUi(): void {
    const on = this.fillWithBots;
    const mega = this.matchMode === 'mega';
    this.aiToggleBg?.setFillStyle(on ? 0x2e7d32 : 0x455a64);
    this.aiToggleLabel?.setText(on ? 'AI 凑满人数：开' : 'AI 凑满人数：关');
    this.modeToggleBg?.setFillStyle(mega ? 0x6a1b9a : 0x37474f);
    this.modeToggleLabel?.setText(
      mega ? '模式：超多人（红蓝对阵 · 先到 10）' : '模式：经典（混战 · 先到 5）',
    );
    this.rosterBg?.setFillStyle(mega ? 0x00838f : 0x455a64);
    this.rosterBg?.setAlpha(mega ? 1 : 0.45);
    this.rosterLabel?.setText(
      mega ? `超多人席位：${this.rosterSize}（点切 6/8）` : '席位：经典 4 人',
    );
    this.soloBtnBg?.setFillStyle(0x2f6fed);
    this.soloBtnLabel?.setAlpha(1);
    this.tipText?.setText(
      mega
        ? '超多人：两队对打，灭掉对面全员得 1 局，先到 10；越往后地图越大。T加速 Z冰冻 W闪现 E电磁 A空袭'
        : '经典 4 人混战。激光是瞬时光束。新技能：T加速 / Z冰冻 / W闪现 / E电磁脉冲 / A空袭',
    );
  }

  private makeLinkButton(
    x: number,
    y: number,
    w: number,
    label: string,
    url: string,
    color: number,
  ): void {
    const bg = this.add
      .rectangle(x, y, w, 36, color, 0.92)
      .setStrokeStyle(1, 0xffffff, 0.12)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(x, y, label, {
        fontFamily: 'Segoe UI, sans-serif',
        fontSize: '15px',
        color: '#eceff1',
      })
      .setOrigin(0.5);
    bg.on('pointerover', () => bg.setFillStyle(color === 0x5e35b1 ? 0x7e57c2 : 0x455a64, 0.92));
    bg.on('pointerout', () => bg.setFillStyle(color, 0.92));
    bg.on('pointerdown', () => openExternal(url));
  }

  private makeFooter(width: number, height: number): void {
    const lineY = height - 58;
    const g = this.add.graphics();
    g.lineStyle(1, 0xffffff, 0.1);
    g.lineBetween(width * 0.12, lineY, width * 0.88, lineY);

    this.add
      .text(width / 2, height - 40, `Tank Trouble Online  ·  v${VERSION}`, {
        fontFamily: 'Segoe UI, sans-serif',
        fontSize: '11px',
        color: '#78909c',
      })
      .setOrigin(0.5);

    const credit = this.add
      .text(width / 2, height - 22, '© 2026  jolaaa999 / jolly', {
        fontFamily: 'Segoe UI, sans-serif',
        fontSize: '12px',
        color: '#b0bec5',
      })
      .setOrigin(0.5);

    credit.setInteractive({ useHandCursor: true });
    credit.on('pointerover', () => credit.setColor('#e1bee7'));
    credit.on('pointerout', () => credit.setColor('#b0bec5'));
    credit.on('pointerdown', () => openExternal(GITHUB_URL));
  }

  private makeButton(
    x: number,
    y: number,
    label: string,
    onClick: () => void,
    color = 0x2f6fed,
  ): void {
    const bg = this.add
      .rectangle(x, y, 240, 44, color, 1)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(x, y, label, {
        fontFamily: 'Segoe UI, sans-serif',
        fontSize: '20px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    const hover = color === 0x00838f ? 0x00acc1 : 0x3d7dff;
    bg.on('pointerover', () => bg.setFillStyle(hover));
    bg.on('pointerout', () => bg.setFillStyle(color));
    bg.on('pointerdown', onClick);
  }
}
