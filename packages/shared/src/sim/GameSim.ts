import { GAME, PICKUP_POOL, type WeaponKind } from '../config.js';
import { generateMaze } from '../maze/generateMaze.js';
import { createRng } from '../maze/rng.js';
import { shuffleWithSeed } from '../maze/shuffle.js';
import type {
  InputMessage,
  MazeData,
  SimBullet,
  SimEvent,
  SimMine,
  SimPickup,
  SimSnapshot,
  SimTank,
} from '../types.js';
import {
  bounceBulletOffWall,
  circleHitsSegment,
  circlesOverlap,
  forwardFromAngle,
  resolveCircleWalls,
} from './collide.js';

const emptyInput = (): InputMessage => ({
  seq: 0,
  forward: false,
  back: false,
  left: false,
  right: false,
  fire: false,
});

function weaponAmmo(kind: WeaponKind): number {
  switch (kind) {
    case 'laser':
    case 'homing':
    case 'frag':
    case 'deathray':
      return 1;
    case 'shotgun':
      return GAME.shotgunAmmo;
    case 'gatling':
      return GAME.gatlingAmmo;
    case 'booby':
      return GAME.mineCount;
    default:
      return Infinity;
  }
}

export class GameSim {
  maze: MazeData;
  private readonly playerIds: string[];
  private readonly colorById = new Map<string, number>();
  private tanks = new Map<string, SimTank>();
  private bullets: SimBullet[] = [];
  private pickups: SimPickup[] = [];
  private mines: SimMine[] = [];
  private inputs = new Map<string, InputMessage>();
  private scores = new Map<string, number>();
  private nextBulletId = 1;
  private nextPickupId = 1;
  private nextMineId = 1;
  private phase: SimSnapshot['phase'] = 'playing';
  private roundWinnerId: string | null = null;
  private matchWinnerId: string | null = null;
  private intermissionLeft = 0;
  private pickupTimer = 0;
  private roundIndex = 1;
  private rng: () => number;

  constructor(seed: number, playerIds: string[]) {
    this.playerIds = [...playerIds];
    this.rng = createRng(seed);
    playerIds.forEach((id, i) => {
      this.colorById.set(id, i % GAME.playerColors.length);
      this.scores.set(id, 0);
      this.inputs.set(id, emptyInput());
    });
    this.maze = generateMaze(seed);
    this.spawnTanks(seed);
    this.pickupTimer = GAME.pickupSpawnIntervalSec * 0.4;
  }

  applyInput(playerId: string, input: InputMessage): void {
    if (!this.tanks.has(playerId)) return;
    this.inputs.set(playerId, { ...input });
  }

  step(dt: number): SimEvent[] {
    const events: SimEvent[] = [];

    if (this.phase === 'matchEnd') return events;

    if (this.phase === 'intermission') {
      this.intermissionLeft -= dt;
      if (this.intermissionLeft <= 0) {
        this.beginNextRound();
      }
      return events;
    }

    this.tickPickups(dt, events);
    this.tickTanks(dt, events);
    this.tickBullets(dt, events);
    this.tickMines(dt, events);
    this.checkRoundEnd(events);
    return events;
  }

  getSnapshot(): SimSnapshot {
    const scores: Record<string, number> = {};
    for (const [id, s] of this.scores) scores[id] = s;
    return {
      seed: this.maze.seed,
      tanks: [...this.tanks.values()].map((t) => ({ ...t })),
      bullets: this.bullets.map((b) => ({ ...b })),
      pickups: this.pickups.map((p) => ({ ...p })),
      mines: this.mines.map((m) => ({ ...m })),
      scores,
      phase: this.phase,
      roundWinnerId: this.roundWinnerId,
      matchWinnerId: this.matchWinnerId,
      intermissionLeft: this.intermissionLeft,
      roundIndex: this.roundIndex,
    };
  }

  markDead(playerId: string): SimEvent[] {
    const tank = this.tanks.get(playerId);
    if (!tank || !tank.alive || this.phase !== 'playing') return [];
    tank.alive = false;
    const events: SimEvent[] = [{ type: 'hit', bulletId: -1, tankId: playerId }];
    this.checkRoundEnd(events);
    return events;
  }

