import Phaser from 'phaser';
import {
  GAME,
  GameSim,
  generateMaze,
  type InputMessage,
  type PickupKind,
  type WeaponKind,
} from '@tanktrouble/shared';
import { MazeView } from '../render/MazeView';
import { TankView } from '../render/TankView';
import { BulletView } from '../render/BulletView';
import { MineView, PickupView } from '../render/PickupView';
import type { Room } from 'colyseus.js';

export type GameSceneData =
  | { mode: 'local'; withBots?: boolean; fillBots?: boolean }
  | { mode: 'online'; room: Room; sessionId: string };

export class GameScene extends Phaser.Scene {
  private mode: 'local' | 'online' = 'local';
  private withBots = false;
  private fillBots = false;
  private sim: GameSim | null = null;
  private mazeView: MazeView | null = null;
  private tankViews = new Map<string, TankView>();
  private bulletViews = new Map<number, BulletView>();
  private pickupViews = new Map<number, PickupView>();
  private mineViews = new Map<number, MineView>();
  private laserSight: Phaser.GameObjects.Graphics | null = null;
  private offsetX = 0;
  private offsetY = 0;
  private seq = 0;
  private matchOver = false;
  private room: Room | null = null;
  private sessionId = '';
  private onlineSeed = -1;
  private statusText: Phaser.GameObjects.Text | null = null;
  private scoreText: Phaser.GameObjects.Text | null = null;
  private keys!: {
    p1: Record<string, Phaser.Input.Keyboard.Key>;
    p2: Record<string, Phaser.Input.Keyboard.Key>;
  };
  private timeSec = 0;

  constructor() {
    super('game');
  }

  init(data: GameSceneData): void {
    this.mode = data.mode;
    this.withBots = data.mode === 'local' && Boolean(data.withBots);
    this.fillBots =
      data.mode === 'local' &&
      (Boolean(data.withBots) || Boolean(data.fillBots));
    this.matchOver = false;
    this.seq = 0;
    this.room = data.mode === 'online' ? data.room : null;
    this.sessionId = data.mode === 'online' ? data.sessionId : '';
    this.onlineSeed = -1;
  }

