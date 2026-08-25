import {
  CLASSIC_MATCH,
  GAME,
  PICKUP_POOL,
  mazeSizeForRound,
  type MatchConfig,
  type WeaponKind,
} from '../config.js';
import { generateMaze } from '../maze/generateMaze.js';
import { createRng } from '../maze/rng.js';
import { shuffleWithSeed } from '../maze/shuffle.js';
import type {
  InputMessage,
  MazeData,
  SimBeam,
  SimBullet,
  SimEvent,
  SimHazard,
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
import { computeBotInput, fillWithBots, isBotId } from './BotAI.js';

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
    case 'freeze':
    case 'blink':
    case 'emp':
    case 'airstrike':
      return 1;
    case 'shotgun':
      return GAME.shotgunAmmo;
    case 'gatling':
      return GAME.gatlingAmmo;
    case 'booby':
      return GAME.mineCount;
    case 'turbo':
      return 0;
    default:
      return Infinity;
  }
}

export type GameSimOptions = {
  fillBots?: boolean;
  match?: Partial<MatchConfig>;
};

export class GameSim {
  maze: MazeData;
  readonly match: MatchConfig;
  private readonly playerIds: string[];
  private readonly colorById = new Map<string, number>();
  private readonly teamById = new Map<string, number>();
  private tanks = new Map<string, SimTank>();
  private bullets: SimBullet[] = [];
  private beams: SimBeam[] = [];
  private pickups: SimPickup[] = [];
  private mines: SimMine[] = [];
  private hazards: SimHazard[] = [];
  private inputs = new Map<string, InputMessage>();
  private scores = new Map<string, number>();
  private teamScores = new Map<number, number>([
    [0, 0],
    [1, 0],
  ]);
  private nextBulletId = 1;
  private nextPickupId = 1;
  private nextMineId = 1;
  private nextBeamId = 1;
  private nextHazardId = 1;
  private phase: SimSnapshot['phase'] = 'playing';
  private roundWinnerId: string | null = null;
  private matchWinnerId: string | null = null;
  private matchWinnerTeam: number | null = null;
  private intermissionLeft = 0;
  private pickupTimer = 0;
  private roundIndex = 1;
  private rng: () => number;
  private elapsed = 0;

  constructor(seed: number, playerIds: string[], opts?: GameSimOptions) {
    this.match = { ...CLASSIC_MATCH, ...opts?.match };
    if (opts?.fillBots !== undefined) this.match.fillWithBots = opts.fillBots;
    const shouldFill = opts?.fillBots ?? this.match.fillWithBots;
    const roster =
      shouldFill && playerIds.every((id) => !isBotId(id))
        ? fillWithBots(playerIds, this.match.maxPlayers)
        : [...playerIds];
    this.playerIds = roster;
    this.rng = createRng(seed);
    roster.forEach((id, i) => {
      this.colorById.set(id, i % GAME.playerColors.length);
      const team = this.match.teamMode ? i % 2 : i;
      this.teamById.set(id, team);
      this.scores.set(id, 0);
      this.inputs.set(id, emptyInput());
    });
    const size = mazeSizeForRound(1, this.match.scalingMaps);
    this.maze = generateMaze(seed, size.cols, size.rows);
    this.spawnTanks(seed);
    this.pickupTimer = GAME.pickupSpawnIntervalSec * 0.4;
  }

  applyInput(playerId: string, input: InputMessage): void {
    if (!this.tanks.has(playerId)) return;
    this.inputs.set(playerId, { ...input });
  }

  step(dt: number): SimEvent[] {
    const events: SimEvent[] = [];
    this.elapsed += dt;

    if (this.phase === 'matchEnd') return events;

    if (this.phase === 'intermission') {
      this.intermissionLeft -= dt;
      if (this.intermissionLeft <= 0) {
        this.beginNextRound();
      }
      return events;
    }

    this.applyBotInputs();
    this.tickBeams(dt);
    this.tickPickups(dt, events);
    this.tickTanks(dt, events);
    this.tickBullets(dt, events);
    this.tickMines(dt, events);
    this.tickHazards(dt, events);
    this.checkRoundEnd(events);
    return events;
  }