  private spawnTanks(seed: number): void {
    const order = shuffleWithSeed(this.maze.spawns, seed ^ 0xa5a5a5a5);
    this.playerIds.forEach((id, index) => {
      const spawn = order[index % order.length]!;
      const face = shuffleWithSeed([0, Math.PI / 2, Math.PI, -Math.PI / 2], seed + index + 17)[0]!;
      this.tanks.set(id, {
        id,
        x: spawn.x,
        y: spawn.y,
        angle: face,
        alive: true,
        colorIndex: this.colorById.get(id) ?? 0,
        fireCooldown: 0,
        weapon: 'default',
        ammo: Infinity,
        shieldTime: 0,
        prevFire: false,
        showLaserSight: false,
      });
    });
  }

  private beginNextRound(): void {
    const seed = (this.rng() * 1e9) | 0;
    this.rng = createRng(seed);
    this.maze = generateMaze(seed);
    this.bullets = [];
    this.pickups = [];
    this.mines = [];
    this.roundWinnerId = null;
    this.phase = 'playing';
    this.roundIndex += 1;
    this.pickupTimer = GAME.pickupSpawnIntervalSec * 0.5;
    this.spawnTanks(seed);
    for (const id of this.playerIds) this.inputs.set(id, emptyInput());
  }

  private tickPickups(dt: number, events: SimEvent[]): void {
    this.pickupTimer -= dt;
    if (
      this.pickupTimer <= 0 &&
      this.pickups.length < GAME.maxPickups
    ) {
      this.pickupTimer = GAME.pickupSpawnIntervalSec;
      this.spawnPickup();
    }

    for (const tank of this.tanks.values()) {
      if (!tank.alive) continue;
      const hit = this.pickups.find((p) =>
        circlesOverlap(tank.x, tank.y, GAME.tankRadius * 0.7, p.x, p.y, GAME.pickupRadius),
      );
      if (!hit) continue;
      this.pickups = this.pickups.filter((p) => p.id !== hit.id);
      events.push({ type: 'pickup', tankId: tank.id, kind: hit.kind });
      if (hit.kind === 'shield') {
        tank.shieldTime = GAME.shieldDurationSec;
      } else {
        tank.weapon = hit.kind;
        tank.ammo = weaponAmmo(hit.kind);
      }
    }
  }

  private spawnPickup(): void {
    const kind = PICKUP_POOL[Math.floor(this.rng() * PICKUP_POOL.length)]!;
    for (let attempt = 0; attempt < 30; attempt++) {
      const c = Math.floor(this.rng() * this.maze.cols);
      const r = Math.floor(this.rng() * this.maze.rows);
      const x = c * GAME.cellSize + GAME.cellSize / 2;
      const y = r * GAME.cellSize + GAME.cellSize / 2;
      const blocked = [...this.tanks.values()].some(
        (t) => t.alive && circlesOverlap(t.x, t.y, GAME.tankRadius * 2, x, y, GAME.pickupRadius),
      );
      if (blocked) continue;
      this.pickups.push({ id: this.nextPickupId++, kind, x, y });
      return;
    }
  }

  private tickTanks(dt: number, events: SimEvent[]): void {
    for (const tank of this.tanks.values()) {
      if (!tank.alive) continue;
      const input = this.inputs.get(tank.id) ?? emptyInput();
      const fireEdge = input.fire && !tank.prevFire;
      tank.prevFire = input.fire;

      tank.shieldTime = Math.max(0, tank.shieldTime - dt);
      tank.showLaserSight = tank.weapon === 'laser' || tank.weapon === 'deathray';

      const steeringMissile = this.bullets.find(
        (b) => b.ownerId === tank.id && b.kind === 'homing' && b.life > 0,
      );
      // Classic RC feel: while homing is out, still allow turn for mild control via tank angle influence
      if (!steeringMissile || tank.weapon !== 'homing') {
        if (input.left) tank.angle -= GAME.tankTurnSpeed * dt;
        if (input.right) tank.angle += GAME.tankTurnSpeed * dt;
        let move = 0;
        if (input.forward) move += 1;
        if (input.back) move -= 1;
        if (move !== 0) {
          const f = forwardFromAngle(tank.angle);
          tank.x += f.x * GAME.tankSpeed * move * dt;
          tank.y += f.y * GAME.tankSpeed * move * dt;
          const resolved = resolveCircleWalls(tank.x, tank.y, GAME.tankRadius, this.maze.walls);
          tank.x = resolved.x;
          tank.y = resolved.y;
        }
      } else {
        if (input.left) tank.angle -= GAME.tankTurnSpeed * dt;
        if (input.right) tank.angle += GAME.tankTurnSpeed * dt;
      }

      tank.fireCooldown = Math.max(0, tank.fireCooldown - dt);
      this.tryFire(tank, input, fireEdge, events);
    }
  }