  create(): void {
    this.cameras.main.setBackgroundColor(0x3e2723);
    this.mazeView = new MazeView(this);
    this.laserSight = this.add.graphics().setDepth(5);
    this.statusText = this.add
      .text(12, 10, '', {
        fontFamily: 'Segoe UI, sans-serif',
        fontSize: '14px',
        color: '#fff8e1',
      })
      .setDepth(20);
    this.scoreText = this.add
      .text(this.scale.width / 2, 10, '', {
        fontFamily: 'Segoe UI, sans-serif',
        fontSize: '18px',
        color: '#ffe082',
      })
      .setOrigin(0.5, 0)
      .setDepth(20);

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
      this.sim = new GameSim(seed, this.withBots ? ['p1'] : ['p1', 'p2'], {
        fillBots: this.fillBots,
      });
      this.layoutFromSim();
      this.statusText.setText(
        this.withBots
          ? `单人+AI · WASD+空格 · AI 补齐至 ${GAME.maxPlayers} 人 · 先到 ${GAME.scoreToWin} 分`
          : this.fillBots
            ? `本地 · P1 WASD+空格 · P2 方向键+Enter · AI 补齐 · 先到 ${GAME.scoreToWin} 分`
            : `本地双人 · P1 WASD+空格 · P2 方向键+Enter · 无人 AI · 先到 ${GAME.scoreToWin} 分`,
      );
    } else {
      this.statusText.setText(`联机对战 · 先到 ${GAME.scoreToWin} 分`);
      this.bindOnline();
    }
  }

  private layoutFromSim(): void {
    if (!this.sim) return;
    const maze = this.sim.maze;
    const w = maze.cols * GAME.cellSize;
    const h = maze.rows * GAME.cellSize;
    this.offsetX = (this.scale.width - w) / 2;
    this.offsetY = (this.scale.height - h) / 2 + 16;
    this.mazeView?.draw(maze, this.offsetX, this.offsetY);
  }

  private bindOnline(): void {
    const room = this.room;
    if (!room) return;

    const syncFromState = () => {
      const state = room.state as {
        seed: number;
        phase: string;
        roundIndex: number;
        intermissionLeft: number;
        matchWinnerId: string;
        scores: Map<string, number> | Record<string, number>;
        tanks: Map<
          string,
          {
            id: string;
            x: number;
            y: number;
            angle: number;
            alive: boolean;
            colorIndex: number;
            shieldTime: number;
            weapon: string;
            showLaserSight: boolean;
            isBot: boolean;
          }
        >;
        bullets: Map<string, { id: number; x: number; y: number; kind: string }>;
        pickups: Map<string, { id: number; kind: PickupKind; x: number; y: number }>;
        mines: Map<
          string,
          { id: number; x: number; y: number; visible: boolean; triggered: boolean }
        >;
      };

      if (this.onlineSeed !== state.seed) {
        this.onlineSeed = state.seed;
        const maze = generateMaze(state.seed);
        const w = maze.cols * GAME.cellSize;
        const h = maze.rows * GAME.cellSize;
        this.offsetX = (this.scale.width - w) / 2;
        this.offsetY = (this.scale.height - h) / 2 + 16;
        this.mazeView?.draw(maze, this.offsetX, this.offsetY);
      }

      this.renderScores(this.scoreMap(state.scores), state.roundIndex);
      if (state.phase === 'intermission') {
        this.statusText?.setText('小局结束 · 下一张地图生成中…');
      }

      this.syncTankViews(state.tanks);
      this.syncBulletViews(state.bullets);
      this.syncPickupViews(state.pickups);
      this.syncMineViews(state.mines);
      this.drawOnlineLaserSights(state.tanks);

      if (state.phase === 'matchEnd' && !this.matchOver) {
        this.matchOver = true;
        const youWin = state.matchWinnerId === this.sessionId;
        this.scene.start('result', {
          mode: 'online',
          message: youWin ? '你赢下本场！' : '本场结束',
          room: this.room,
          sessionId: this.sessionId,
        });
      }
    };

    room.onStateChange(syncFromState);
    syncFromState();
  }

  private scoreMap(
    scores: Map<string, number> | Record<string, number>,
  ): Record<string, number> {
    if (scores instanceof Map) {
      const o: Record<string, number> = {};
      scores.forEach((v, k) => {
        o[k] = v;
      });
      return o;
    }
    return { ...scores };
  }

  update(_t: number, dtMs: number): void {
    this.timeSec += dtMs / 1000;
    if (this.mode === 'local') this.updateLocal(dtMs / 1000);
    else this.updateOnlineInput();
  }

  private readKeys(
    map: Record<string, Phaser.Input.Keyboard.Key>,
  ): Omit<InputMessage, 'seq'> {
    return {
      left: map.left.isDown,
      right: map.right.isDown,
      forward: map.forward.isDown,
      back: map.back.isDown,
      fire: map.fire.isDown,
    };
  }

  private updateLocal(dt: number): void {
    if (!this.sim || this.matchOver) return;
    this.seq += 1;
    this.sim.applyInput('p1', { seq: this.seq, ...this.readKeys(this.keys.p1) });
    this.sim.applyInput('p2', { seq: this.seq, ...this.readKeys(this.keys.p2) });
    const prevSeed = this.sim.maze.seed;
    const events = this.sim.step(dt);
    const snap = this.sim.getSnapshot();

    if (snap.seed !== prevSeed) this.layoutFromSim();

    this.renderScores(snap.scores, snap.roundIndex);
    if (snap.phase === 'intermission') {
      this.statusText?.setText(
        `得分！下一小局 ${snap.intermissionLeft.toFixed(1)}s · 地图 #${snap.roundIndex + 1}`,
      );
    } else if (snap.phase === 'playing') {
      this.statusText?.setText(
        `第 ${snap.roundIndex} 局 · 拾取彩色方块获得原版技能 · 先到 ${GAME.scoreToWin} 分`,
      );
    }

    this.syncTankViewsFromSnap(snap.tanks);
    this.syncBulletsFromSnap(snap.bullets);
    this.syncPickupsFromSnap(snap.pickups);
    this.syncMinesFromSnap(snap.mines);
    this.drawLaserSights(snap.tanks);

    if (events.some((e) => e.type === 'matchEnd') || snap.phase === 'matchEnd') {
      this.matchOver = true;
      const winner =
        snap.matchWinnerId === 'p1' ? 'P1' : snap.matchWinnerId === 'p2' ? 'P2' : '无人';
      this.scene.start('result', {
        mode: 'local',
        message: `${winner} 先到 ${GAME.scoreToWin} 分获胜！`,
      });
    }
  }

  private updateOnlineInput(): void {
    if (!this.room || this.matchOver) return;
    this.seq += 1;
    this.room.send('input', { seq: this.seq, ...this.readKeys(this.keys.p1) });
  }

  private renderScores(scores: Record<string, number>, roundIndex: number): void {
    const parts = Object.entries(scores).map(([id, s], i) => {
      const label = this.mode === 'local' ? id.toUpperCase() : `P${i + 1}`;
      return `${label} ${s}`;
    });
    this.scoreText?.setText(`第${roundIndex}局  ${parts.join('  ·  ')}  /${GAME.scoreToWin}`);
  }

  private syncTankViewsFromSnap(
    tanks: {
      id: string;
      x: number;
      y: number;
      angle: number;
      alive: boolean;
      colorIndex: number;
      shieldTime: number;
      weapon?: string;
      isBot?: boolean;
    }[],
  ): void {
    const ids = new Set(tanks.map((t) => t.id));
    for (const t of tanks) {
      let view = this.tankViews.get(t.id);
      if (!view) {
        view = new TankView(this, t.colorIndex);
        this.tankViews.set(t.id, view);
      }
      view.setPose(
        this.offsetX + t.x,
        this.offsetY + t.y,
        t.angle,
        t.alive,
        t.shieldTime,
        (t.weapon as WeaponKind) ?? 'default',
        Boolean(t.isBot),
      );
    }
    for (const [id, view] of this.tankViews) {
      if (!ids.has(id)) {
        view.destroy();
        this.tankViews.delete(id);
      }
    }
  }

  private syncTankViews(
    tanks: Map<
      string,
      {
        id: string;
        x: number;
        y: number;
        angle: number;
        alive: boolean;
        colorIndex: number;
        shieldTime: number;
        weapon?: string;
        isBot?: boolean;
      }
    >,
  ): void {
    const list: {
      id: string;
      x: number;
      y: number;
      angle: number;
      alive: boolean;
      colorIndex: number;
      shieldTime: number;
      weapon?: string;
      isBot?: boolean;
    }[] = [];
    tanks.forEach((t) => list.push(t));
    this.syncTankViewsFromSnap(list);
  }

  private syncBulletsFromSnap(
    bullets: { id: number; x: number; y: number; kind?: string }[],
  ): void {
    const live = new Set(bullets.map((b) => b.id));
    for (const b of bullets) {
      let view = this.bulletViews.get(b.id);
      if (!view) {
        view = new BulletView(this, b.kind ?? 'normal');
        this.bulletViews.set(b.id, view);
      }
      view.setPose(this.offsetX + b.x, this.offsetY + b.y);
    }
    for (const [id, view] of this.bulletViews) {
      if (!live.has(id)) {
        view.destroy();
        this.bulletViews.delete(id);
      }
    }
  }

  private syncBulletViews(
    bullets: Map<string, { id: number; x: number; y: number; kind: string }>,
  ): void {
    const list: { id: number; x: number; y: number; kind: string }[] = [];
    bullets.forEach((b) => list.push(b));
    this.syncBulletsFromSnap(list);
  }

  private syncPickupsFromSnap(
    pickups: { id: number; kind: PickupKind; x: number; y: number }[],
  ): void {
    const live = new Set(pickups.map((p) => p.id));
    for (const p of pickups) {
      let view = this.pickupViews.get(p.id);
      if (!view) {
        view = new PickupView(this, p.kind);
        this.pickupViews.set(p.id, view);
      }
      view.setPose(this.offsetX + p.x, this.offsetY + p.y, this.timeSec);
    }
    for (const [id, view] of this.pickupViews) {
      if (!live.has(id)) {
        view.destroy();
        this.pickupViews.delete(id);
      }
    }
  }

  private syncPickupViews(
    pickups: Map<string, { id: number; kind: PickupKind; x: number; y: number }>,
  ): void {
    const list: { id: number; kind: PickupKind; x: number; y: number }[] = [];
    pickups.forEach((p) => list.push(p));
    this.syncPickupsFromSnap(list);
  }

  private syncMinesFromSnap(
    mines: { id: number; x: number; y: number; visible: boolean; triggered: boolean }[],
  ): void {
    const live = new Set(mines.map((m) => m.id));
    for (const m of mines) {
      let view = this.mineViews.get(m.id);
      if (!view) {
        view = new MineView(this);
        this.mineViews.set(m.id, view);
      }
      view.setPose(this.offsetX + m.x, this.offsetY + m.y, m.visible, m.triggered);
    }
    for (const [id, view] of this.mineViews) {
      if (!live.has(id)) {
        view.destroy();
        this.mineViews.delete(id);
      }
    }
  }

  private syncMineViews(
    mines: Map<string, { id: number; x: number; y: number; visible: boolean; triggered: boolean }>,
  ): void {
    const list: { id: number; x: number; y: number; visible: boolean; triggered: boolean }[] = [];
    mines.forEach((m) => list.push(m));
    this.syncMinesFromSnap(list);
  }

  private drawLaserSights(
    tanks: { x: number; y: number; angle: number; alive: boolean; showLaserSight: boolean; colorIndex: number }[],
  ): void {
    const g = this.laserSight;
    if (!g || !this.sim) return;
    g.clear();
    for (const t of tanks) {
      if (!t.alive || !t.showLaserSight) continue;
      this.strokeSight(g, t.x, t.y, t.angle, t.colorIndex, this.sim.maze.walls);
    }
  }

  private drawOnlineLaserSights(
    tanks: Map<
      string,
      {
        x: number;
        y: number;
        angle: number;
        alive: boolean;
        showLaserSight: boolean;
        colorIndex: number;
      }
    >,
  ): void {
    const g = this.laserSight;
    if (!g) return;
    g.clear();
    const maze = generateMaze(this.onlineSeed);
    tanks.forEach((t) => {
      if (!t.alive || !t.showLaserSight) return;
      this.strokeSight(g, t.x, t.y, t.angle, t.colorIndex, maze.walls);
    });
  }

  private strokeSight(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    angle: number,
    colorIndex: number,
    walls: { x1: number; y1: number; x2: number; y2: number; kind: 'h' | 'v' }[],
  ): void {
    const hex = GAME.playerColors[colorIndex % GAME.playerColors.length]!;
    const color = Phaser.Display.Color.HexStringToColor(hex).color;
    g.lineStyle(2, color, 0.55);
    let cx = x;
    let cy = y;
    let vx = Math.cos(angle) * 14;
    let vy = Math.sin(angle) * 14;
    g.beginPath();
    g.moveTo(this.offsetX + cx, this.offsetY + cy);
    for (let i = 0; i < 90; i++) {
      cx += vx;
      cy += vy;
      for (const wall of walls) {
        const dx = wall.x2 - wall.x1;
        const dy = wall.y2 - wall.y1;
        const lenSq = dx * dx + dy * dy || 1;
        let tt = ((cx - wall.x1) * dx + (cy - wall.y1) * dy) / lenSq;
        tt = Math.max(0, Math.min(1, tt));
        const px = wall.x1 + tt * dx;
        const py = wall.y1 + tt * dy;
        const ox = cx - px;
        const oy = cy - py;
        if (Math.hypot(ox, oy) < 4) {
          if (wall.kind === 'h') vy *= -1;
          else vx *= -1;
          cx += vx;
          cy += vy;
          break;
        }
      }
      if (i % 2 === 0) g.lineTo(this.offsetX + cx, this.offsetY + cy);
      else g.moveTo(this.offsetX + cx, this.offsetY + cy);
    }
    g.strokePath();
  }

  shutdown(): void {
    this.mazeView?.destroy();
    this.laserSight?.destroy();
    for (const v of this.tankViews.values()) v.destroy();
    for (const v of this.bulletViews.values()) v.destroy();
    for (const v of this.pickupViews.values()) v.destroy();
    for (const v of this.mineViews.values()) v.destroy();
    this.tankViews.clear();
    this.bulletViews.clear();
    this.pickupViews.clear();
    this.mineViews.clear();
  }
}