  getSnapshot(): SimSnapshot {
    const scores: Record<string, number> = {};
    for (const [id, s] of this.scores) scores[id] = s;
    const teamScores: Record<number, number> = {};
    for (const [id, s] of this.teamScores) teamScores[id] = s;
    return {
      seed: this.maze.seed,
      mazeCols: this.maze.cols,
      mazeRows: this.maze.rows,
      tanks: [...this.tanks.values()].map((t) => ({ ...t })),
      bullets: this.bullets.map((b) => ({ ...b })),
      beams: this.beams.map((b) => ({ ...b })),
      pickups: this.pickups.map((p) => ({ ...p })),
      mines: this.mines.map((m) => ({ ...m })),
      hazards: this.hazards.map((h) => ({ ...h })),
      scores,
      teamScores,
      phase: this.phase,
      roundWinnerId: this.roundWinnerId,
      matchWinnerId: this.matchWinnerId,
      matchWinnerTeam: this.matchWinnerTeam,
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
    const order = this.match.teamMode
      ? this.teamSpawns(seed)
      : shuffleWithSeed(this.maze.spawns, seed ^ 0xa5a5a5a5);

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
        team: this.teamById.get(id) ?? 0,
        fireCooldown: 0,
        weapon: 'default',
        ammo: Infinity,
        shieldTime: 0,
        turboTime: 0,
        freezeTime: 0,
        prevFire: false,
        showLaserSight: false,
        isBot: isBotId(id),
      });
    });
  }

  private teamSpawns(seed: number): { x: number; y: number }[] {
    const left = this.maze.spawns
      .filter((s) => s.x < (this.maze.cols * GAME.cellSize) / 2)
      .sort((a, b) => a.y - b.y);
    const right = this.maze.spawns
      .filter((s) => s.x >= (this.maze.cols * GAME.cellSize) / 2)
      .sort((a, b) => a.y - b.y);
    const L = left.length ? left : this.maze.spawns;
    const R = right.length ? right : this.maze.spawns;
    const out: { x: number; y: number }[] = [];
    this.playerIds.forEach((_, i) => {
      const side = i % 2 === 0 ? L : R;
      const slot = Math.floor(i / 2) % side.length;
      out.push(side[slot]!);
    });
    return shuffleWithSeed(out, seed ^ 0x55aa);
  }

  private applyBotInputs(): void {
    const all = [...this.tanks.values()];
    const pickups = this.pickups.map((p) => ({ x: p.x, y: p.y }));
    for (const tank of all) {
      if (!tank.isBot || !tank.alive || tank.freezeTime > 0) continue;
      const foes = this.match.teamMode
        ? all.filter((t) => t.team !== tank.team)
        : all;
      this.inputs.set(tank.id, computeBotInput(tank, foes, pickups, this.elapsed));
    }
  }

  private beginNextRound(): void {
    const seed = (this.rng() * 1e9) | 0;
    this.rng = createRng(seed);
    this.roundIndex += 1;
    const size = mazeSizeForRound(this.roundIndex, this.match.scalingMaps);
    this.maze = generateMaze(seed, size.cols, size.rows);
    this.bullets = [];
    this.beams = [];
    this.pickups = [];
    this.mines = [];
    this.hazards = [];
    this.roundWinnerId = null;
    this.phase = 'playing';
    this.pickupTimer = GAME.pickupSpawnIntervalSec * 0.5;
    this.spawnTanks(seed);
    for (const id of this.playerIds) this.inputs.set(id, emptyInput());
  }

  private tickBeams(dt: number): void {
    this.beams = this.beams
      .map((b) => ({ ...b, life: b.life - dt }))
      .filter((b) => b.life > 0);
  }

  private tickPickups(dt: number, events: SimEvent[]): void {
    this.pickupTimer -= dt;
    const cap = this.match.mode === 'mega' ? GAME.megaMaxPickups : GAME.maxPickups;
    if (this.pickupTimer <= 0 && this.pickups.length < cap) {
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
      } else if (hit.kind === 'turbo') {
        tank.turboTime = GAME.turboDurationSec;
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
      tank.turboTime = Math.max(0, tank.turboTime - dt);
      tank.freezeTime = Math.max(0, tank.freezeTime - dt);
      tank.showLaserSight = tank.weapon === 'laser' || tank.weapon === 'deathray';

      if (tank.freezeTime > 0) {
        tank.fireCooldown = Math.max(0, tank.fireCooldown - dt);
        continue;
      }

      const speedMul = tank.turboTime > 0 ? GAME.turboSpeedMul : 1;
      const turnMul = tank.turboTime > 0 ? GAME.turboTurnMul : 1;

      const steeringMissile = this.bullets.find(
        (b) => b.ownerId === tank.id && b.kind === 'homing' && b.life > 0,
      );
      if (!steeringMissile || tank.weapon !== 'homing') {
        if (input.left) tank.angle -= GAME.tankTurnSpeed * turnMul * dt;
        if (input.right) tank.angle += GAME.tankTurnSpeed * turnMul * dt;
        let move = 0;
        if (input.forward) move += 1;
        if (input.back) move -= 1;
        if (move !== 0) {
          const f = forwardFromAngle(tank.angle);
          tank.x += f.x * GAME.tankSpeed * speedMul * move * dt;
          tank.y += f.y * GAME.tankSpeed * speedMul * move * dt;
          const resolved = resolveCircleWalls(tank.x, tank.y, GAME.tankRadius, this.maze.walls);
          tank.x = resolved.x;
          tank.y = resolved.y;
        }
      } else {
        if (input.left) tank.angle -= GAME.tankTurnSpeed * turnMul * dt;
        if (input.right) tank.angle += GAME.tankTurnSpeed * turnMul * dt;
      }

      tank.fireCooldown = Math.max(0, tank.fireCooldown - dt);
      this.tryFire(tank, input, fireEdge, events);
    }
  }

  private clearWeapon(tank: SimTank): void {
    tank.weapon = 'default';
    tank.ammo = Infinity;
  }

  private isAlly(a: SimTank, b: SimTank): boolean {
    if (a.id === b.id) return true;
    return this.match.teamMode && a.team === b.team;
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
        this.clearWeapon(tank);
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
      if (tank.ammo <= 0) this.clearWeapon(tank);
      return;
    }

    if (tank.weapon === 'gatling') {
      if (!input.fire || tank.fireCooldown > 0 || tank.ammo <= 0) return;
      this.spawnBullet(tank, 'pellet', GAME.gatlingBulletSpeed, 3.5, 1.2);
      tank.ammo -= 1;
      tank.fireCooldown = GAME.gatlingCooldownSec;
      if (tank.ammo <= 0) this.clearWeapon(tank);
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
      this.fireLaserBeam(tank, 'laser', GAME.laserBounces, false);
      this.clearWeapon(tank);
      tank.fireCooldown = 0.25;
      return;
    }

    if (tank.weapon === 'deathray') {
      this.fireLaserBeam(tank, 'deathray', 10, true);
      this.clearWeapon(tank);
      tank.fireCooldown = 0.4;
      return;
    }

    if (tank.weapon === 'freeze') {
      for (const other of this.tanks.values()) {
        if (!other.alive || this.isAlly(tank, other)) continue;
        if (
          circlesOverlap(tank.x, tank.y, GAME.freezeRadius, other.x, other.y, GAME.tankRadius)
        ) {
          other.freezeTime = Math.max(other.freezeTime, GAME.freezeDurationSec);
        }
      }
      this.clearWeapon(tank);
      tank.fireCooldown = 0.3;
      return;
    }

    if (tank.weapon === 'blink') {
      const f = forwardFromAngle(tank.angle);
      const step = 6;
      let x = tank.x;
      let y = tank.y;
      let traveled = 0;
      while (traveled < GAME.blinkDistance) {
        const nx = x + f.x * step;
        const ny = y + f.y * step;
        const resolved = resolveCircleWalls(nx, ny, GAME.tankRadius, this.maze.walls);
        if (Math.hypot(resolved.x - nx, resolved.y - ny) > 0.5) break;
        x = resolved.x;
        y = resolved.y;
        traveled += step;
      }
      tank.x = x;
      tank.y = y;
      this.clearWeapon(tank);
      tank.fireCooldown = 0.2;
      return;
    }

    if (tank.weapon === 'emp') {
      for (const other of this.tanks.values()) {
        if (!other.alive || this.isAlly(tank, other)) continue;
        if (!circlesOverlap(tank.x, tank.y, GAME.empRadius, other.x, other.y, GAME.tankRadius)) {
          continue;
        }
        other.weapon = 'default';
        other.ammo = Infinity;
        other.turboTime = 0;
        other.freezeTime = Math.max(other.freezeTime, 0.6);
      }
      this.clearWeapon(tank);
      tank.fireCooldown = 0.3;
      return;
    }

    if (tank.weapon === 'airstrike') {
      const f = forwardFromAngle(tank.angle);
      const dist = 160;
      this.hazards.push({
        id: this.nextHazardId++,
        x: tank.x + f.x * dist,
        y: tank.y + f.y * dist,
        radius: GAME.airstrikeRadius,
        timer: GAME.airstrikeDelaySec,
        ownerId: tank.id,
      });
      this.clearWeapon(tank);
      tank.fireCooldown = 0.35;
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
      if (tank.ammo <= 0) this.clearWeapon(tank);
      return;
    }

    if (tank.weapon === 'homing') {
      this.spawnBullet(tank, 'homing', GAME.homingSpeed, 6, 4);
      this.bullets[this.bullets.length - 1]!.life = 5;
      this.clearWeapon(tank);
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
      life: kind === 'normal' ? 20 : maxLifeBounces,
      radius,
    });
  }

  /** Instant bouncing beam — kills on contact (deathray can pierce). */
  private fireLaserBeam(
    tank: SimTank,
    kind: 'laser' | 'deathray',
    maxBounces: number,
    pierce: boolean,
  ): void {
    const f = forwardFromAngle(tank.angle);
    const muzzle = GAME.tankRadius + 4;
    let x = tank.x + f.x * muzzle;
    let y = tank.y + f.y * muzzle;
    let vx = f.x;
    let vy = f.y;
    const step = 5;
    let bounces = 0;
    let segX = x;
    let segY = y;

    const pushSeg = (x2: number, y2: number) => {
      if (Math.hypot(x2 - segX, y2 - segY) < 2) return;
      this.beams.push({
        id: this.nextBeamId++,
        x1: segX,
        y1: segY,
        x2,
        y2,
        life: GAME.laserBeamLifeSec,
        kind,
      });
      segX = x2;
      segY = y2;
    };

    for (let i = 0; i < 480; i++) {
      const nx = x + vx * step;
      const ny = y + vy * step;
      let bounced = false;

      for (const wall of this.maze.walls) {
        const hit = circleHitsSegment(nx, ny, 2.5, wall);
        if (!hit.hit) continue;
        pushSeg(x, y);
        x += hit.nx * hit.depth;
        y += hit.ny * hit.depth;
        const b = bounceBulletOffWall(vx * 100, vy * 100, wall);
        const sp = Math.hypot(b.vx, b.vy) || 1;
        vx = b.vx / sp;
        vy = b.vy / sp;
        bounces += 1;
        bounced = true;
        if (bounces > maxBounces) {
          pushSeg(x, y);
          return;
        }
        break;
      }

      if (!bounced) {
        x = nx;
        y = ny;
      }

      for (const other of this.tanks.values()) {
        if (!other.alive || this.isAlly(tank, other)) continue;
        if (!circlesOverlap(x, y, 5, other.x, other.y, GAME.tankRadius)) continue;
        pushSeg(other.x, other.y);
        if (other.shieldTime > 0) return;
        other.alive = false;
        if (!pierce) return;
      }
    }

    pushSeg(x, y);
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
        const owner = this.tanks.get(bullet.ownerId);
        for (const t of this.tanks.values()) {
          if (!t.alive) continue;
          if (owner && this.isAlly(owner, t)) continue;
          if (!owner && t.id === bullet.ownerId) continue;
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
      if (bullet.life <= 0 && bullet.kind !== 'normal') {
        continue;
      }

      const steps = 4;
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
          if (bullet.bounces > GAME.maxBulletBounces) alive = false;
          break;
        }
        if (!alive) break;

        const owner = this.tanks.get(bullet.ownerId);
        for (const tank of this.tanks.values()) {
          if (!tank.alive) continue;
          if (owner && this.isAlly(owner, tank) && bullet.kind !== 'shrapnel') continue;
          if (
            tank.id === bullet.ownerId &&
            bullet.bounces === 0 &&
            bullet.kind !== 'shrapnel'
          ) {
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
          const owner = this.tanks.get(mine.ownerId);
          for (const tank of this.tanks.values()) {
            if (!tank.alive) continue;
            if (owner && this.isAlly(owner, tank)) continue;
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

  private tickHazards(dt: number, events: SimEvent[]): void {
    const keep: SimHazard[] = [];
    for (const h of this.hazards) {
      h.timer -= dt;
      if (h.timer > 0) {
        keep.push(h);
        continue;
      }
      const owner = this.tanks.get(h.ownerId);
      for (const tank of this.tanks.values()) {
        if (!tank.alive) continue;
        if (owner && this.isAlly(owner, tank)) continue;
        if (!circlesOverlap(h.x, h.y, h.radius, tank.x, tank.y, GAME.tankRadius)) continue;
        if (tank.shieldTime > 0) continue;
        tank.alive = false;
        events.push({ type: 'hit', bulletId: -1, tankId: tank.id });
      }
    }
    this.hazards = keep;
  }

  private checkRoundEnd(events: SimEvent[]): void {
    if (this.phase !== 'playing') return;
    const living = [...this.tanks.values()].filter((t) => t.alive);

    if (this.match.teamMode) {
      const teams = new Set(living.map((t) => t.team));
      if (teams.size > 1) return;
      const winnerTeam = living[0]?.team ?? null;
      const winnerId = living[0]?.id ?? null;
      this.roundWinnerId = winnerId;
      this.phase = 'intermission';
      this.intermissionLeft = GAME.intermissionSec;
      this.bullets = [];
      this.pickups = [];
      this.hazards = [];
      events.push({ type: 'roundEnd', winnerId, winnerTeam });

      if (winnerTeam !== null) {
        const next = (this.teamScores.get(winnerTeam) ?? 0) + 1;
        this.teamScores.set(winnerTeam, next);
        for (const t of this.tanks.values()) {
          if (t.team === winnerTeam) {
            const s = (this.scores.get(t.id) ?? 0) + 1;
            this.scores.set(t.id, s);
            events.push({ type: 'score', tankId: t.id, score: s });
          }
        }
        if (next >= this.match.scoreToWin) {
          this.phase = 'matchEnd';
          this.matchWinnerTeam = winnerTeam;
          this.matchWinnerId = winnerId;
          events.push({ type: 'matchEnd', winnerId, winnerTeam });
        }
      }
      return;
    }

    if (living.length > 1) return;

    const winnerId = living[0]?.id ?? null;
    this.roundWinnerId = winnerId;
    this.phase = 'intermission';
    this.intermissionLeft = GAME.intermissionSec;
    this.bullets = [];
    this.pickups = [];
    this.hazards = [];
    events.push({ type: 'roundEnd', winnerId });

    if (winnerId) {
      const next = (this.scores.get(winnerId) ?? 0) + 1;
      this.scores.set(winnerId, next);
      events.push({ type: 'score', tankId: winnerId, score: next });
      if (next >= this.match.scoreToWin) {
        this.phase = 'matchEnd';
        this.matchWinnerId = winnerId;
        events.push({ type: 'matchEnd', winnerId });
      }
    }
  }
}
