import { Room, ServerError, type Client } from '@colyseus/core';
import { GAME, GameSim, type InputMessage } from '@tanktrouble/shared';
import {
  BattleState,
  BulletState,
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
      if (!p || this.state.phase === 'playing') return;
      p.ready = !p.ready;
      this.tryStart();
    });

    this.onMessage('input', (client, message: InputMessage) => {
      if (this.state.phase !== 'playing') return;
      this.inputs.set(client.sessionId, message);
    });

    this.onMessage('restart', () => {
      if (this.state.phase !== 'ended') return;
      for (const p of this.state.players.values()) p.ready = false;
      this.state.phase = 'waiting';
      this.state.winnerId = '';
      this.sim = null;
      this.state.tanks.clear();
      this.state.bullets.clear();
    });

    this.setSimulationInterval((deltaTime) => {
      if (this.state.phase !== 'playing' || !this.sim) return;
      const dt = Math.min(0.05, deltaTime / 1000);
      for (const [id, input] of this.inputs) {
        this.sim.applyInput(id, input);
      }
      const events = this.sim.step(dt);
      this.syncFromSim();
      for (const ev of events) {
        if (ev.type === 'roundEnd') {
          this.state.phase = 'ended';
          this.state.winnerId = ev.winnerId ?? '';
        }
      }
    }, 1000 / GAME.tickHz);
  }

  onJoin(client: Client): void {
    if (this.state.phase === 'playing') {
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
    this.state.players.set(client.sessionId, p);
  }

  async onLeave(client: Client): Promise<void> {
    this.state.players.delete(client.sessionId);
    this.inputs.delete(client.sessionId);

    if (this.state.phase === 'playing' && this.sim) {
      const events = this.sim.markDead(client.sessionId);
      this.syncFromSim();
      for (const ev of events) {
        if (ev.type === 'roundEnd') {
          this.state.phase = 'ended';
          this.state.winnerId = ev.winnerId ?? '';
        }
      }
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
    this.startRound();
  }

  private startRound(): void {
    const ids = [...this.state.players.keys()];
    const seed = (Math.random() * 1e9) | 0;
    this.sim = new GameSim(seed, ids);
    this.state.seed = seed;
    this.state.phase = 'playing';
    this.state.winnerId = '';
    this.inputs.clear();
    this.syncFromSim();
    this.broadcast('start', { seed });
  }

  private syncFromSim(): void {
    if (!this.sim) return;
    const snap = this.sim.getSnapshot();
    this.state.seed = snap.seed;
    this.state.phase = snap.phase;
    this.state.winnerId = snap.winnerId ?? '';

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
    }
    for (const key of [...this.state.bullets.keys()]) {
      if (!seenBullets.has(key)) this.state.bullets.delete(key);
    }
  }
}
