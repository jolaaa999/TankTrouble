import Phaser from 'phaser';
import {
  GAME,
  GameSim,
  generateMaze,
  type InputMessage,
} from '@tanktrouble/shared';
import { MazeView } from '../render/MazeView';
import { TankView } from '../render/TankView';
import { BulletView } from '../render/BulletView';
import type { Room } from 'colyseus.js';

export type GameSceneData =
  | { mode: 'local' }
  | { mode: 'online'; room: Room; sessionId: string };

export class GameScene extends Phaser.Scene {
  private mode: 'local' | 'online' = 'local';
  private sim: GameSim | null = null;
  private mazeView: MazeView | null = null;
  private tankViews = new Map<string, TankView>();
  private bulletViews = new Map<number, BulletView>();
  private offsetX = 0;
  private offsetY = 0;
  private seq = 0;
  private ended = false;
  private room: Room | null = null;
  private sessionId = '';
  private onlineSeed = -1;
  private statusText: Phaser.GameObjects.Text | null = null;
  private keys!: {
    p1: Record<string, Phaser.Input.Keyboard.Key>;
    p2: Record<string, Phaser.Input.Keyboard.Key>;
  };

  constructor() {
    super('game');
  }

  init(data: GameSceneData): void {
    this.mode = data.mode;
    this.ended = false;
    this.seq = 0;
    this.room = data.mode === 'online' ? data.room : null;
    this.sessionId = data.mode === 'online' ? data.sessionId : '';
    this.onlineSeed = -1;
  }

  create(): void {
    this.mazeView = new MazeView(this);
    this.statusText = this.add
      .text(12, 12, '', {
        fontFamily: 'Segoe UI, sans-serif',
        fontSize: '14px',
        color: '#dfe7f1',
      })
      .setDepth(10);

    const kb = this.input.keyboard!;
    this.keys = {
      p1: {
        left: kb.addKey('A'),
        right: kb.addKey('D'),
        forward: kb.addKey('W'),
        back: kb.addKey('S'),
        fire: kb.addKey('SPACE'),
      },
      p2: {
        left: kb.addKey('LEFT'),
        right: kb.addKey('RIGHT'),
        forward: kb.addKey('UP'),
        back: kb.addKey('DOWN'),
        fire: kb.addKey('ENTER'),
      },
    };

    if (this.mode === 'local') {
      const seed = (Math.random() * 1e9) | 0;
      this.sim = new GameSim(seed, ['p1', 'p2']);
      this.layoutMaze(this.sim.maze.seed);
      this.statusText.setText('本地双人 · P1 WASD+空格 · P2 方向键+Enter · R 重开');
    } else {
      this.statusText.setText('联机对战中…');
      this.bindOnline();
    }

    this.input.keyboard!.on('keydown-R', () => {
      if (this.mode === 'local' && this.ended) {
        this.scene.restart({ mode: 'local' });
      }
    });
  }

  private layoutMaze(seed: number): void {
    if (!this.sim && this.mode === 'local') return;
    const maze = this.sim?.maze;
    if (!maze) return;
    const w = maze.cols * GAME.cellSize;
    const h = maze.rows * GAME.cellSize;
    this.offsetX = (this.scale.width - w) / 2;
    this.offsetY = (this.scale.height - h) / 2 + 10;
    this.mazeView?.draw(maze, this.offsetX, this.offsetY);
    void seed;
  }

