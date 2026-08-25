import { Room, ServerError, type Client } from '@colyseus/core';
import { GAME, GameSim, type InputMessage } from '@tanktrouble/shared';
import {
  BattleState,
  BulletState,
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
  maxClients = GAME.maxPlayers;
  private sim: GameSim | null = null;
  private inputs = new Map<string, InputMessage>();

  onCreate(options: { roomCode?: string }): void {
    this.setState(new BattleState());
    this.state.roomCode = (options.roomCode ?? randomCode()).toUpperCase();
    this.state.phase = 'waiting';
    this.setMetadata({ roomCode: this.state.roomCode });

    this.onMessage('ready', (client) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || this.state.phase === 'playing' || this.state.phase === 'intermission') return;
      if (this.state.phase === 'matchEnd') return;
      p.ready = !p.ready;
      this.tryStart();
    });

    this.onMessage('input', (client, message: InputMessage) => {
      if (this.state.phase !== 'playing' && this.state.phase !== 'intermission') return;
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
      this.state.scores.clear();
      this.sim = null;
      this.state.tanks.clear();
      this.state.bullets.clear();
      this.state.pickups.clear();
      this.state.mines.clear();
    });

    this.setSimulationInterval((deltaTime) => {
      if (!this.sim) return;
      if (
        this.state.phase !== 'playing' &&
        this.state.phase !== 'intermission'
      ) {
        return;
      }
      const dt = Math.min(0.05, deltaTime / 1000);
      for (const [id, input] of this.inputs) {
        this.sim.applyInput(id, input);
      }
      this.sim.step(dt);
      this.syncFromSim();
    }, 1000 / GAME.tickHz);
  }

  onJoin(client: Client): void {
    if (this.state.phase !== 'waiting') {
      throw new ServerError(4010, '对局已开始');
    }
    if (this.state.players.size >= GAME.maxPlayers) {
      throw new ServerError(4011, '房间已满');
    }
    const colorIndex = this.state.players.size;
    const p = new PlayerState();
    p.id = client.sessionId;
    p.ready = false;
    p.colorIndex = colorIndex;
    p.score = 0;
    this.state.players.set(client.sessionId, p);
    this.state.scores.set(client.sessionId, 0);
  }

  async onLeave(client: Client): Promise<void> {
    this.state.players.delete(client.sessionId);
    this.inputs.delete(client.sessionId);
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
    if (this.state.players.size < GAME.minPlayers) return;
    for (const p of this.state.players.values()) {
      if (!p.ready) return;
    }
    this.startMatch();
  }

  private startMatch(): void {
    const ids = [...this.state.players.keys()];
    for (const id of ids) {
      this.state.scores.set(id, 0);
      const p = this.state.players.get(id);
      if (p) p.score = 0;
    }
    const seed = (Math.random() * 1e9) | 0;
    this.sim = new GameSim(seed, ids);
    this.state.seed = seed;
    this.state.phase = 'playing';
    this.state.winnerId = '';
    this.state.matchWinnerId = '';
    this.state.roundIndex = 1;
    this.inputs.clear();
    this.syncFromSim();
    this.broadcast('start', { seed });
  }

  private syncFromSim(): void {
    if (!this.sim) return;
    const snap = this.sim.getSnapshot();
    this.state.seed = snap.seed;
    this.state.phase =
      snap.phase === 'matchEnd'
        ? 'matchEnd'
        : snap.phase === 'intermission'
          ? 'intermission'
          : 'playing';
    this.state.winnerId = snap.roundWinnerId ?? '';
    this.state.matchWinnerId = snap.matchWinnerId ?? '';
    this.state.roundIndex = snap.roundIndex;
    this.state.intermissionLeft = snap.intermissionLeft;

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
      ts.shieldTime = t.shieldTime;
      ts.weapon = t.weapon;
      ts.ammo = Number.isFinite(t.ammo) ? t.ammo : 99;
      ts.showLaserSight = t.showLaserSight;
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
  }
}
