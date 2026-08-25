import Phaser from 'phaser';
import { createBattleRoom, joinBattleRoom } from '../net/ColyseusClient';
import type { Room } from 'colyseus.js';

type LobbyData = { action: 'create' | 'join' };

export class LobbyScene extends Phaser.Scene {
  private action: 'create' | 'join' = 'create';
  private room: Room | null = null;
  private infoText!: Phaser.GameObjects.Text;
  private codeInput = '';

  private started = false;

  constructor() {
    super('lobby');
  }

  init(data: LobbyData): void {
    this.action = data.action;
    this.room = null;
    this.codeInput = '';
    this.started = false;
  }

  async create(): Promise<void> {
    const { width } = this.scale;
    this.add
      .text(width / 2, 80, this.action === 'create' ? '创建房间' : '加入房间', {
        fontFamily: 'Georgia, serif',
        fontSize: '36px',
        color: '#f5f0e6',
      })
      .setOrigin(0.5);

    this.infoText = this.add
      .text(width / 2, 150, '连接中…', {
        fontFamily: 'Segoe UI, sans-serif',
        fontSize: '18px',
        color: '#c5d0dc',
        align: 'center',
      })
      .setOrigin(0.5);

    this.add
      .text(40, 500, 'Esc 返回', {
        fontFamily: 'Segoe UI, sans-serif',
        fontSize: '14px',
        color: '#8899aa',
      });

    this.input.keyboard!.on('keydown-ESC', () => {
      void this.room?.leave();
      this.scene.start('menu');
    });

    if (this.action === 'create') {
      try {
        this.room = await createBattleRoom();
        this.bindRoom(this.room);
      } catch (err) {
        this.infoText.setText(`创建失败：${String(err)}`);
      }
    } else {
      this.infoText.setText('输入 4 位房间码后按 Enter\n(仅字母数字)');
      this.input.keyboard!.on('keydown', (event: KeyboardEvent) => {
        if (this.room) return;
        if (event.key === 'Enter' && this.codeInput.length === 4) {
          void this.tryJoin();
          return;
        }
        if (event.key === 'Backspace') {
          this.codeInput = this.codeInput.slice(0, -1);
        } else if (/^[a-zA-Z0-9]$/.test(event.key) && this.codeInput.length < 4) {
          this.codeInput += event.key.toUpperCase();
        }
        this.infoText.setText(`房间码：${this.codeInput || '____'}\n输入后按 Enter`);
      });
    }
  }

  private async tryJoin(): Promise<void> {
    try {
      this.infoText.setText(`加入 ${this.codeInput}…`);
      this.room = await joinBattleRoom(this.codeInput);
      this.bindRoom(this.room);
    } catch (err) {
      this.infoText.setText(`加入失败：${String(err)}\n检查房间码后重试`);
      this.room = null;
    }
  }

  private bindRoom(room: Room): void {
    const sync = () => {
      const state = room.state as {
        roomCode: string;
        phase: string;
        players: Map<string, { ready: boolean; colorIndex: number }>;
      };
      if (state.phase === 'playing') {
        this.goGame(room);
        return;
      }
      const lines: string[] = [`房间码：${state.roomCode}`, `状态：${state.phase}`, ''];
      state.players.forEach((p, id) => {
        const you = id === room.sessionId ? '（你）' : '';
        lines.push(`P${p.colorIndex + 1}${you} ${p.ready ? '已准备' : '未准备'}`);
      });
      lines.push('', '按 R 准备 / 取消准备', '全员准备且≥2人后自动开战');
      this.infoText.setText(lines.join('\n'));
    };

    room.onStateChange(sync);
    sync();

    this.input.keyboard!.on('keydown-R', () => {
      room.send('ready');
    });

    room.onMessage('start', () => {
      this.goGame(room);
    });
  }

  private goGame(room: Room): void {
    if (this.started) return;
    this.started = true;
    this.scene.start('game', {
      mode: 'online',
      room,
      sessionId: room.sessionId,
    });
  }
}
