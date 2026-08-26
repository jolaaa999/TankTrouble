import Phaser from 'phaser';
import type { CustomMazeLayout, MatchMode } from '@tanktrouble/shared';

export type LocalRestartData = {
  mode: 'local';
  withBots?: boolean;
  fillBots?: boolean;
  matchMode?: MatchMode;
  rosterSize?: number;
  customMaze?: CustomMazeLayout;
};

export type ResultData =
  | { mode: 'local'; message: string; restart?: LocalRestartData }
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

    const canSoloRestart =
      this.result.mode === 'local' && Boolean(this.result.restart?.withBots);

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

    again.on('pointerdown', () => this.playAgain());

    if (canSoloRestart) {
      this.add
        .text(width / 2, height / 2 + 78, '按 R 也可重开', {
          fontFamily: 'Segoe UI, sans-serif',
          fontSize: '13px',
          color: '#90a4ae',
        })
        .setOrigin(0.5);
      this.input.keyboard?.on('keydown-R', () => this.playAgain());
    }

    const menu = this.add
      .rectangle(width / 2, height / 2 + 110, 200, 44, 0x445566)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(width / 2, height / 2 + 110, '主菜单', {
        fontFamily: 'Segoe UI, sans-serif',
        fontSize: '20px',
        color: '#fff',
      })
      .setOrigin(0.5);
    menu.on('pointerdown', () => this.scene.start('menu'));
  }

  private playAgain(): void {
    if (this.result.mode === 'local') {
      this.scene.start('game', this.result.restart ?? { mode: 'local' });
      return;
    }
    this.scene.start('menu');
  }
}
