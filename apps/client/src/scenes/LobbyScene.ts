import Phaser from 'phaser';
import {
  createBattleRoom,
  formatNetError,
  getColyseusUrl,
  joinBattleRoom,
  pingServer,
} from '../net/ColyseusClient';
import type { Room } from 'colyseus.js';

type LobbyData = { action: 'create' | 'join'; fillWithBots?: boolean };

export class LobbyScene extends Phaser.Scene {
  private action: 'create' | 'join' = 'create';
  private initialFillWithBots = true;
  private room: Room | null = null;
  private infoText!: Phaser.GameObjects.Text;
  private codeInput = '';
  private started = false;
  private aiBtnBg: Phaser.GameObjects.Rectangle | null = null;
  private aiBtnLabel: Phaser.GameObjects.Text | null = null;

  constructor() {
    super('lobby');
  }

  init(data: LobbyData): void {
    this.action = data.action;
    this.initialFillWithBots = data.fillWithBots ?? true;
    this.room = null;
    this.codeInput = '';
    this.started = false;
    this.aiBtnBg = null;
    this.aiBtnLabel = null;
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
      .text(width / 2, 130, '检测服务器…', {
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
        this.room = await createBattleRoom({ fillWithBots: this.initialFillWithBots });
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

  private ensureAiButton(): void {
    if (this.aiBtnBg) return;
    const { width } = this.scale;
    this.aiBtnBg = this.add
      .rectangle(width / 2, 470, 280, 44, 0x2e7d32, 1)
      .setInteractive({ useHandCursor: true })
      .setDepth(10);
    this.aiBtnLabel = this.add
      .text(width / 2, 470, '', {
        fontFamily: 'Segoe UI, sans-serif',
        fontSize: '18px',
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setDepth(11);
    this.aiBtnBg.on('pointerdown', () => {
      this.room?.send('toggleFillBots');
    });
  }

  private bindRoom(room: Room): void {
    this.ensureAiButton();

    const sync = () => {
      const state = room.state as {
        roomCode: string;
        phase: string;
        fillWithBots: boolean;
        players: Map<string, { ready: boolean; colorIndex: number }>;
      };
      if (state.phase === 'playing') {
        this.goGame(room);
        return;
      }
      const fill = Boolean(state.fillWithBots);
      const humans = state.players.size;
      const bots = fill ? Math.max(0, 4 - humans) : 0;
      const minNeeded = fill ? 1 : 2;

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
      lines.push(
        '',
        fill
          ? bots > 0
            ? `AI 开：将补齐 +${bots} → 共 4 人`
            : 'AI 开：房间已满 4 人'
          : 'AI 关：只用人人对战',
        humans < minNeeded
          ? `还需至少 ${minNeeded - humans} 名真人才能开战`
          : '人数已够，全员准备即可开战',
        '按 R 准备 / 取消准备 · 或点下方按钮切换 AI',
      );
      this.infoText.setText(lines.join('\n'));

      this.aiBtnBg?.setFillStyle(fill ? 0x2e7d32 : 0x455a64);
      this.aiBtnLabel?.setText(fill ? 'AI 凑满 4 人：开（点此切换）' : 'AI 凑满 4 人：关（点此切换）');
    };

    room.onStateChange(sync);
    sync();

    this.input.keyboard!.on('keydown-R', () => {
      room.send('ready');
    });
    this.input.keyboard!.on('keydown-B', () => {
      room.send('toggleFillBots');
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
