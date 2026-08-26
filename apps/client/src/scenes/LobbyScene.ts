import Phaser from 'phaser';
import {
  createBattleRoom,
  formatNetError,
  getColyseusUrl,
  joinBattleRoom,
  pingServer,
  takeLobbyRoom,
} from '../net/ColyseusClient';
import { nextScorePreset, type MatchMode } from '@tanktrouble/shared';
import type { Room } from 'colyseus.js';

type LobbyData = {
  action: 'create' | 'join' | 'joined';
  fillWithBots?: boolean;
  mode?: MatchMode;
  rosterSize?: number;
  scoreToWin?: number;
};

export class LobbyScene extends Phaser.Scene {
  private action: 'create' | 'join' | 'joined' = 'create';
  private initialFillWithBots = false;
  private initialMode: MatchMode = 'classic';
  private initialRoster = 4;
  private initialScoreToWin?: number;
  private room: Room | null = null;
  private infoText!: Phaser.GameObjects.Text;
  private codeInput = '';
  private started = false;
  private aiBtnBg: Phaser.GameObjects.Rectangle | null = null;
  private aiBtnLabel: Phaser.GameObjects.Text | null = null;
  private rosterBtnBg: Phaser.GameObjects.Rectangle | null = null;
  private rosterBtnLabel: Phaser.GameObjects.Text | null = null;
  private scoreBtnBg: Phaser.GameObjects.Rectangle | null = null;
  private scoreBtnLabel: Phaser.GameObjects.Text | null = null;

  constructor() {
    super('lobby');
  }

  init(data: LobbyData): void {
    this.action = data.action;
    this.initialFillWithBots = data.fillWithBots ?? false;
    this.initialMode = data.mode ?? 'classic';
    this.initialRoster = data.rosterSize ?? (this.initialMode === 'mega' ? 8 : 4);
    this.initialScoreToWin = data.scoreToWin;
    this.room = null;
    this.codeInput = '';
    this.started = false;
    this.aiBtnBg = null;
    this.aiBtnLabel = null;
    this.rosterBtnBg = null;
    this.rosterBtnLabel = null;
    this.scoreBtnBg = null;
    this.scoreBtnLabel = null;
  }

