import Phaser from 'phaser';
import {
  CLASSIC_MATCH,
  GAME,
  GameSim,
  MEGA_MATCH,
  clampScoreToWin,
  generateMaze,
  type InputMessage,
  type MatchMode,
  type PickupKind,
  type CustomMazeLayout,
  type WeaponKind,
  type SimEvent,
  formatChatSenderLabel,
  type ChatChannel,
  type ChatMessagePayload,
  traceBouncingBeam,
  stepTankMotion,
  type TankMotionState,
} from '@tanktrouble/shared';
import { MazeView } from '../render/MazeView';
import { TankView } from '../render/TankView';
import { BulletView } from '../render/BulletView';
import { MineView, PickupView } from '../render/PickupView';
import { getGameAudio } from '../audio/GameAudio';
import { GameChat } from '../ui/GameChat';
import { ChatBubbles } from '../ui/ChatBubbles';
import type { Room } from 'colyseus.js';

export type GameSceneData =
  | {
      mode: 'local';
      withBots?: boolean;
      fillBots?: boolean;
      matchMode?: MatchMode;
      rosterSize?: number;
      scoreToWin?: number;
      customMaze?: CustomMazeLayout;
    }
  | { mode: 'online'; room: Room; sessionId: string };

type OnlineTankSnap = {
  id: string;
  x: number;
  y: number;
  angle: number;
  alive: boolean;
  colorIndex: number;
  shieldTime: number;
  turboTime: number;
  turboPlus: boolean;
  freezeTime: number;
  weapon: string;
  weaponPlus: boolean;
  showLaserSight: boolean;
  isBot: boolean;
  invisTime: number;
  umbrellaTime: number;
};

type OnlineStateCache = {
  receivedAt: number;
  phase: string;
  tanks: OnlineTankSnap[];
  prevTanks: Map<string, { x: number; y: number; angle: number }>;
  bullets: { id: number; x: number; y: number; vx: number; vy: number; kind: string; ownerId: string }[];
  beams: { id: number; x1: number; y1: number; x2: number; y2: number; life: number; kind: string }[];
  pickups: { id: number; kind: PickupKind; x: number; y: number }[];
  mines: { id: number; x: number; y: number; visible: boolean; triggered: boolean }[];
  hazards: { id: number; x: number; y: number; radius: number; timer: number }[];
  fx: {
    id: number;
    kind: string;
    x: number;
    y: number;
    life: number;
    maxLife: number;
    radius: number;
    colorIndex: number;
    label: string;
  }[];
};

export class GameScene extends Phaser.Scene {
  private mode: 'local' | 'online' = 'local';
  private withBots = false;
  private fillBots = false;
  private matchMode: MatchMode = 'classic';
  private rosterSize = 4;
  private customMaze: CustomMazeLayout | undefined;
  private scoreToWin: number = GAME.scoreToWin;
  private sim: GameSim | null = null;
  private mazeView: MazeView | null = null;
  private tankViews = new Map<string, TankView>();
  private bulletViews = new Map<number, BulletView>();
  private pickupViews = new Map<number, PickupView>();
  private mineViews = new Map<number, MineView>();
  private laserSight: Phaser.GameObjects.Graphics | null = null;
  private beamGfx: Phaser.GameObjects.Graphics | null = null;
  private hazardGfx: Phaser.GameObjects.Graphics | null = null;
  private fxGfx: Phaser.GameObjects.Graphics | null = null;
  private announceTexts = new Map<number, Phaser.GameObjects.Text>();
  private offsetX = 0;
  private offsetY = 0;
  private seq = 0;
  private matchOver = false;
  private room: Room | null = null;
  private sessionId = '';
  private onlineSeed = -1;
  private onlineCols = -1;
  private onlineRows = -1;
  private onlineWalls: { x1: number; y1: number; x2: number; y2: number; kind: 'h' | 'v' }[] = [];
  private onlineCache: OnlineStateCache | null = null;
  /** Continuous local prediction for own tank (advances each frame). */
  private predictedSelf: TankMotionState | null = null;
  /** Visual pose — follows prediction instantly, gently drifts toward server (no hard snap). */
  private displaySelf: { x: number; y: number; angle: number } | null = null;
  private serverSelfPose: { x: number; y: number; angle: number } | null = null;
  private predictAcc = 0;
  private statusText: Phaser.GameObjects.Text | null = null;
  private scoreText: Phaser.GameObjects.Text | null = null;
  private keys!: {
    p1: Record<string, Phaser.Input.Keyboard.Key>;
    p2: Record<string, Phaser.Input.Keyboard.Key>;
  };
  private timeSec = 0;
  private simAcc = 0;
  private lastInputSentAt = 0;
  private lastInputKey = '';
  private lastScoreKey = '';
  private lastSnapSeed = -1;
  private readonly audio = getGameAudio();
  private gameChat: GameChat | null = null;
  private chatBubbles: ChatBubbles | null = null;
  /** Local / online prediction both use 60Hz fixed steps. */
  private readonly fixedDt = 1 / 60;

  constructor() {
    super('game');
  }

