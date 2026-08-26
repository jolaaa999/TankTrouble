import Phaser from 'phaser';
import {
  formatNetError,
  getColyseusUrl,
  joinBattleRoom,
  listBattleRooms,
  pingServer,
  stashLobbyRoom,
  type BattleRoomInfo,
} from '../net/ColyseusClient';

const REFRESH_MS = 3000;
const ROW_H = 52;
const ROW_TOP = 148;
const MAX_ROWS = 9;

export class HallScene extends Phaser.Scene {
  private statusText!: Phaser.GameObjects.Text;
  private listContainer!: Phaser.GameObjects.Container;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private joining = false;
  private rooms: BattleRoomInfo[] = [];
  private rowHits: Phaser.GameObjects.Rectangle[] = [];

  constructor() {
    super('hall');
  }

  create(): void {
    const { width } = this.scale;
    this.cameras.main.setBackgroundColor(0x1b2430);

    this.add
      .text(width / 2, 52, '房间大厅', {
        fontFamily: 'Georgia, serif',
        fontSize: '36px',
        color: '#f5f0e6',
      })
      .setOrigin(0.5);

    this.statusText = this.add
      .text(width / 2, 96, '正在加载房间列表…', {
        fontFamily: 'Segoe UI, sans-serif',
        fontSize: '14px',
        color: '#b0bec5',
        align: 'center',
        wordWrap: { width: width - 80 },
      })
      .setOrigin(0.5, 0);

    this.makeToolbarButton(88, 52, 72, '返回', () => this.scene.start('menu'), 0x455a64);
    this.makeToolbarButton(width - 88, 52, 88, '刷新', () => void this.refreshRooms(), 0x37474f);

    this.listContainer = this.add.container(0, 0);

    this.add
      .text(40, 520, `Esc 返回 · 点击房间加入\n${getColyseusUrl()}`, {
        fontFamily: 'Segoe UI, sans-serif',
        fontSize: '13px',
        color: '#78909c',
      });

    this.input.keyboard?.on('keydown-ESC', () => this.goMenu());

    void this.boot();
  }

  private async boot(): Promise<void> {
    const ping = await pingServer();
    if (!ping.ok) {
      this.statusText.setText(`${ping.detail}\n\n无法获取房间列表`);
      return;
    }
    this.statusText.setText(`${ping.detail}\n等待中的房间（每 ${REFRESH_MS / 1000}s 自动刷新）`);
    await this.refreshRooms();
    this.refreshTimer = setInterval(() => void this.refreshRooms(), REFRESH_MS);
  }

  private async refreshRooms(): Promise<void> {
    if (this.joining) return;
    try {
      this.rooms = await listBattleRooms();
      this.renderList();
    } catch (err) {
      this.statusText.setText(`刷新失败：${formatNetError(err)}`);
    }
  }

  private renderList(): void {
    this.listContainer.removeAll(true);
    this.rowHits = [];

    const { width } = this.scale;
    const listW = Math.min(720, width - 80);
    const x = width / 2;

    if (this.rooms.length === 0) {
      const empty = this.add
        .text(x, ROW_TOP + 80, '暂无等待中的房间\n可返回主菜单创建房间', {
          fontFamily: 'Segoe UI, sans-serif',
          fontSize: '18px',
          color: '#90a4ae',
          align: 'center',
        })
        .setOrigin(0.5);
      this.listContainer.add(empty);
      return;
    }

    const visible = this.rooms.slice(0, MAX_ROWS);
    visible.forEach((room, i) => {
      const y = ROW_TOP + i * ROW_H;
      const full = room.playerCount >= room.rosterSize;
      const modeLabel = room.mode === 'mega' ? `超多人 ${room.rosterSize} 席` : '经典 4 人';
      const aiLabel = room.fillWithBots ? ' · AI 凑满' : '';
      const label = `${room.roomCode}   ${modeLabel}   ${room.playerCount}/${room.rosterSize}${aiLabel}${full ? '   已满' : ''}`;

      const bg = this.add
        .rectangle(x, y, listW, ROW_H - 6, full ? 0x37474f : 0x2f6fed, full ? 0.55 : 0.92)
        .setInteractive({ useHandCursor: !full });

      const text = this.add
        .text(x - listW / 2 + 20, y, label, {
          fontFamily: 'JetBrains Mono, Consolas, monospace',
          fontSize: '18px',
          color: full ? '#90a4ae' : '#ffffff',
        })
        .setOrigin(0, 0.5);

      if (!full) {
        bg.on('pointerover', () => bg.setFillStyle(0x3d7dff));
        bg.on('pointerout', () => bg.setFillStyle(0x2f6fed, 0.92));
        bg.on('pointerdown', () => void this.joinRoom(room.roomCode));
      }

      this.listContainer.add([bg, text]);
      this.rowHits.push(bg);
    });

    if (this.rooms.length > MAX_ROWS) {
      const more = this.add
        .text(x, ROW_TOP + MAX_ROWS * ROW_H + 8, `还有 ${this.rooms.length - MAX_ROWS} 个房间未显示`, {
          fontFamily: 'Segoe UI, sans-serif',
          fontSize: '13px',
          color: '#78909c',
        })
        .setOrigin(0.5, 0);
      this.listContainer.add(more);
    }
  }

  private async joinRoom(roomCode: string): Promise<void> {
    if (this.joining) return;
    this.joining = true;
    this.statusText.setText(`正在加入 ${roomCode}…`);
    try {
      const room = await joinBattleRoom(roomCode);
      stashLobbyRoom(room);
      this.scene.start('lobby', { action: 'joined' });
    } catch (err) {
      this.joining = false;
      this.statusText.setText(`加入失败：${formatNetError(err)}\n房间可能已满或已开始`);
      await this.refreshRooms();
    }
  }

  private makeToolbarButton(
    x: number,
    y: number,
    w: number,
    label: string,
    onClick: () => void,
    color: number,
  ): void {
    const bg = this.add
      .rectangle(x, y, w, 34, color, 0.95)
      .setInteractive({ useHandCursor: true })
      .setDepth(20);
    this.add
      .text(x, y, label, {
        fontFamily: 'Segoe UI, sans-serif',
        fontSize: '14px',
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setDepth(21);
    bg.on('pointerdown', onClick);
  }

  private goMenu(): void {
    this.scene.start('menu');
  }

  shutdown(): void {
    if (this.refreshTimer !== null) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.joining = false;
  }
}