  async create(): Promise<void> {
    const { width } = this.scale;
    this.add
      .text(width / 2, 56, this.action === 'create' ? '创建房间' : this.action === 'joined' ? '房间等待' : '加入房间', {
        fontFamily: 'Georgia, serif',
        fontSize: '34px',
        color: '#f5f0e6',
      })
      .setOrigin(0.5);

    this.infoText = this.add
      .text(width / 2, 110, '检测服务器…', {
        fontFamily: 'Segoe UI, sans-serif',
        fontSize: '15px',
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

    if (this.action === 'joined') {
      const room = takeLobbyRoom();
      if (!room) {
        this.infoText.setText('加入会话丢失，请从大厅重试');
        return;
      }
      this.room = room;
      this.bindRoom(room);
      return;
    }

    if (this.action === 'create') {
      this.infoText.setText(`${ping.detail}\n正在创建房间…`);
      try {
        this.room = await createBattleRoom({
          fillWithBots: this.initialFillWithBots,
          mode: this.initialMode,
          rosterSize: this.initialRoster,
          scoreToWin: this.initialScoreToWin,
        });
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

  private ensureButtons(): void {
    if (this.aiBtnBg) return;
    const { width } = this.scale;
    this.aiBtnBg = this.add
      .rectangle(width / 2, 450, 300, 40, 0x2e7d32, 1)
      .setInteractive({ useHandCursor: true })
      .setDepth(10);
    this.aiBtnLabel = this.add
      .text(width / 2, 450, '', {
        fontFamily: 'Segoe UI, sans-serif',
        fontSize: '16px',
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setDepth(11);
    this.aiBtnBg.on('pointerdown', () => {
      this.room?.send('toggleFillBots');
    });

    this.rosterBtnBg = this.add
      .rectangle(width / 2, 496, 300, 40, 0x00838f, 1)
      .setInteractive({ useHandCursor: true })
      .setDepth(10);
    this.rosterBtnLabel = this.add
      .text(width / 2, 496, '', {
        fontFamily: 'Segoe UI, sans-serif',
        fontSize: '16px',
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setDepth(11);
    this.rosterBtnBg.on('pointerdown', () => {
      const state = this.room?.state as { mode?: string; rosterSize?: number } | undefined;
      if (!state || state.mode !== 'mega') return;
      const next = state.rosterSize === 6 ? 8 : 6;
      this.room?.send('setRosterSize', { size: next });
    });

    this.scoreBtnBg = this.add
      .rectangle(width / 2, 542, 300, 40, 0x5e35b1, 1)
      .setInteractive({ useHandCursor: true })
      .setDepth(10);
    this.scoreBtnLabel = this.add
      .text(width / 2, 542, '', {
        fontFamily: 'Segoe UI, sans-serif',
        fontSize: '16px',
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setDepth(11);
    this.scoreBtnBg.on('pointerdown', () => {
      const state = this.room?.state as { scoreToWin?: number } | undefined;
      if (!state?.scoreToWin) return;
      const next = nextScorePreset(state.scoreToWin, 1);
      this.room?.send('setScoreToWin', { score: next });
    });
  }

  private bindRoom(room: Room): void {
    this.ensureButtons();

    const sync = () => {
      const state = room.state as {
        roomCode: string;
        phase: string;
        fillWithBots: boolean;
        mode: string;
        rosterSize: number;
        scoreToWin: number;
        players: Map<string, { ready: boolean; colorIndex: number; team: number }> | undefined;
      };
      if (!state?.roomCode || !state.players) return;
      if (state.phase === 'playing') {
        this.goGame(room);
        return;
      }
      const fill = Boolean(state.fillWithBots);
      const mega = state.mode === 'mega';
      const roster = state.rosterSize || (mega ? 8 : 4);
      const humans = state.players.size;
      const bots = fill ? Math.max(0, roster - humans) : 0;
      const minNeeded = fill ? 1 : 2;

      const lines: string[] = [
        `房间码：${state.roomCode}`,
        mega
          ? `超多人 · ${roster} 席 · 红蓝对阵 · 先到 ${state.scoreToWin}`
          : `经典 · 4 席 · 混战 · 先到 ${state.scoreToWin}`,
        `服：${getColyseusUrl()}`,
        '',
      ];
      state.players.forEach((p, id) => {
        const you = id === room.sessionId ? '（你）' : '';
        const team = mega ? (p.team === 0 ? '红' : '蓝') : `P${p.colorIndex + 1}`;
        lines.push(`${team}${you} ${p.ready ? '已准备' : '未准备'}`);
      });
      lines.push(
        '',
        fill
          ? bots > 0
            ? `AI 开：将补齐 +${bots} → 共 ${roster} 人`
            : `AI 开：席位已满 ${roster}`
          : 'AI 关：只用人人对战',
        humans < minNeeded
          ? `还需至少 ${minNeeded - humans} 名真人才能开战`
          : '人数已够，全员准备即可开战',
        '按 R 准备 · 点按钮切换 AI' + (mega ? ' / 席位' : '') + ' / 胜利分',
      );
      this.infoText.setText(lines.join('\n'));

      this.aiBtnBg?.setFillStyle(fill ? 0x2e7d32 : 0x455a64);
      this.aiBtnLabel?.setText(fill ? 'AI 凑满：开（点此切换）' : 'AI 凑满：关（点此切换）');
      this.rosterBtnBg?.setVisible(mega);
      this.rosterBtnLabel?.setVisible(mega);
      this.rosterBtnLabel?.setText(`席位 ${roster}（点切 6/8）`);
      this.scoreBtnLabel?.setText(`胜利积分 ${state.scoreToWin}（点击切换）`);
    };

    room.onError((code, message) => {
      this.infoText.setText(`房间错误 (${code}): ${message || '连接中断'}\n可返回菜单重开`);
    });
    room.onLeave((code) => {
      if (this.started) return;
      if (code === 1006) {
        this.infoText.setText(
          `连接异常断开 (1006)\n${getColyseusUrl()}\n请返回菜单重新创建/加入`,
        );
      }
    });

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