  private bindOnline(): void {
    const room = this.room;
    if (!room) return;

    const syncFromState = () => {
      const state = room.state as {
        seed: number;
        phase: string;
        winnerId: string;
        tanks: Map<string, { id: string; x: number; y: number; angle: number; alive: boolean; colorIndex: number }>;
        bullets: Map<string, { id: number; x: number; y: number }>;
      };
      if (this.onlineSeed !== state.seed) {
        this.onlineSeed = state.seed;
        const maze = generateMaze(state.seed);
        const w = maze.cols * GAME.cellSize;
        const h = maze.rows * GAME.cellSize;
        this.offsetX = (this.scale.width - w) / 2;
        this.offsetY = (this.scale.height - h) / 2 + 10;
        this.mazeView?.draw(maze, this.offsetX, this.offsetY);
      }

      const tankIds = new Set<string>();
      state.tanks.forEach((t) => {
        tankIds.add(t.id);
        let view = this.tankViews.get(t.id);
        if (!view) {
          const color = GAME.playerColors[t.colorIndex % GAME.playerColors.length];
          view = new TankView(this, color);
          this.tankViews.set(t.id, view);
        }
        view.setPose(this.offsetX + t.x, this.offsetY + t.y, t.angle, t.alive);
      });
      for (const [id, view] of this.tankViews) {
        if (!tankIds.has(id)) {
          view.destroy();
          this.tankViews.delete(id);
        }
      }

      const bulletIds = new Set<number>();
      state.bullets.forEach((b) => {
        bulletIds.add(b.id);
        let view = this.bulletViews.get(b.id);
        if (!view) {
          view = new BulletView(this);
          this.bulletViews.set(b.id, view);
        }
        view.setPose(this.offsetX + b.x, this.offsetY + b.y);
      });
      for (const [id, view] of this.bulletViews) {
        if (!bulletIds.has(id)) {
          view.destroy();
          this.bulletViews.delete(id);
        }
      }

      if (state.phase === 'ended' && !this.ended) {
        this.ended = true;
        const youWin = state.winnerId === this.sessionId;
        this.scene.start('result', {
          mode: 'online',
          message: youWin ? '你赢了！' : '你输了',
          room: this.room,
          sessionId: this.sessionId,
        });
      }
    };

    room.onStateChange(syncFromState);
    syncFromState();
  }

  update(): void {
    if (this.mode === 'local') {
      this.updateLocal();
      return;
    }
    this.updateOnlineInput();
  }

  private readKeys(
    map: Record<string, Phaser.Input.Keyboard.Key>,
  ): Omit<InputMessage, 'seq'> {
    return {
      left: map.left.isDown,
      right: map.right.isDown,
      forward: map.forward.isDown,
      back: map.back.isDown,
      fire: Phaser.Input.Keyboard.JustDown(map.fire),
    };
  }

  private updateLocal(): void {
    if (!this.sim || this.ended) return;
    this.seq += 1;
    const i1 = { seq: this.seq, ...this.readKeys(this.keys.p1) };
    const i2 = { seq: this.seq, ...this.readKeys(this.keys.p2) };
    this.sim.applyInput('p1', i1);
    this.sim.applyInput('p2', i2);
    const events = this.sim.step(1 / 60);
    const snap = this.sim.getSnapshot();

    for (const t of snap.tanks) {
      let view = this.tankViews.get(t.id);
      if (!view) {
        view = new TankView(this, GAME.playerColors[t.colorIndex]);
        this.tankViews.set(t.id, view);
      }
      view.setPose(this.offsetX + t.x, this.offsetY + t.y, t.angle, t.alive);
    }

    const liveBullets = new Set(snap.bullets.map((b) => b.id));
    for (const b of snap.bullets) {
      let view = this.bulletViews.get(b.id);
      if (!view) {
        view = new BulletView(this);
        this.bulletViews.set(b.id, view);
      }
      view.setPose(this.offsetX + b.x, this.offsetY + b.y);
    }
    for (const [id, view] of this.bulletViews) {
      if (!liveBullets.has(id)) {
        view.destroy();
        this.bulletViews.delete(id);
      }
    }

    if (events.some((e) => e.type === 'roundEnd')) {
      this.ended = true;
      const winner = snap.winnerId === 'p1' ? 'P1' : snap.winnerId === 'p2' ? 'P2' : '无人';
      this.scene.start('result', {
        mode: 'local',
        message: `${winner} 获胜！按 R 或点击再来`,
      });
    }
  }

  private updateOnlineInput(): void {
    if (!this.room || this.ended) return;
    this.seq += 1;
    const input = { seq: this.seq, ...this.readKeys(this.keys.p1) };
    this.room.send('input', input);
  }

  shutdown(): void {
    this.mazeView?.destroy();
    for (const v of this.tankViews.values()) v.destroy();
    for (const v of this.bulletViews.values()) v.destroy();
    this.tankViews.clear();
    this.bulletViews.clear();
  }
}
