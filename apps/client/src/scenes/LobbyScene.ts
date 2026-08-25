import Phaser from 'phaser';
import {
  createBattleRoom,
  formatNetError,
  getColyseusUrl,
  joinBattleRoom,
  pingServer,
} from '../net/ColyseusClient';
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
      .text(width / 2, 70, this.action === 'create' ? '创建房间' : '加入房间', {
        fontFamily: 'Georgia, serif',
        fontSize: '36px',
        color: '#f5f0e6',
      })
      .setOrigin(0.5);

    this.infoText = this.add
      .text(width / 2, 140, '检测服务器…', {
        fontFamily: 'Segoe UI, sans-serif',
        fontSize: '16px',
        color: '#c5d0dc',
        align: 'center',
        wordWrap: { width: width - 80 },
      })
      .setOrigin(0.5, 0);

    this.add
      .text(40, 520, `Esc 返回\n服务器：${getColyseusUrl()}`, {
        fontFamily: 'Segoe UI, sans-serif',
        fontSize: '13px',
        color: '#8899aa',
      });

    this.input.keyboard!.on('keydown-ESC', () => {
      void this.room?.leave();
      this.scene.start('menu');
    });

    const ping = await pingServer();
    if (!ping.ok) {
      this.infoText.setText(
        `${ping.detail}\n\n好友联机不能用 localhost。\n1) 本机跑游戏服\n2) 用 cloudflared/Fly 得到公网 wss\n3) 打开：你的vercel地址/?ws=wss://公网地址`,
      );
      return;
    }

    if (this.action === 'create') {
      this.infoText.setText(`${ping.detail}\n正在创建房间…`);
      try {
        this.room = await createBattleRoom();
        this.bindRoom(this.room);
      } catch (err) {
        this.infoText.setText(`创建失败：${formatNetError(err)}`);
      }
    } else {
      this.infoText.setText(`${ping.detail}\n输入 4 位房间码后按 Enter`);
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
        this.infoText.setText(
          `${ping.detail}\n房间码：${this.codeInput || '____'}\n输入后按 Enter`,
        );
      });
    }
  }

  private async tryJoin(): Promise<void> {
    try {
      this.infoText.setText(`加入 ${this.codeInput}…\n${getColyseusUrl()}`);
      this.room = await joinBattleRoom(this.codeInput);
      this.bindRoom(this.room);
    } catch (err) {
      this.infoText.setText(`加入失败：${formatNetError(err)}\n检查房间码与服务器地址后重试`);
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
      const lines: string[] = [
        `房间码：${state.roomCode}`,
        `状态：${state.phase}`,
        `服：${getColyseusUrl()}`,
        '',
      ];
      state.players.forEach((p, id) => {
        const you = id === room.sessionId ? '（你）' : '';
        lines.push(`P${p.colorIndex + 1}${you} ${p.ready ? '已准备' : '未准备'}`);
      });
      lines.push('', '把房间码发给好友（需同一服务器地址）', '按 R 准备');
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