  init(data: GameSceneData): void {
    this.mode = data.mode;
    this.withBots = data.mode === 'local' && Boolean(data.withBots);
    this.fillBots =
      data.mode === 'local' &&
      (Boolean(data.withBots) || Boolean(data.fillBots));
    this.matchMode = data.mode === 'local' ? (data.matchMode ?? 'classic') : 'classic';
    this.rosterSize =
      data.mode === 'local'
        ? data.rosterSize ?? (this.matchMode === 'mega' ? 8 : 4)
        : 4;
    this.customMaze = data.mode === 'local' ? data.customMaze : undefined;
    this.scoreToWin =
      data.mode === 'local'
        ? clampScoreToWin(data.scoreToWin, this.matchMode)
        : this.matchMode === 'mega'
          ? MEGA_MATCH.scoreToWin
          : CLASSIC_MATCH.scoreToWin;
    this.matchOver = false;
    this.seq = 0;
    this.room = data.mode === 'online' ? data.room : null;
    this.sessionId = data.mode === 'online' ? data.sessionId : '';
    this.onlineSeed = -1;
    this.onlineCols = -1;
    this.onlineRows = -1;
    this.onlineWalls = [];
    this.onlineCache = null;
    this.predictedSelf = null;
    this.displaySelf = null;
    this.serverSelfPose = null;
    this.predictAcc = 0;
    this.simAcc = 0;
    this.lastInputSentAt = 0;
    this.lastInputKey = '';
    this.lastScoreKey = '';
    this.lastSnapSeed = -1;
    this.audio.resetBattleState();
    this.clearAnnounceTexts();
  }

  create(): void {
    this.cameras.main.setBackgroundColor(0x3e2723);
    this.mazeView = new MazeView(this);
    this.laserSight = this.add.graphics().setDepth(5);
    this.beamGfx = this.add.graphics().setDepth(6);
    this.hazardGfx = this.add.graphics().setDepth(4);
    this.fxGfx = this.add.graphics().setDepth(7);
    this.statusText = this.add
      .text(16, 12, '', {
        fontFamily: 'Segoe UI, sans-serif',
        fontSize: '18px',
        color: '#fff8e1',
        stroke: '#1a1208',
        strokeThickness: 3,
      })
      .setDepth(20)
      .setScrollFactor(0);
    this.scoreText = this.add
      .text(this.scale.width / 2, 12, '', {
        fontFamily: 'Segoe UI, sans-serif',
        fontSize: '22px',
        color: '#ffe082',
        stroke: '#1a1208',
        strokeThickness: 4,
      })
      .setOrigin(0.5, 0)
      .setDepth(20)
      .setScrollFactor(0);

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
      const preset = this.matchMode === 'mega' ? MEGA_MATCH : CLASSIC_MATCH;
      this.sim = new GameSim(seed, this.withBots ? ['p1'] : ['p1', 'p2'], {
        fillBots: this.fillBots,
        match: {
          ...preset,
          scoreToWin: this.scoreToWin,
          maxPlayers: this.rosterSize,
          fillWithBots: this.fillBots,
          scalingMaps: this.customMaze ? false : preset.scalingMaps,
        },
        customMaze: this.customMaze,
      });
      this.layoutFromSim();
      const teamHint = this.matchMode === 'mega' ? ' · 红蓝对阵 · 地图逐局变大' : '';
      const customHint = this.customMaze ? ` · 自定义地图「${this.customMaze.name}」` : '';
      this.statusText.setText(
        this.withBots
          ? `单人+AI · WASD · R 重开 · ${this.rosterSize} 人席 · 先到 ${this.scoreToWin}${teamHint}${customHint}`
          : this.fillBots
            ? `本地 · AI 补齐至 ${this.rosterSize} · 先到 ${this.scoreToWin}${teamHint}${customHint}`
            : `本地双人 · 先到 ${this.scoreToWin}${customHint}`,
      );

      if (this.withBots) {
        this.input.keyboard?.on('keydown-R', () => this.restartLocalSolo());
      }
    } else {
      this.statusText.setText('联机对战');
      this.bindOnline();
    }

    void this.audio.unlock().then(() => this.audio.startBattleBgm());

