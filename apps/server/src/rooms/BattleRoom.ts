import { Room, ServerError, type Client } from '@colyseus/core';
import {
  CLASSIC_MATCH,
  GAME,
  GameSim,
  MEGA_MATCH,
  type InputMessage,
  type MatchMode,
} from '@tanktrouble/shared';
import {
  BattleState,
  BeamState,
  BulletState,
  FxState,
  HazardState,
  MineState,
  PickupState,
  PlayerState,
  TankState,
} from './schema/BattleState.js';

function randomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 4; i++) {
    out += alphabet[(Math.random() * alphabet.length) | 0];
  }
  return out;
}

export class BattleRoom extends Room<BattleState> {
  maxClients: number = GAME.megaMaxPlayers;
  /** Give mobile / slow networks time to finish the seat WebSocket after matchmake. */
  seatReservationTime = 30;
  private sim: GameSim | null = null;
  private inputs = new Map<string, InputMessage>();
  /** Latches a fire press that arrived between ticks (avoids lost taps). */
  private fireLatch = new Map<string, boolean>();

  onCreate(options: {
    roomCode?: string;
    fillWithBots?: boolean;
    mode?: MatchMode;
    rosterSize?: number;
  }): void {
    this.setState(new BattleState());
    this.state.roomCode = (options.roomCode ?? randomCode()).toUpperCase();
    this.state.phase = 'waiting';
    this.state.fillWithBots = options.fillWithBots ?? GAME.fillWithBots;
    this.state.mode = options.mode === 'mega' ? 'mega' : 'classic';
    const preset = this.state.mode === 'mega' ? MEGA_MATCH : CLASSIC_MATCH;
    const roster =
      this.state.mode === 'mega'
        ? options.rosterSize === 6
          ? 6
          : 8
        : CLASSIC_MATCH.maxPlayers;
    this.state.rosterSize = roster;
    this.state.scoreToWin = preset.scoreToWin;
    // Cap room size to roster so joiners get a clear "full" instead of hanging
    this.maxClients = roster;
    this.setMetadata({ roomCode: this.state.roomCode, mode: this.state.mode });
    // Sync snapshots ~30Hz (was default ~20)
    this.setPatchRate(Math.floor(1000 / GAME.tickHz));
    console.log(
      `[battle] create ${this.state.roomCode} mode=${this.state.mode} roster=${roster} fill=${this.state.fillWithBots}`,
    );
    this.onMessage('ready', (client) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || this.state.phase === 'playing' || this.state.phase === 'intermission') return;
      if (this.state.phase === 'matchEnd') return;
      p.ready = !p.ready;
      this.tryStart();
    });

    this.onMessage('toggleFillBots', () => {
      if (this.state.phase !== 'waiting') return;
      this.state.fillWithBots = !this.state.fillWithBots;
      this.tryStart();
    });

    this.onMessage('setRosterSize', (_client, message: { size?: number }) => {
      if (this.state.phase !== 'waiting' || this.state.mode !== 'mega') return;
      const size = message?.size === 6 ? 6 : 8;
      if (this.state.players.size > size) return;
      this.state.rosterSize = size;
      this.maxClients = size;
      this.tryStart();
    });

    this.onMessage('input', (client, message: InputMessage) => {
      if (this.state.phase !== 'playing' && this.state.phase !== 'intermission') return;
      const prev = this.inputs.get(client.sessionId);
      // Rising edge between simulation ticks must not be overwritten by a later release
      if (message.fire && !prev?.fire) {
        this.fireLatch.set(client.sessionId, true);
      }
      this.inputs.set(client.sessionId, message);
    });

    this.onMessage('restart', () => {
      if (this.state.phase !== 'matchEnd') return;
      for (const p of this.state.players.values()) {
        p.ready = false;
        p.score = 0;
      }
      this.state.phase = 'waiting';
      this.state.winnerId = '';
      this.state.matchWinnerId = '';
      this.state.matchWinnerTeam = -1;
      this.state.teamScore0 = 0;
      this.state.teamScore1 = 0;
      this.state.scores.clear();
      this.sim = null;
      this.state.tanks.clear();
      this.state.bullets.clear();
      this.state.beams.clear();
      this.state.pickups.clear();
      this.state.mines.clear();
      this.state.hazards.clear();
      this.state.fx.clear();
    });

    this.setSimulationInterval((deltaTime) => {
      if (!this.sim) return;
      if (this.state.phase !== 'playing' && this.state.phase !== 'intermission') {
        return;
      }
      const dt = Math.min(0.05, deltaTime / 1000);
      for (const [id, input] of this.inputs) {
        const latched = this.fireLatch.get(id) === true;
        this.fireLatch.delete(id);
        this.sim.applyInput(id, { ...input, fire: input.fire || latched });
      }
      this.sim.step(dt);
      this.syncFromSim();
    }, 1000 / GAME.tickHz);
  }

  onJoin(client: Client): void {
    if (this.state.phase !== 'waiting') {
      throw new ServerError(4010, '对局已开始');
    }
    if (this.state.players.size >= this.state.rosterSize) {
      throw new ServerError(4011, '房间已满');
    }
    const colorIndex = this.state.players.size;
    const p = new PlayerState();
    p.id = client.sessionId;
    p.ready = false;
    p.colorIndex = colorIndex;
    p.score = 0;
    p.team = this.state.mode === 'mega' ? colorIndex % 2 : colorIndex;
    this.state.players.set(client.sessionId, p);
    this.state.scores.set(client.sessionId, 0);
    console.log(
      `[battle] join ${this.state.roomCode} ${client.sessionId} (${this.state.players.size}/${this.state.rosterSize})`,
    );
  }

  async onLeave(client: Client): Promise<void> {
    this.state.players.delete(client.sessionId);
    this.inputs.delete(client.sessionId);
    this.fireLatch.delete(client.sessionId);
    this.state.scores.delete(client.sessionId);

    if (
      (this.state.phase === 'playing' || this.state.phase === 'intermission') &&
      this.sim
    ) {
      this.sim.markDead(client.sessionId);
      this.syncFromSim();
    }

    if (this.state.players.size === 0) {
      this.disconnect();
    }
  }

  private tryStart(): void {
    if (this.state.phase !== 'waiting') return;
    const minNeeded = this.state.fillWithBots ? GAME.minPlayers : 2;
    if (this.state.players.size < minNeeded) return;
    for (const p of this.state.players.values()) {
      if (!p.ready) return;
    }
    this.startMatch();
  }

  private startMatch(): void {
    const humanIds = [...this.state.players.keys()];
    for (const id of humanIds) {
      this.state.scores.set(id, 0);
      const p = this.state.players.get(id);
      if (p) p.score = 0;
    }
    this.state.teamScore0 = 0;
    this.state.teamScore1 = 0;
    const seed = (Math.random() * 1e9) | 0;
    const preset = this.state.mode === 'mega' ? MEGA_MATCH : CLASSIC_MATCH;
    this.sim = new GameSim(seed, humanIds, {
      fillBots: this.state.fillWithBots,
      match: {
        ...preset,
        maxPlayers: this.state.rosterSize,
        fillWithBots: this.state.fillWithBots,
      },
    });
    this.state.seed = seed;
    this.state.phase = 'playing';
    this.state.winnerId = '';
    this.state.matchWinnerId = '';
    this.state.matchWinnerTeam = -1;
    this.state.roundIndex = 1;
    this.inputs.clear();
    this.syncFromSim();
    this.broadcast('start', { seed });
  }

  private syncFromSim(): void {
    if (!this.sim) return;
    const snap = this.sim.getSnapshot();
    this.state.seed = snap.seed;
    this.state.mazeCols = snap.mazeCols;
    this.state.mazeRows = snap.mazeRows;
    this.state.phase =
      snap.phase === 'matchEnd'
        ? 'matchEnd'
        : snap.phase === 'intermission'
          ? 'intermission'
          : 'playing';
    this.state.winnerId = snap.roundWinnerId ?? '';
    this.state.matchWinnerId = snap.matchWinnerId ?? '';
    this.state.matchWinnerTeam = snap.matchWinnerTeam ?? -1;
    this.state.roundIndex = snap.roundIndex;
    this.state.intermissionLeft = snap.intermissionLeft;
    this.state.teamScore0 = snap.teamScores[0] ?? 0;
    this.state.teamScore1 = snap.teamScores[1] ?? 0;

    for (const [id, score] of Object.entries(snap.scores)) {
      this.state.scores.set(id, score);
      const p = this.state.players.get(id);
      if (p) p.score = score;
    }

    const seenTanks = new Set<string>();
    for (const t of snap.tanks) {
      seenTanks.add(t.id);
      let ts = this.state.tanks.get(t.id);
      if (!ts) {
        ts = new TankState();
        this.state.tanks.set(t.id, ts);
      }
      ts.id = t.id;
      ts.x = t.x;
      ts.y = t.y;
      ts.angle = t.angle;
      ts.alive = t.alive;
      ts.colorIndex = t.colorIndex;
      ts.team = t.team;
      ts.shieldTime = t.shieldTime;
      ts.turboTime = t.turboTime;
      ts.freezeTime = t.freezeTime;
      ts.weapon = t.weapon;
      ts.ammo = Number.isFinite(t.ammo) ? t.ammo : 99;
      ts.showLaserSight = t.showLaserSight;
      ts.isBot = t.isBot;
    }
    for (const key of [...this.state.tanks.keys()]) {
      if (!seenTanks.has(key)) this.state.tanks.delete(key);
    }

    const seenBullets = new Set<string>();
    for (const b of snap.bullets) {
      const key = String(b.id);
      seenBullets.add(key);
      let bs = this.state.bullets.get(key);
      if (!bs) {
        bs = new BulletState();
        this.state.bullets.set(key, bs);
      }
      bs.id = b.id;
      bs.x = b.x;
      bs.y = b.y;
      bs.vx = b.vx;
      bs.vy = b.vy;
      bs.kind = b.kind;
    }
    for (const key of [...this.state.bullets.keys()]) {
      if (!seenBullets.has(key)) this.state.bullets.delete(key);
    }

    const seenBeams = new Set<string>();
    for (const b of snap.beams) {
      const key = String(b.id);
      seenBeams.add(key);
      let bs = this.state.beams.get(key);
      if (!bs) {
        bs = new BeamState();
        this.state.beams.set(key, bs);
      }
      bs.id = b.id;
      bs.x1 = b.x1;
      bs.y1 = b.y1;
      bs.x2 = b.x2;
      bs.y2 = b.y2;
      bs.life = b.life;
      bs.kind = b.kind;
    }
    for (const key of [...this.state.beams.keys()]) {
      if (!seenBeams.has(key)) this.state.beams.delete(key);
    }

    const seenPickups = new Set<string>();
    for (const p of snap.pickups) {
      const key = String(p.id);
      seenPickups.add(key);
      let ps = this.state.pickups.get(key);
      if (!ps) {
        ps = new PickupState();
        this.state.pickups.set(key, ps);
      }
      ps.id = p.id;
      ps.kind = p.kind;
      ps.x = p.x;
      ps.y = p.y;
    }
    for (const key of [...this.state.pickups.keys()]) {
      if (!seenPickups.has(key)) this.state.pickups.delete(key);
    }

    const seenMines = new Set<string>();
    for (const m of snap.mines) {
      const key = String(m.id);
      seenMines.add(key);
      let ms = this.state.mines.get(key);
      if (!ms) {
        ms = new MineState();
        this.state.mines.set(key, ms);
      }
      ms.id = m.id;
      ms.x = m.x;
      ms.y = m.y;
      ms.visible = m.visible;
      ms.triggered = m.triggered;
    }
    for (const key of [...this.state.mines.keys()]) {
      if (!seenMines.has(key)) this.state.mines.delete(key);
    }

    const seenHazards = new Set<string>();
    for (const h of snap.hazards) {
      const key = String(h.id);
      seenHazards.add(key);
      let hs = this.state.hazards.get(key);
      if (!hs) {
        hs = new HazardState();
        this.state.hazards.set(key, hs);
      }
      hs.id = h.id;
      hs.x = h.x;
      hs.y = h.y;
      hs.radius = h.radius;
      hs.timer = h.timer;
    }
    for (const key of [...this.state.hazards.keys()]) {
      if (!seenHazards.has(key)) this.state.hazards.delete(key);
    }

    const seenFx = new Set<string>();
    for (const f of snap.fx) {
      const key = String(f.id);
      seenFx.add(key);
      let fs = this.state.fx.get(key);
      if (!fs) {
        fs = new FxState();
        this.state.fx.set(key, fs);
      }
      fs.id = f.id;
      fs.kind = f.kind;
      fs.x = f.x;
      fs.y = f.y;
      fs.life = f.life;
      fs.radius = f.radius;
      fs.colorIndex = f.colorIndex;
    }
    for (const key of [...this.state.fx.keys()]) {
      if (!seenFx.has(key)) this.state.fx.delete(key);
    }
  }
}