  private tryFire(
    tank: SimTank,
    input: InputMessage,
    fireEdge: boolean,
    _events: SimEvent[],
  ): void {
    if (tank.weapon === 'frag') {
      const bomb = this.bullets.find((b) => b.ownerId === tank.id && b.kind === 'frag');
      if (bomb && fireEdge) {
        this.detonateFrag(bomb);
        tank.weapon = 'default';
        tank.ammo = Infinity;
        return;
      }
    }

    if (tank.weapon === 'booby') {
      if (!fireEdge || tank.ammo <= 0) return;
      const back = forwardFromAngle(tank.angle + Math.PI);
      this.mines.push({
        id: this.nextMineId++,
        ownerId: tank.id,
        x: tank.x + back.x * (GAME.tankRadius + 8),
        y: tank.y + back.y * (GAME.tankRadius + 8),
        armed: false,
        armTimer: GAME.mineArmDelaySec,
        triggered: false,
        triggerTimer: 0,
        visible: true,
      });
      tank.ammo -= 1;
      if (tank.ammo <= 0) {
        tank.weapon = 'default';
        tank.ammo = Infinity;
      }
      return;
    }

    if (tank.weapon === 'gatling') {
      if (!input.fire || tank.fireCooldown > 0 || tank.ammo <= 0) return;
      this.spawnBullet(tank, 'pellet', GAME.gatlingBulletSpeed, 3.5, 1.2);
      tank.ammo -= 1;
      tank.fireCooldown = GAME.gatlingCooldownSec;
      if (tank.ammo <= 0) {
        tank.weapon = 'default';
        tank.ammo = Infinity;
      }
      return;
    }

    if (!fireEdge || tank.fireCooldown > 0) return;

    if (tank.weapon === 'default') {
      const owned = this.bullets.filter((b) => b.ownerId === tank.id && b.kind === 'normal').length;
      if (owned >= GAME.maxBulletsPerTank) return;
      this.spawnBullet(tank, 'normal', GAME.bulletSpeed, GAME.bulletRadius, 8);
      tank.fireCooldown = GAME.fireCooldownSec;
      return;
    }

    if (tank.weapon === 'laser') {
      this.spawnBullet(tank, 'laser', GAME.laserSpeed, 4, 12);
      tank.ammo = 0;
      tank.weapon = 'default';
      tank.ammo = Infinity;
      tank.fireCooldown = 0.2;
      return;
    }

    if (tank.weapon === 'deathray') {
      this.fireDeathRay(tank);
      tank.weapon = 'default';
      tank.ammo = Infinity;
      tank.fireCooldown = 0.4;
      return;
    }

    if (tank.weapon === 'shotgun') {
      const base = tank.angle;
      const n = GAME.shotgunPellets;
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        const ang = base - GAME.shotgunSpread / 2 + t * GAME.shotgunSpread;
        const f = forwardFromAngle(ang);
        const muzzle = GAME.tankRadius + 6;
        this.bullets.push({
          id: this.nextBulletId++,
          ownerId: tank.id,
          x: tank.x + f.x * muzzle,
          y: tank.y + f.y * muzzle,
          vx: f.x * (GAME.bulletSpeed * 1.15),
          vy: f.y * (GAME.bulletSpeed * 1.15),
          bounces: 0,
          kind: 'pellet',
          life: 1.1,
          radius: 3.5,
        });
      }
      tank.ammo -= 1;
      tank.fireCooldown = 0.45;
      if (tank.ammo <= 0) {
        tank.weapon = 'default';
        tank.ammo = Infinity;
      }
      return;
    }

    if (tank.weapon === 'homing') {
      this.spawnBullet(tank, 'homing', GAME.homingSpeed, 6, 4);
      this.bullets[this.bullets.length - 1]!.life = 5;
      tank.weapon = 'default';
      tank.ammo = Infinity;
      tank.fireCooldown = 0.3;
      return;
    }