    this.gameChat = new GameChat(this, {
      teamMode: this.matchMode === 'mega',
      onSend: (text, channel) => this.sendChat(text, channel),
    });
    this.chatBubbles = new ChatBubbles(this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.teardownChat());
    this.events.once(Phaser.Scenes.Events.DESTROY, () => this.teardownChat());
  }

  private getMyTeam(): number {
    if (this.mode === 'local') {
      return this.sim?.getSnapshot().tanks.find((t) => t.id === 'p1')?.team ?? 0;
    }
    const state = this.room?.state as { players?: Map<string, { team: number }> } | undefined;
    return state?.players?.get(this.sessionId)?.team ?? 0;
  }

  private shouldShowChat(payload: ChatMessagePayload): boolean {
    if (payload.channel !== 'team' || this.matchMode !== 'mega') return true;
    return payload.team === this.getMyTeam();
  }

  private handleChatPayload(payload: ChatMessagePayload): void {
    if (!this.shouldShowChat(payload)) return;
    this.chatBubbles?.show(payload.fromId, payload.text);
    this.gameChat?.appendMessage(payload);
  }

  private updateChatBubblePositions(): void {
    const positions = new Map<string, { x: number; y: number }>();
    if (this.mode === 'local' && this.sim) {
      for (const t of this.sim.getSnapshot().tanks) {
        if (t.alive) positions.set(t.id, { x: this.offsetX + t.x, y: this.offsetY + t.y });
      }
    } else if (this.onlineCache) {
      for (const t of this.getInterpolatedOnlineTanks()) {
        if (t.alive) positions.set(t.id, { x: this.offsetX + t.x, y: this.offsetY + t.y });
      }
    }
    this.chatBubbles?.update(positions, this.time.now);
  }

  private sendChat(text: string, channel: ChatChannel): void {
    if (this.mode === 'online' && this.room) {
      this.room.send('chat', { text, channel });
      return;
    }
    const snap = this.sim?.getSnapshot();
    const me = snap?.tanks.find((t) => t.id === 'p1');
    const team = me?.team ?? 0;
    const payload: ChatMessagePayload = {
      fromId: 'p1',
      fromLabel: formatChatSenderLabel({
        colorIndex: me?.colorIndex ?? 0,
        team,
        teamMode: this.matchMode === 'mega',
        self: true,
        playerId: 'p1',
      }),
      team,
      channel: this.matchMode === 'mega' ? channel : 'all',
      text,
      at: Date.now(),
    };
    this.handleChatPayload(payload);
  }

  private onChatMessage(payload: ChatMessagePayload): void {
    const self = this.mode === 'online' && payload.fromId === this.sessionId;
    this.handleChatPayload({
      ...payload,
      fromLabel: self
        ? '你'
        : payload.fromLabel ||
          formatChatSenderLabel({
            colorIndex: 0,
            team: payload.team,
            teamMode: this.matchMode === 'mega',
          }),
    });
  }
  /** Solo+AI only: press R to restart the whole match. */
  private restartLocalSolo(): void {
    if (this.gameChat?.isInputActive() || this.gameChat?.isPanelOpen()) return;
    if (this.mode !== 'local' || !this.withBots || this.matchOver) return;
    this.scene.start('game', this.localRestartData());
  }

  private localRestartData(): Extract<GameSceneData, { mode: 'local' }> {
    return {
      mode: 'local',
      withBots: this.withBots,
      fillBots: this.fillBots,
      matchMode: this.matchMode,
      rosterSize: this.rosterSize,
      scoreToWin: this.scoreToWin,
      customMaze: this.customMaze,
    };
  }

  private layoutFromSim(): void {
    if (!this.sim) return;
    this.applyMazeLayout(this.sim.maze.cols, this.sim.maze.rows);
    this.mazeView?.draw(this.sim.maze, this.offsetX, this.offsetY);
  }

  /** Fit maze in view: zoom out if needed and center camera (fixes edge clipping). */
  private applyMazeLayout(cols: number, rows: number): void {
    const w = cols * GAME.cellSize;
    const h = rows * GAME.cellSize;
    const viewW = this.scale.width;
    const viewH = this.scale.height;
    const zoom = Math.min(1, (viewW - 40) / w, (viewH - 64) / h);
    this.offsetX = 0;
    this.offsetY = 0;
    this.cameras.main.setZoom(zoom);
    this.cameras.main.setRoundPixels(true);
    this.cameras.main.centerOn(w / 2, h / 2);
  }

  private bindOnline(): void {
    const room = this.room;
    if (!room) return;

    room.onMessage('chat', (payload: ChatMessagePayload) => {
      this.onChatMessage(payload);
    });

    const ingestOnlineState = () => {
      const state = room.state as {
        seed: number;
        mazeCols: number;
        mazeRows: number;
        phase: string;
        roundIndex: number;
        intermissionLeft: number;
        matchWinnerId: string;
        matchWinnerTeam: number;
        mode: string;
        scoreToWin: number;
        teamScore0: number;
        teamScore1: number;
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
            turboTime: number;
            freezeTime: number;
            weapon: string;
            weaponPlus: boolean;
            showLaserSight: boolean;
            isBot: boolean;
            invisTime: number;
            umbrellaTime: number;
          }
        >;
        bullets: Map<
          string,
          { id: number; x: number; y: number; vx?: number; vy?: number; kind: string }
        >;
        beams: Map<
          string,
          { id: number; x1: number; y1: number; x2: number; y2: number; life: number; kind: string }
        >;
        pickups: Map<string, { id: number; kind: PickupKind; x: number; y: number }>;
        mines: Map<
          string,
          { id: number; x: number; y: number; visible: boolean; triggered: boolean }
        >;
        hazards: Map<string, { id: number; x: number; y: number; radius: number; timer: number }>;
        fx: Map<
          string,
          {
            id: number;
            kind: string;
            x: number;
            y: number;
            life: number;
            maxLife: number;
            radius: number;
            colorIndex: number;
            label: string;
          }
        >;
      };

      this.scoreToWin = state.scoreToWin || this.scoreToWin;
      this.matchMode = state.mode === 'mega' ? 'mega' : 'classic';
      this.gameChat?.setTeamMode(this.matchMode === 'mega');

      if (
        this.onlineSeed !== state.seed ||
        this.onlineCols !== state.mazeCols ||
        this.onlineRows !== state.mazeRows
      ) {
        this.onlineSeed = state.seed;
        this.onlineCols = state.mazeCols || GAME.mazeCols;
        this.onlineRows = state.mazeRows || GAME.mazeRows;
        const maze = generateMaze(state.seed, this.onlineCols, this.onlineRows);
        this.onlineWalls = maze.walls;
        this.applyMazeLayout(maze.cols, maze.rows);
        this.mazeView?.draw(maze, this.offsetX, this.offsetY);
        this.predictedSelf = null;
        this.displaySelf = null;
        this.serverSelfPose = null;
        this.predictAcc = 0;
      }

      if (this.matchMode === 'mega') {
        this.scoreText?.setText(
          `第${state.roundIndex}局  红队 ${state.teamScore0}  ·  蓝队 ${state.teamScore1}  /${this.scoreToWin}`,
        );
      } else {
        this.renderScores(this.scoreMap(state.scores), state.roundIndex);
      }

      if (state.phase === 'intermission') {
        this.statusText?.setText('小局结束 · 下一张地图生成中…');
      } else if (state.phase === 'playing') {
        const status = `第 ${state.roundIndex} 局 · L激光/Z冰冻/W闪现/E电磁/A空袭 · 先到 ${this.scoreToWin}`;
        if (this.statusText?.text !== status) this.statusText?.setText(status);
      }

      const prevTanks = new Map<string, { x: number; y: number; angle: number }>();
      if (this.onlineCache) {
        for (const t of this.onlineCache.tanks) {
          prevTanks.set(t.id, { x: t.x, y: t.y, angle: t.angle });
        }
      }

      const tanks: OnlineTankSnap[] = [];
      state.tanks.forEach((t) =>
        tanks.push({
          id: t.id,
          x: t.x,
          y: t.y,
          angle: t.angle,
          alive: t.alive,
          colorIndex: t.colorIndex,
          shieldTime: t.shieldTime,
          turboTime: t.turboTime,
          turboPlus: Boolean((t as { turboPlus?: boolean }).turboPlus),
          freezeTime: t.freezeTime,
          weapon: t.weapon,
          weaponPlus: t.weaponPlus,
          showLaserSight: t.showLaserSight,
          isBot: t.isBot,
          invisTime: t.invisTime,
          umbrellaTime: t.umbrellaTime,
        }),
      );
      const bullets: OnlineStateCache['bullets'] = [];
      state.bullets.forEach((b) => {
        const bullet = b as typeof b & { ownerId?: string };
        bullets.push({
          id: bullet.id,
          x: bullet.x,
          y: bullet.y,
          vx: bullet.vx ?? 0,
          vy: bullet.vy ?? 0,
          kind: bullet.kind,
          ownerId: bullet.ownerId ?? '',
        });
      });
      const beams: OnlineStateCache['beams'] = [];
      state.beams.forEach((b) => beams.push({ ...b }));
      const pickups: OnlineStateCache['pickups'] = [];
      state.pickups.forEach((p) => pickups.push({ ...p }));
      const mines: OnlineStateCache['mines'] = [];
      state.mines.forEach((m) => mines.push({ ...m }));
      const hazards: OnlineStateCache['hazards'] = [];
      state.hazards.forEach((h) => hazards.push({ ...h }));
      const fx: OnlineStateCache['fx'] = [];
      (state.fx ?? new Map()).forEach((f) => fx.push({ ...f }));

      this.onlineCache = {
        receivedAt: performance.now(),
        phase: state.phase,
        tanks,
        prevTanks,
        bullets,
        beams,
        pickups,
        mines,
        hazards,
        fx,
      };

      const me = tanks.find((t) => t.id === this.sessionId);
      if (me) this.syncOnlineSelfFromServer(me);
      else {
        this.predictedSelf = null;
        this.displaySelf = null;
        this.serverSelfPose = null;
      }

      const tankList: { id: string; x: number; y: number; alive: boolean }[] = tanks.map((t) => ({
        id: t.id,
        x: t.x,
        y: t.y,
        alive: t.alive,
      }));
      const pickupList = pickups.map((p) => ({ id: p.id }));
      const fxList = fx.map((f) => ({
        id: f.id,
        kind: f.kind,
        radius: f.radius,
        label: f.label,
      }));

      if (this.onlineSeed !== this.lastSnapSeed) {
        this.audio.resetPickups();
        this.lastSnapSeed = this.onlineSeed;
      }
      this.audio.processTanks(tankList, 1 / GAME.tickHz);
      this.audio.processPickups(pickupList);
      this.audio.processFx(fxList);

      if (state.phase === 'matchEnd' && !this.matchOver) {
        this.matchOver = true;
        const msg =
          this.matchMode === 'mega'
            ? state.matchWinnerTeam === 0
              ? '红队获胜！'
              : state.matchWinnerTeam === 1
                ? '蓝队获胜！'
                : '本场结束'
            : state.matchWinnerId === this.sessionId
              ? '你赢下本场！'
              : '本场结束';
        this.scene.start('result', {
          mode: 'online',
          message: msg,
          room: this.room,
          sessionId: this.sessionId,
        });
      }
    };

    room.onStateChange(ingestOnlineState);
    ingestOnlineState();
  }

  private onlineInterpAlpha(): number {
    if (!this.onlineCache) return 1;
    const tickMs = 1000 / GAME.tickHz;
    // Stay in [0,1] — do not extrapolate remotes past the latest snap (causes hitching)
    return Math.min(1, (performance.now() - this.onlineCache.receivedAt) / tickMs);
  }

  /** Sync buffs + server pose; only snap on spawn/death — never hard-correct prediction while alive. */
  private syncOnlineSelfFromServer(serverMe: OnlineTankSnap): void {
    this.serverSelfPose = { x: serverMe.x, y: serverMe.y, angle: serverMe.angle };

    if (!serverMe.alive) {
      this.predictedSelf = {
        x: serverMe.x,
        y: serverMe.y,
        angle: serverMe.angle,
        freezeTime: serverMe.freezeTime,
        turboTime: serverMe.turboTime,
        turboPlus: serverMe.turboPlus,
      };
      this.displaySelf = { x: serverMe.x, y: serverMe.y, angle: serverMe.angle };
      return;
    }

    if (!this.predictedSelf) {
      this.predictedSelf = {
        x: serverMe.x,
        y: serverMe.y,
        angle: serverMe.angle,
        freezeTime: serverMe.freezeTime,
        turboTime: serverMe.turboTime,
        turboPlus: serverMe.turboPlus,
      };
      this.displaySelf = { x: serverMe.x, y: serverMe.y, angle: serverMe.angle };
      return;
    }

    this.predictedSelf.freezeTime = serverMe.freezeTime;
    this.predictedSelf.turboTime = serverMe.turboTime;
    this.predictedSelf.turboPlus = serverMe.turboPlus;
  }

  /** Render pose = prediction (instant input) + optional gentle visual drift toward server. */
  private stepDisplaySelf(frameDt: number): void {
    if (!this.predictedSelf) {
      this.displaySelf = null;
      return;
    }

    if (!this.displaySelf) {
      this.displaySelf = {
        x: this.predictedSelf.x,
        y: this.predictedSelf.y,
        angle: this.predictedSelf.angle,
      };
    }

    // Always mirror prediction first — keeps movement real-time on screen
    this.displaySelf.x = this.predictedSelf.x;
    this.displaySelf.y = this.predictedSelf.y;
    this.displaySelf.angle = this.predictedSelf.angle;

    const server = this.serverSelfPose;
    if (!server) return;

    const dx = server.x - this.displaySelf.x;
    const dy = server.y - this.displaySelf.y;
    const err = Math.hypot(dx, dy);
    if (err < 0.5) return;

    const keys = this.readKeys(this.keys.p1);
    const moving = keys.forward || keys.back;
    const blend = 1 - Math.exp(-5 * frameDt);

    if (moving) {
      // Lateral-only visual nudge while driving — never pull backward along facing
      const f = { x: Math.cos(this.displaySelf.angle), y: Math.sin(this.displaySelf.angle) };
      const along = dx * f.x + dy * f.y;
      const latX = dx - along * f.x;
      const latY = dy - along * f.y;
      this.displaySelf.x += latX * blend * 0.35;
      this.displaySelf.y += latY * blend * 0.35;
      if (along > 0) {
        this.displaySelf.x += along * f.x * blend * 0.15;
        this.displaySelf.y += along * f.y * blend * 0.15;
      }
    } else if (err > 1) {
      this.displaySelf.x += dx * blend * 0.2;
      this.displaySelf.y += dy * blend * 0.2;
    }

    if (!keys.left && !keys.right) {
      this.displaySelf.angle = this.lerpAngle(this.displaySelf.angle, server.angle, blend * 0.25);
    }
  }

  private stepPredictedSelf(frameDt: number): void {
    if (!this.predictedSelf || !this.onlineCache || this.matchOver) return;
    const me = this.onlineCache.tanks.find((t) => t.id === this.sessionId);
    if (!me?.alive || this.onlineWalls.length === 0) return;

    this.predictedSelf.freezeTime = me.freezeTime;
    this.predictedSelf.turboTime = me.turboTime;
    this.predictedSelf.turboPlus = me.turboPlus;
    if (me.freezeTime > 0) return;

    this.predictAcc += Math.min(0.05, frameDt);
    if (this.predictAcc > 0.1) this.predictAcc = 0.1;
    const input = this.readKeys(this.keys.p1);
    const steeringMissile = this.onlineCache.bullets.some(
      (b) => b.ownerId === this.sessionId && b.kind === 'homing',
    );
    const steeringLocked = Boolean(steeringMissile && me.weapon === 'homing');
    while (this.predictAcc >= this.fixedDt) {
      stepTankMotion(this.predictedSelf, input, this.onlineWalls, this.fixedDt, steeringLocked);
      this.predictAcc -= this.fixedDt;
    }
  }

  private lerpAngle(from: number, to: number, t: number): number {
    let d = to - from;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return from + d * t;
  }

  private getInterpolatedOnlineTanks(): OnlineTankSnap[] {
    const snap = this.onlineCache;
    if (!snap) return [];
    const alpha = this.onlineInterpAlpha();
    return snap.tanks.map((t) => {
      if (t.id === this.sessionId && this.displaySelf) {
        return {
          ...t,
          x: this.displaySelf.x,
          y: this.displaySelf.y,
          angle: this.displaySelf.angle,
        };
      }
      const prev = snap.prevTanks.get(t.id);
      if (!prev) return t;
      // Smooth blend between previous and current server poses (no overshoot)
      return {
        ...t,
        x: prev.x + (t.x - prev.x) * alpha,
        y: prev.y + (t.y - prev.y) * alpha,
        angle: this.lerpAngle(prev.angle, t.angle, alpha),
      };
    });
  }

  private renderOnlineFrame(): void {
    const snap = this.onlineCache;
    if (!snap || this.matchOver) return;

    const tanks = this.getInterpolatedOnlineTanks();
    const bulletDt = Math.min(0.04, (performance.now() - snap.receivedAt) / 1000);
    const bullets = snap.bullets.map((b) => ({
      ...b,
      x: b.x + b.vx * bulletDt,
      y: b.y + b.vy * bulletDt,
    }));

    this.syncTankViewsFromSnap(tanks);
    this.syncBulletsFromSnap(bullets);
    this.drawBeamsFromSnap(snap.beams);
    this.syncPickupsFromSnap(snap.pickups);
    this.syncMinesFromSnap(snap.mines);
    this.drawHazardsFromSnap(snap.hazards);
    this.drawFxFromSnap(snap.fx);
    this.drawOnlineLaserSightsFromList(tanks);
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
    if (this.mode === 'local') {
      this.updateLocal(Math.min(0.05, dtMs / 1000));
    } else {
      const frameDt = Math.min(0.05, dtMs / 1000);
      this.updateOnlineInput();
      this.stepPredictedSelf(frameDt);
      this.stepDisplaySelf(frameDt);
      this.renderOnlineFrame();
    }
    this.updateChatBubblePositions();
  }

  private readKeys(
    map: Record<string, Phaser.Input.Keyboard.Key>,
  ): Omit<InputMessage, 'seq'> {
    if (this.gameChat?.isInputActive() || this.gameChat?.isPanelOpen()) {
      return {
        left: false,
        right: false,
        forward: false,
        back: false,
        fire: false,
      };
    }
    return {
      left: map.left.isDown,
      right: map.right.isDown,
      forward: map.forward.isDown,
      back: map.back.isDown,
      fire: map.fire.isDown,
    };
  }

  private updateLocal(frameDt: number): void {
    if (!this.sim || this.matchOver) return;
    this.simAcc += frameDt;
    // Cap catch-up so a hitch doesn't spiral
    if (this.simAcc > 0.1) this.simAcc = 0.1;

    let prevSeed = this.sim.maze.seed;
    const stepEvents: SimEvent[] = [];
    while (this.simAcc >= this.fixedDt) {
      this.seq += 1;
      this.sim.applyInput('p1', { seq: this.seq, ...this.readKeys(this.keys.p1) });
      this.sim.applyInput('p2', { seq: this.seq, ...this.readKeys(this.keys.p2) });
      prevSeed = this.sim.maze.seed;
      stepEvents.push(...this.sim.step(this.fixedDt));
      this.simAcc -= this.fixedDt;
    }
    this.audio.handleSimEvents(stepEvents);
    const snap = this.sim.getSnapshot();

    if (snap.seed !== prevSeed) this.layoutFromSim();
    if (snap.seed !== this.lastSnapSeed) {
      this.audio.resetPickups();
      this.lastSnapSeed = snap.seed;
    }

    this.audio.processTanks(snap.tanks, frameDt);
    this.audio.processPickups(snap.pickups);
    this.audio.processFx(snap.fx);

    this.renderScores(snap.scores, snap.roundIndex, snap.teamScores);
    if (snap.phase === 'intermission') {
      this.statusText?.setText(
        `得分！下一小局 ${snap.intermissionLeft.toFixed(1)}s · 地图 #${snap.roundIndex + 1}`,
      );
    } else if (snap.phase === 'playing') {
      const restartHint = this.withBots ? ' · R 重开' : '';
      const status = `第 ${snap.roundIndex} 局${restartHint} · L激光/Z冰冻/W闪现/E电磁/A空袭 · 先到 ${this.scoreToWin}`;
      if (this.statusText?.text !== status) this.statusText?.setText(status);
    }

    this.syncTankViewsFromSnap(snap.tanks);
    this.syncBulletsFromSnap(snap.bullets);
    this.drawBeamsFromSnap(snap.beams);
    this.syncPickupsFromSnap(snap.pickups);
    this.syncMinesFromSnap(snap.mines);
    this.drawHazardsFromSnap(snap.hazards);
    this.drawFxFromSnap(snap.fx);
    this.drawLaserSights(snap.tanks);

    if (snap.phase === 'matchEnd') {
      this.matchOver = true;
      let message = '本场结束';
      if (this.matchMode === 'mega' && snap.matchWinnerTeam !== null) {
        message = snap.matchWinnerTeam === 0 ? '红队先到分获胜！' : '蓝队先到分获胜！';
      } else {
        const winner =
          snap.matchWinnerId === 'p1' ? 'P1' : snap.matchWinnerId === 'p2' ? 'P2' : '无人';
        message = `${winner} 先到 ${this.scoreToWin} 分获胜！`;
      }
      this.scene.start('result', {
        mode: 'local',
        message,
        restart: this.localRestartData(),
      });
    }
  }

  private updateOnlineInput(): void {
    if (!this.room || this.matchOver) return;
    const keys = this.readKeys(this.keys.p1);
    const key = `${keys.left ? 1 : 0}${keys.right ? 1 : 0}${keys.forward ? 1 : 0}${keys.back ? 1 : 0}${keys.fire ? 1 : 0}`;
    const now = performance.now();
    const active = keys.left || keys.right || keys.forward || keys.back || keys.fire;
    const minGap = active ? 0 : 100;
    if (key === this.lastInputKey && now - this.lastInputSentAt < minGap) return;
    this.lastInputKey = key;
    this.lastInputSentAt = now;
    this.seq += 1;
    this.room.send('input', { seq: this.seq, ...keys });
  }

  private renderScores(
    scores: Record<string, number>,
    roundIndex: number,
    teamScores?: Record<number, number>,
  ): void {
    let text: string;
    if (this.matchMode === 'mega' && teamScores) {
      text = `第${roundIndex}局  红队 ${teamScores[0] ?? 0}  ·  蓝队 ${teamScores[1] ?? 0}  /${this.scoreToWin}`;
    } else {
      const parts = Object.entries(scores).map(([id, s], i) => {
        const label = this.mode === 'local' ? id.toUpperCase() : `P${i + 1}`;
        return `${label} ${s}`;
      });
      text = `第${roundIndex}局  ${parts.join('  ·  ')}  /${this.scoreToWin}`;
    }
    if (text === this.lastScoreKey) return;
    this.lastScoreKey = text;
    this.scoreText?.setText(text);
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
      turboTime?: number;
      freezeTime?: number;
      weapon?: string;
      weaponPlus?: boolean;
      invisTime?: number;
      umbrellaTime?: number;
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
        t.turboTime ?? 0,
        t.freezeTime ?? 0,
        Boolean(t.weaponPlus),
        t.invisTime ?? 0,
        t.umbrellaTime ?? 0,
      );
    }
    for (const [id, view] of this.tankViews) {
      if (!ids.has(id)) {
        view.destroy();
        this.tankViews.delete(id);
      }
    }
  }

  private drawBeamsFromSnap(
    beams: { id: number; x1: number; y1: number; x2: number; y2: number; life: number; kind: string }[],
  ): void {
    const g = this.beamGfx;
    if (!g) return;
    g.clear();
    for (const b of beams) {
      const alpha = Math.max(0.35, Math.min(1, b.life / GAME.laserBeamLifeSec));
      const color = b.kind === 'deathray' ? 0xd500f9 : 0xff1744;
      const thick = b.kind === 'deathray' ? 7 : 6;
      g.lineStyle(thick, color, alpha);
      g.beginPath();
      g.moveTo(this.offsetX + b.x1, this.offsetY + b.y1);
      g.lineTo(this.offsetX + b.x2, this.offsetY + b.y2);
      g.strokePath();
      g.lineStyle(2, 0xffffff, alpha * 0.85);
      g.beginPath();
      g.moveTo(this.offsetX + b.x1, this.offsetY + b.y1);
      g.lineTo(this.offsetX + b.x2, this.offsetY + b.y2);
      g.strokePath();
    }
  }

  private drawHazardsFromSnap(
    hazards: { id: number; x: number; y: number; radius: number; timer: number }[],
  ): void {
    const g = this.hazardGfx;
    if (!g) return;
    g.clear();
    for (const h of hazards) {
      const pulse = 0.35 + 0.35 * Math.sin(this.timeSec * 10);
      g.lineStyle(2, 0xff5252, 0.5 + pulse);
      g.strokeCircle(this.offsetX + h.x, this.offsetY + h.y, h.radius);
      g.fillStyle(0xff1744, 0.12 + pulse * 0.1);
      g.fillCircle(this.offsetX + h.x, this.offsetY + h.y, h.radius * 0.4);
    }
  }

  private drawFxFromSnap(
    fx: {
      id: number;
      kind: string;
      x: number;
      y: number;
      life: number;
      maxLife?: number;
      radius: number;
      colorIndex: number;
      label?: string;
    }[],
  ): void {
    const g = this.fxGfx;
    if (!g) return;
    g.clear();
    const announceLive = new Set<number>();
    for (const f of fx) {
      const maxLife = (f.maxLife ?? 0) > 0 ? f.maxLife! : 0.45;
      const progress = 1 - Math.max(0, Math.min(1, f.life / maxLife));
      const alpha = Math.max(0.15, Math.min(1, f.life / Math.max(0.2, maxLife * 0.55)));
      const hex = GAME.playerColors[f.colorIndex % GAME.playerColors.length]!;
      const color = Phaser.Display.Color.HexStringToColor(hex).color;
      const cx = this.offsetX + f.x;
      const cy = this.offsetY + f.y;

      if (f.kind === 'announce') {
        announceLive.add(f.id);
        this.upsertAnnounceText(f.id, f.label ?? '', cx, cy, progress, color);
        continue;
      }

      if (f.kind === 'muzzle') {
        g.fillStyle(0xfff59d, alpha);
        g.fillCircle(cx, cy, f.radius * (1.1 - progress * 0.4));
        g.fillStyle(0xffffff, alpha * 0.85);
        g.fillCircle(cx, cy, f.radius * 0.4);
      } else if (f.kind === 'freeze') {
        const r = f.radius * (0.55 + progress * 0.5);
        g.lineStyle(4, 0x82b1ff, alpha);
        g.strokeCircle(cx, cy, r);
        g.lineStyle(2, 0xe3f2fd, alpha * 0.7);
        g.strokeCircle(cx, cy, r * 0.72);
        g.fillStyle(0x82b1ff, alpha * 0.14);
        g.fillCircle(cx, cy, r);
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + progress * 2;
          g.fillStyle(0xe3f2fd, alpha * 0.8);
          g.fillCircle(cx + Math.cos(a) * r * 0.85, cy + Math.sin(a) * r * 0.85, 3);
        }
      } else if (f.kind === 'emp') {
        const r = f.radius * (0.4 + progress * 0.65);
        g.lineStyle(4, 0xffd740, alpha);
        g.strokeCircle(cx, cy, r);
        g.lineStyle(2, 0xffffff, alpha * 0.75);
        g.strokeCircle(cx, cy, r * 0.55);
        g.lineStyle(2, 0xff6f00, alpha * 0.6);
        g.beginPath();
        g.moveTo(cx - r * 0.7, cy);
        g.lineTo(cx + r * 0.7, cy);
        g.moveTo(cx, cy - r * 0.7);
        g.lineTo(cx, cy + r * 0.7);
        g.strokePath();
      } else if (f.kind === 'blink') {
        g.fillStyle(color, alpha * 0.45);
        g.fillCircle(cx, cy, f.radius * (1.2 - progress * 0.5));
        g.lineStyle(3, 0xb2ff59, alpha);
        g.strokeCircle(cx, cy, f.radius * (0.8 + progress * 0.4));
        g.fillStyle(0xffffff, alpha * 0.5);
        g.fillCircle(cx, cy, 4);
      } else if (f.kind === 'booby') {
        g.fillStyle(0xff1744, alpha);
        g.fillCircle(cx, cy, f.radius * 0.55);
        g.lineStyle(2, 0xfff176, alpha);
        g.strokeCircle(cx, cy, f.radius * (0.7 + progress * 0.4));
      } else if (f.kind === 'cast') {
        const r = f.radius * (0.35 + progress * 0.9);
        g.lineStyle(3, color, alpha);
        g.strokeCircle(cx, cy, r);
        g.fillStyle(color, alpha * 0.18);
        g.fillCircle(cx, cy, r * 0.6);
      } else if (f.kind === 'burst') {
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2 - Math.PI / 2;
          const len = f.radius * (0.4 + progress * 0.8);
          g.lineStyle(3, 0xff9100, alpha);
          g.beginPath();
          g.moveTo(cx, cy);
          g.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
          g.strokePath();
        }
        g.fillStyle(0xffe082, alpha * 0.7);
        g.fillCircle(cx, cy, 6 + progress * 8);
      } else if (f.kind === 'boom') {
        const r = f.radius * (0.25 + progress * 0.95);
        g.fillStyle(0xff6d00, alpha * 0.35);
        g.fillCircle(cx, cy, r);
        g.lineStyle(4, 0xff1744, alpha);
        g.strokeCircle(cx, cy, r);
        g.lineStyle(2, 0xffea00, alpha * 0.8);
        g.strokeCircle(cx, cy, r * 0.55);
      } else if (f.kind === 'shield') {
        const r = f.radius * (0.7 + progress * 0.5);
        g.lineStyle(3, 0x80deea, alpha);
        g.strokeCircle(cx, cy, r);
        g.lineStyle(1, 0xe0f7fa, alpha * 0.7);
        g.strokeCircle(cx, cy, r * 1.15);
      } else if (f.kind === 'turbo') {
        const r = f.radius * (0.6 + progress * 0.5);
        g.lineStyle(3, 0xff6d00, alpha);
        g.strokeCircle(cx, cy, r);
        g.fillStyle(0xffab40, alpha * 0.2);
        g.fillCircle(cx, cy, r * 0.5);
      } else if (f.kind === 'airstrike') {
        const r = f.radius * (0.7 + Math.sin(progress * Math.PI) * 0.15);
        g.lineStyle(3, 0xff5252, alpha);
        g.strokeCircle(cx, cy, r);
        g.lineStyle(2, 0xffea00, alpha * 0.8);
        g.beginPath();
        g.moveTo(cx - r * 0.6, cy);
        g.lineTo(cx + r * 0.6, cy);
        g.moveTo(cx, cy - r * 0.6);
        g.lineTo(cx, cy + r * 0.6);
        g.strokePath();
        g.fillStyle(0xff1744, alpha * 0.15);
        g.fillCircle(cx, cy, r * 0.35);
      }
    }
    for (const [id, text] of this.announceTexts) {
      if (!announceLive.has(id)) {
        text.destroy();
        this.announceTexts.delete(id);
      }
    }
  }

  private upsertAnnounceText(
    id: number,
    label: string,
    x: number,
    y: number,
    progress: number,
    color: number,
  ): void {
    let text = this.announceTexts.get(id);
    if (!text) {
      text = this.add
        .text(x, y, label, {
          fontFamily: 'Segoe UI, Microsoft YaHei, sans-serif',
          fontSize: '22px',
          color: '#ffffff',
          stroke: '#1a1208',
          strokeThickness: 6,
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setDepth(40);
      this.announceTexts.set(id, text);
    }
    // Small → large, then fade; rise above the tank
    const scale = 0.28 + progress * 1.35;
    const alpha = progress < 0.65 ? 1 : Math.max(0, 1 - (progress - 0.65) / 0.35);
    const rise = 18 + progress * 42;
    text.setText(label);
    text.setPosition(x, y - rise);
    text.setScale(scale);
    text.setAlpha(alpha);
    text.setTint(color);
  }

  private clearAnnounceTexts(): void {
    for (const text of this.announceTexts.values()) text.destroy();
    this.announceTexts.clear();
  }

  private syncBulletsFromSnap(
    bullets: { id: number; x: number; y: number; vx?: number; vy?: number; kind?: string }[],
  ): void {
    const live = new Set(bullets.map((b) => b.id));
    for (const b of bullets) {
      let view = this.bulletViews.get(b.id);
      if (!view) {
        view = new BulletView(this, b.kind ?? 'normal');
        this.bulletViews.set(b.id, view);
      }
      view.setPose(
        this.offsetX + b.x,
        this.offsetY + b.y,
        Math.atan2(b.vy ?? 0, b.vx ?? 1),
      );
    }
    for (const [id, view] of this.bulletViews) {
      if (!live.has(id)) {
        view.destroy();
        this.bulletViews.delete(id);
      }
    }
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

  private drawLaserSights(
    tanks: { x: number; y: number; angle: number; alive: boolean; showLaserSight: boolean; colorIndex: number }[],
  ): void {
    const g = this.laserSight;
    if (!g || !this.sim) return;
    g.clear();
    let any = false;
    for (const t of tanks) {
      if (!t.alive || !t.showLaserSight) continue;
      any = true;
      this.strokeSight(g, t.x, t.y, t.angle, t.colorIndex, this.sim.maze.walls);
    }
    if (!any) return;
  }

  private drawOnlineLaserSightsFromList(tanks: OnlineTankSnap[]): void {
    const g = this.laserSight;
    if (!g) return;
    g.clear();
    const walls = this.onlineWalls;
    if (walls.length === 0) return;
    for (const t of tanks) {
      if (!t.alive || !t.showLaserSight) continue;
      this.strokeSight(g, t.x, t.y, t.angle, t.colorIndex, walls);
    }
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
    g.lineStyle(2, color, 0.5);
    const f = { x: Math.cos(angle), y: Math.sin(angle) };
    const hitR = GAME.tankRadius + 6 + GAME.wallThickness * 0.5;
    const points = traceBouncingBeam(x, y, f.x, f.y, walls, {
      maxBounces: GAME.laserBounces,
      segLen: 14,
      hitRadius: hitR,
      maxSegs: 48,
    });
    if (points.length < 2) return;
    g.beginPath();
    g.moveTo(this.offsetX + points[0]!.x, this.offsetY + points[0]!.y);
    for (let i = 1; i < points.length; i++) {
      g.lineTo(this.offsetX + points[i]!.x, this.offsetY + points[i]!.y);
    }
    g.strokePath();
  }

  private teardownChat(): void {
    this.gameChat?.destroy();
    this.gameChat = null;
    this.chatBubbles?.destroy();
    this.chatBubbles = null;
  }

  shutdown(): void {
    this.teardownChat();
    this.audio.stopBgm();
    this.audio.resetBattleState();
    this.mazeView?.destroy();
    this.laserSight?.destroy();
    this.beamGfx?.destroy();
    this.hazardGfx?.destroy();
    this.fxGfx?.destroy();
    this.clearAnnounceTexts();
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