    if (tank.weapon === 'frag') {
      this.spawnBullet(tank, 'frag', GAME.bulletSpeed * 0.75, 7, 6);
      this.bullets[this.bullets.length - 1]!.life = 4;
      tank.ammo = 0;
      tank.fireCooldown = 0.2;
    }
  }

  private spawnBullet(
    tank: SimTank,
    kind: SimBullet['kind'],
    speed: number,
    radius: number,
    maxLifeBounces: number,
  ): void {
    const f = forwardFromAngle(tank.angle);
    const muzzle = GAME.tankRadius + radius + 2;
    this.bullets.push({
      id: this.nextBulletId++,
      ownerId: tank.id,
      x: tank.x + f.x * muzzle,
      y: tank.y + f.y * muzzle,
      vx: f.x * speed,
      vy: f.y * speed,
      bounces: 0,
      kind,
      life: kind === 'normal' || kind === 'laser' ? 20 : maxLifeBounces,
      radius,
    });
  }

  private fireDeathRay(tank: SimTank): void {
    // March a fast laser along bounce path and kill first enemy hit
    let x = tank.x;
    let y = tank.y;
    const f = forwardFromAngle(tank.angle);
    let vx = f.x * GAME.laserSpeed;
    let vy = f.y * GAME.laserSpeed;
    const step = 8;
    for (let i = 0; i < 220; i++) {
      x += (vx / GAME.laserSpeed) * step;
      y += (vy / GAME.laserSpeed) * step;
      for (const wall of this.maze.walls) {
        const hit = circleHitsSegment(x, y, 3, wall);
        if (!hit.hit) continue;
        x += hit.nx * hit.depth;
        y += hit.ny * hit.depth;
        const b = bounceBulletOffWall(vx, vy, wall);
        vx = b.vx;
        vy = b.vy;
        break;
      }
      for (const other of this.tanks.values()) {
        if (!other.alive || other.id === tank.id) continue;
        if (circlesOverlap(x, y, 4, other.x, other.y, GAME.tankRadius)) {
          if (other.shieldTime > 0) return;
          other.alive = false;
          return;
        }
      }
    }
  }

  private detonateFrag(bomb: SimBullet): void {
    this.bullets = this.bullets.filter((b) => b.id !== bomb.id);
    for (let i = 0; i < GAME.fragShrapnel; i++) {
      const ang = (i / GAME.fragShrapnel) * Math.PI * 2;
      const f = forwardFromAngle(ang);
      this.bullets.push({
        id: this.nextBulletId++,
        ownerId: bomb.ownerId,
        x: bomb.x,
        y: bomb.y,
        vx: f.x * GAME.bulletSpeed * 0.9,
        vy: f.y * GAME.bulletSpeed * 0.9,
        bounces: 0,
        kind: 'shrapnel',
        life: 0.9,
        radius: 3,
      });
    }
  }

  private tickBullets(dt: number, events: SimEvent[]): void {
    const survivors: SimBullet[] = [];
    for (const bullet of this.bullets) {
      let alive = true;
      bullet.life -= dt;

      if (bullet.kind === 'homing') {
        let nearest: SimTank | null = null;
        let best = Infinity;
        for (const t of this.tanks.values()) {
          if (!t.alive || t.id === bullet.ownerId) continue;
          const d = (t.x - bullet.x) ** 2 + (t.y - bullet.y) ** 2;
          if (d < best) {
            best = d;
            nearest = t;
          }
        }
        if (nearest) {
          const desired = Math.atan2(nearest.y - bullet.y, nearest.x - bullet.x);
          const cur = Math.atan2(bullet.vy, bullet.vx);
          let diff = desired - cur;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          const maxTurn = GAME.homingTurnRate * dt;
          const turn = Math.max(-maxTurn, Math.min(maxTurn, diff));
          const next = cur + turn;
          const sp = Math.hypot(bullet.vx, bullet.vy) || GAME.homingSpeed;
          bullet.vx = Math.cos(next) * sp;
          bullet.vy = Math.sin(next) * sp;
        }
      }

      if (bullet.kind === 'frag' && bullet.life <= 0) {
        this.detonateFrag(bullet);
        continue;
      }
      if (bullet.life <= 0 && bullet.kind !== 'normal' && bullet.kind !== 'laser') {
        continue;
      }

      const steps = bullet.kind === 'laser' ? 8 : 4;
      const sdt = dt / steps;
      for (let i = 0; i < steps && alive; i++) {
        bullet.x += bullet.vx * sdt;
        bullet.y += bullet.vy * sdt;

        for (const wall of this.maze.walls) {
          const hit = circleHitsSegment(bullet.x, bullet.y, bullet.radius, wall);
          if (!hit.hit) continue;
          bullet.x += hit.nx * hit.depth;
          bullet.y += hit.ny * hit.depth;
          const bounced = bounceBulletOffWall(bullet.vx, bullet.vy, wall);
          bullet.vx = bounced.vx;
          bullet.vy = bounced.vy;
          bullet.bounces += 1;
          events.push({ type: 'bounce', bulletId: bullet.id });
          if (bullet.kind === 'laser' && bullet.bounces > 14) alive = false;
          if (bullet.kind !== 'laser' && bullet.bounces > GAME.maxBulletBounces) alive = false;
          break;
        }
        if (!alive) break;

        for (const tank of this.tanks.values()) {
          if (!tank.alive) continue;
          if (tank.id === bullet.ownerId && bullet.bounces === 0 && bullet.kind !== 'shrapnel') {
            continue;
          }
          if (
            !circlesOverlap(
              bullet.x,
              bullet.y,
              bullet.radius,
              tank.x,
              tank.y,
              GAME.tankRadius,
            )
          ) {
            continue;
          }
          if (tank.shieldTime > 0) {
            // deflect: reverse velocity
            bullet.vx *= -1;
            bullet.vy *= -1;
            bullet.bounces += 1;
            break;
          }
          tank.alive = false;
          events.push({ type: 'hit', bulletId: bullet.id, tankId: tank.id });
          alive = false;
          break;
        }
      }
      if (alive) survivors.push(bullet);
    }
    this.bullets = survivors;
  }

  private tickMines(dt: number, events: SimEvent[]): void {
    const keep: SimMine[] = [];
    for (const mine of this.mines) {
      if (!mine.armed) {
        mine.armTimer -= dt;
        if (mine.armTimer <= 0) {
          mine.armed = true;
          mine.visible = false;
        }
        keep.push(mine);
        continue;
      }

      if (mine.triggered) {
        mine.triggerTimer -= dt;
        if (mine.triggerTimer <= 0) {
          for (const tank of this.tanks.values()) {
            if (!tank.alive) continue;
            if (
              circlesOverlap(
                mine.x,
                mine.y,
                GAME.mineBlastRadius,
                tank.x,
                tank.y,
                GAME.tankRadius,
              )
            ) {
              if (tank.shieldTime > 0) continue;
              tank.alive = false;
              events.push({ type: 'hit', bulletId: -1, tankId: tank.id });
            }
          }
          continue;
        }
        keep.push(mine);
        continue;
      }

      for (const tank of this.tanks.values()) {
        if (!tank.alive) continue;
        if (
          circlesOverlap(
            mine.x,
            mine.y,
            GAME.mineRadius,
            tank.x,
            tank.y,
            GAME.tankRadius,
          )
        ) {
          mine.triggered = true;
          mine.visible = true;
          mine.triggerTimer = 0.35;
          break;
        }
      }
      keep.push(mine);
    }
    this.mines = keep;
  }

  private checkRoundEnd(events: SimEvent[]): void {
    if (this.phase !== 'playing') return;
    const living = [...this.tanks.values()].filter((t) => t.alive);
    if (living.length > 1) return;

    const winnerId = living[0]?.id ?? null;
    this.roundWinnerId = winnerId;
    this.phase = 'intermission';
    this.intermissionLeft = GAME.intermissionSec;
    this.bullets = [];
    this.pickups = [];
    events.push({ type: 'roundEnd', winnerId });

    if (winnerId) {
      const next = (this.scores.get(winnerId) ?? 0) + 1;
      this.scores.set(winnerId, next);
      events.push({ type: 'score', tankId: winnerId, score: next });
      if (next >= GAME.scoreToWin) {
        this.phase = 'matchEnd';
        this.matchWinnerId = winnerId;
        events.push({ type: 'matchEnd', winnerId });
      }
    }
  }
}
