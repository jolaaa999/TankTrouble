import {
  CLASSIC_MATCH,
  GAME,
  PICKUP_POOL,
  mazeSizeForRound,
  type MatchConfig,
  type SkillId,
  type WeaponKind,
} from '../config.js';
import { parsePickup, SKILLS } from '../skills.js';
import { generateMaze } from '../maze/generateMaze.js';
import { buildMazeFromLayout, type CustomMazeLayout } from '../maze/mazeLayout.js';
import { createRng } from '../maze/rng.js';
import { shuffleWithSeed } from '../maze/shuffle.js';
import type {
  InputMessage,
  MazeData,
  SimBeam,
  SimBullet,
  SimEvent,
  SimFx,
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
  placeBulletOutsideWall,
  resolveCircleWalls,
  sweepCircleWalls,
} from './collide.js';
import { computeBotInput, fillWithBots, isBotId } from './BotAI.js';
import { skillLabel } from '../skillLabels.js';

const emptyInput = (): InputMessage => ({
  seq: 0,
  forward: false,
  back: false,
  left: false,
  right: false,
  fire: false,
});

function weaponAmmo(kind: WeaponKind, plus: boolean): number {
  switch (kind) {
    case 'laser':
    case 'homing':
    case 'frag':
    case 'deathray':
    case 'freeze':
    case 'blink':
    case 'emp':
    case 'airstrike':
    case 'cannon':
    case 'nova':
    case 'rail':
    case 'invis':
    case 'dash':
    case 'knockback':
    case 'magnet':
    case 'pierce':
    case 'quad':
    case 'umbrella':
    case 'vortex':
    case 'xsplit':
    case 'yard':
      return 1;
    case 'shotgun':
      return plus ? Math.ceil(GAME.shotgunAmmo * GAME.plusCountMul) : GAME.shotgunAmmo;
    case 'gatling':
      return plus ? Math.ceil(GAME.gatlingAmmo * GAME.plusCountMul) : GAME.gatlingAmmo;
    case 'booby':
      return plus ? Math.ceil(GAME.mineCount * GAME.plusCountMul) : GAME.mineCount;
    case 'turbo':
      return 0;
    default:
      return Infinity;
  }
}

export type GameSimOptions = {
  fillBots?: boolean;
  match?: Partial<MatchConfig>;
  /** Fixed custom maze from the map editor (same layout every round). */
  customMaze?: CustomMazeLayout;
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
  private fx: SimFx[] = [];
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
  private nextFxId = 1;
  private phase: SimSnapshot['phase'] = 'playing';
  private roundWinnerId: string | null = null;
  private matchWinnerId: string | null = null;
  private matchWinnerTeam: number | null = null;
  private intermissionLeft = 0;
  private pickupTimer = 0;
  private roundIndex = 1;
  private rng: () => number;
  private elapsed = 0;
  private customMaze: CustomMazeLayout | null = null;

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
    if (opts?.customMaze) {
      this.customMaze = opts.customMaze;
      this.maze = buildMazeFromLayout(opts.customMaze, seed);
    } else {
      this.maze = generateMaze(seed, size.cols, size.rows);
    }
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
    this.tickFx(dt);
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
      fx: this.fx.map((f) => ({ ...f })),
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
        weaponPlus: false,
        ammo: Infinity,
        shieldTime: 0,
        turboTime: 0,
        turboPlus: false,
        freezeTime: 0,
        invisTime: 0,
        umbrellaTime: 0,
        umbrellaPlus: false,
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
      this.inputs.set(
        tank.id,
        computeBotInput(tank, foes, pickups, this.elapsed, this.maze.walls),
      );
    }
  }

  private beginNextRound(): void {
    const seed = (this.rng() * 1e9) | 0;
    this.rng = createRng(seed);
    this.roundIndex += 1;
    if (this.customMaze) {
      this.maze = buildMazeFromLayout(this.customMaze, seed);
    } else {
      const size = mazeSizeForRound(this.roundIndex, this.match.scalingMaps);
      this.maze = generateMaze(seed, size.cols, size.rows);
    }
    this.bullets = [];
    this.beams = [];
    this.pickups = [];
    this.mines = [];
    this.hazards = [];
    this.fx = [];
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

  private tickFx(dt: number): void {
    this.fx = this.fx
      .map((f) => ({ ...f, life: f.life - dt }))
      .filter((f) => f.life > 0)
      .slice(-48);
  }

  private addFx(
    kind: SimFx['kind'],
    x: number,
    y: number,
    radius: number,
    colorIndex: number,
    life = 0.35,
    label = '',
  ): void {
    this.fx.push({
      id: this.nextFxId++,
      kind,
      x,
      y,
      life,
      maxLife: life,
      radius,
      colorIndex,
      label,
    });
  }

  private announceSkill(tank: SimTank, skillKey: string, plus?: boolean): void {
    this.addFx(
      'announce',
      tank.x,
      tank.y - GAME.tankRadius,
      28,
      tank.colorIndex,
      0.9,
      skillLabel(skillKey, plus ?? tank.weaponPlus),
    );
  }

  private scaleRadius(tank: SimTank, value: number): number {
    return tank.weaponPlus ? value * GAME.plusRadiusMul : value;
  }

  private scaleDuration(tank: SimTank, value: number): number {
    return tank.weaponPlus ? value * GAME.plusDurationMul : value;
  }

  private scaleCount(tank: SimTank, value: number): number {
    return tank.weaponPlus ? Math.ceil(value * GAME.plusCountMul) : value;
  }

  private scaleDist(tank: SimTank, value: number): number {
    return tank.weaponPlus ? value * GAME.plusDistMul : value;
  }

  private scaleSpeed(tank: SimTank, value: number): number {
    return tank.weaponPlus ? value * GAME.plusSpeedMul : value;
  }

  private applyInstantSkill(tank: SimTank, skillId: SkillId, plus: boolean): void {
    if (skillId === 'shield') {
      tank.shieldTime = plus ? GAME.plusShieldDurationSec : GAME.shieldDurationSec;
      this.announceSkill(tank, skillId, plus);
      this.addFx('shield', tank.x, tank.y, GAME.tankRadius + 18, tank.colorIndex, 0.55);
    } else if (skillId === 'turbo') {
      tank.turboTime = plus ? GAME.plusTurboDurationSec : GAME.turboDurationSec;
      tank.turboPlus = plus;
      this.announceSkill(tank, skillId, plus);
      this.addFx('turbo', tank.x, tank.y, GAME.tankRadius + 14, tank.colorIndex, 0.5);
    }
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
      const parsed = parsePickup(hit.kind);
      if (!parsed) continue;
      const { skillId, plus } = parsed;
      events.push({ type: 'pickup', tankId: tank.id, kind: hit.kind });
      if (SKILLS[skillId].instant) {
        this.applyInstantSkill(tank, skillId, plus);
      } else {
        tank.weapon = skillId;
        tank.weaponPlus = plus;
        tank.ammo = weaponAmmo(skillId, plus);
        tank.prevFire = false;
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
      if (tank.turboTime <= 0) tank.turboPlus = false;
      tank.freezeTime = Math.max(0, tank.freezeTime - dt);
      tank.invisTime = Math.max(0, tank.invisTime - dt);
      tank.umbrellaTime = Math.max(0, tank.umbrellaTime - dt);
      if (tank.umbrellaTime <= 0) tank.umbrellaPlus = false;
      tank.showLaserSight = tank.weapon === 'laser' || tank.weapon === 'deathray';

      if (tank.freezeTime > 0) {
        tank.fireCooldown = Math.max(0, tank.fireCooldown - dt);
        continue;
      }

      const speedMul =
        tank.turboTime > 0
          ? tank.turboPlus
            ? GAME.plusTurboSpeedMul
            : GAME.turboSpeedMul
          : 1;
      const turnMul =
        tank.turboTime > 0
          ? tank.turboPlus
            ? GAME.plusTurboTurnMul
            : GAME.turboTurnMul
          : 1;

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
          // Extra margin so the drawn barrel cannot sit past a wall
          const resolved = resolveCircleWalls(
            tank.x,
            tank.y,
            GAME.tankRadius + 6,
            this.maze.walls,
          );
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
    tank.weaponPlus = false;
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
        this.announceSkill(tank, 'fragDetonate');
        this.addFx('boom', bomb.x, bomb.y, 40, tank.colorIndex, 0.45);
        this.detonateFrag(bomb);
        this.clearWeapon(tank);
        return;
      }
    }

    if (tank.weapon === 'booby') {
      if (!fireEdge || tank.ammo <= 0) return;
      this.announceSkill(tank, 'booby');
      const back = forwardFromAngle(tank.angle + Math.PI);
      const mx = tank.x + back.x * (GAME.tankRadius + 8);
      const my = tank.y + back.y * (GAME.tankRadius + 8);
      this.mines.push({
        id: this.nextMineId++,
        ownerId: tank.id,
        x: mx,
        y: my,
        armed: false,
        armTimer: GAME.mineArmDelaySec,
        triggered: false,
        triggerTimer: 0,
        visible: true,
      });
      this.addFx('booby', mx, my, 18, tank.colorIndex, 0.45);
      tank.ammo -= 1;
      if (tank.ammo <= 0) this.clearWeapon(tank);
      return;
    }

    if (tank.weapon === 'gatling') {
      if (!input.fire || tank.fireCooldown > 0 || tank.ammo <= 0) return;
      if (tank.ammo === GAME.gatlingAmmo) this.announceSkill(tank, 'gatling');
      this.spawnBullet(tank, 'pellet', GAME.gatlingBulletSpeed, 3.5, 1.2);
      this.addMuzzleFx(tank);
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
      this.addMuzzleFx(tank);
      tank.fireCooldown = GAME.fireCooldownSec;
      return;
    }

    if (tank.weapon === 'laser') {
      this.announceSkill(tank, 'laser');
      this.fireLaserBeam(tank, 'laser', this.scaleCount(tank, GAME.laserBounces), false);
      this.addMuzzleFx(tank);
      this.addFx('cast', tank.x, tank.y, 36, tank.colorIndex, 0.4);
      this.clearWeapon(tank);
      tank.fireCooldown = 0.25;
      return;
    }

    if (tank.weapon === 'deathray') {
      this.announceSkill(tank, 'deathray');
      this.fireLaserBeam(tank, 'deathray', this.scaleCount(tank, 10), true);
      this.addMuzzleFx(tank);
      this.addFx('cast', tank.x, tank.y, 48, tank.colorIndex, 0.5);
      this.clearWeapon(tank);
      tank.fireCooldown = 0.4;
      return;
    }

    if (tank.weapon === 'freeze') {
      this.announceSkill(tank, 'freeze');
      const radius = this.scaleRadius(tank, GAME.freezeRadius);
      const duration = this.scaleDuration(tank, GAME.freezeDurationSec);
      this.addFx('freeze', tank.x, tank.y, radius, tank.colorIndex, 0.55);
      for (const other of this.tanks.values()) {
        if (!other.alive || this.isAlly(tank, other)) continue;
        if (circlesOverlap(tank.x, tank.y, radius, other.x, other.y, GAME.tankRadius)) {
          other.freezeTime = Math.max(other.freezeTime, duration);
        }
      }
      this.clearWeapon(tank);
      tank.fireCooldown = 0.3;
      return;
    }

    if (tank.weapon === 'blink') {
      this.announceSkill(tank, 'blink');
      const fromX = tank.x;
      const fromY = tank.y;
      const f = forwardFromAngle(tank.angle);
      const step = 6;
      let x = tank.x;
      let y = tank.y;
      let traveled = 0;
      const maxDist = this.scaleDist(tank, GAME.blinkDistance);
      while (traveled < maxDist) {
        const nx = x + f.x * step;
        const ny = y + f.y * step;
        const resolved = resolveCircleWalls(nx, ny, GAME.tankRadius + 6, this.maze.walls);
        if (Math.hypot(resolved.x - nx, resolved.y - ny) > 0.5) break;
        x = resolved.x;
        y = resolved.y;
        traveled += step;
      }
      tank.x = x;
      tank.y = y;
      this.addFx('blink', fromX, fromY, 22, tank.colorIndex, 0.3);
      this.addFx('blink', x, y, 22, tank.colorIndex, 0.35);
      this.clearWeapon(tank);
      tank.fireCooldown = 0.2;
      return;
    }

    if (tank.weapon === 'emp') {
      this.announceSkill(tank, 'emp');
      const radius = this.scaleRadius(tank, GAME.empRadius);
      this.addFx('emp', tank.x, tank.y, radius, tank.colorIndex, 0.55);
      for (const other of this.tanks.values()) {
        if (!other.alive || this.isAlly(tank, other)) continue;
        if (!circlesOverlap(tank.x, tank.y, radius, other.x, other.y, GAME.tankRadius)) {
          continue;
        }
        other.weapon = 'default';
        other.weaponPlus = false;
        other.ammo = Infinity;
        other.turboTime = 0;
        other.turboPlus = false;
        other.freezeTime = Math.max(other.freezeTime, this.scaleDuration(tank, 0.6));
      }
      this.clearWeapon(tank);
      tank.fireCooldown = 0.3;
      return;
    }

    if (tank.weapon === 'airstrike') {
      this.announceSkill(tank, 'airstrike');
      const f = forwardFromAngle(tank.angle);
      const dist = this.scaleDist(tank, 160);
      const hx = tank.x + f.x * dist;
      const hy = tank.y + f.y * dist;
      const radius = this.scaleRadius(tank, GAME.airstrikeRadius);
      this.hazards.push({
        id: this.nextHazardId++,
        x: hx,
        y: hy,
        radius,
        timer: this.scaleDuration(tank, GAME.airstrikeDelaySec),
        ownerId: tank.id,
      });
      this.addFx('airstrike', hx, hy, radius, tank.colorIndex, 0.65);
      this.clearWeapon(tank);
      tank.fireCooldown = 0.35;
      return;
    }

    if (tank.weapon === 'shotgun') {
      this.announceSkill(tank, 'shotgun');
      const base = tank.angle;
      const n = this.scaleCount(tank, GAME.shotgunPellets);
      const spread = tank.weaponPlus ? GAME.shotgunSpread * 1.25 : GAME.shotgunSpread;
      for (let i = 0; i < n; i++) {
        const t = n > 1 ? i / (n - 1) : 0.5;
        const ang = base - spread / 2 + t * spread;
        const f = forwardFromAngle(ang);
        const face = tank.angle;
        tank.angle = ang;
        const p = this.safeForwardPoint(tank, GAME.tankRadius + 6, 3.5);
        tank.angle = face;
        this.bullets.push({
          id: this.nextBulletId++,
          ownerId: tank.id,
          x: p.x,
          y: p.y,
          vx: f.x * this.scaleSpeed(tank, GAME.bulletSpeed * 1.15),
          vy: f.y * this.scaleSpeed(tank, GAME.bulletSpeed * 1.15),
          bounces: 0,
          kind: 'pellet',
          life: 1.1,
          radius: 3.5,
        });
      }
      tank.ammo -= 1;
      tank.fireCooldown = 0.45;
      if (tank.ammo <= 0) this.clearWeapon(tank);
      this.addMuzzleFx(tank);
      this.addFx('burst', tank.x, tank.y, 42, tank.colorIndex, 0.35);
      return;
    }

    if (tank.weapon === 'homing') {
      this.announceSkill(tank, 'homing');
      this.spawnBullet(tank, 'homing', GAME.homingSpeed, 6, 4);
      this.bullets[this.bullets.length - 1]!.life = 5;
      this.addMuzzleFx(tank);
      this.addFx('cast', tank.x, tank.y, 30, tank.colorIndex, 0.35);
      this.clearWeapon(tank);
      tank.fireCooldown = 0.3;
      return;
    }

    if (tank.weapon === 'frag') {
      this.announceSkill(tank, 'frag');
      this.spawnBullet(tank, 'frag', GAME.bulletSpeed * 0.75, 7, 6);
      this.bullets[this.bullets.length - 1]!.life = 4;
      this.addMuzzleFx(tank);
      tank.ammo = 0;
      tank.fireCooldown = 0.2;
      return;
    }

    if (tank.weapon === 'cannon') {
      this.announceSkill(tank, 'cannon');
      const radius = tank.weaponPlus ? GAME.cannonRadius * 1.25 : GAME.cannonRadius;
      this.spawnBullet(tank, 'normal', this.scaleSpeed(tank, GAME.cannonSpeed), radius, GAME.cannonLife);
      this.bullets[this.bullets.length - 1]!.life = 8;
      this.addMuzzleFx(tank);
      this.addFx('cast', tank.x, tank.y, 34, tank.colorIndex, 0.35);
      this.clearWeapon(tank);
      tank.fireCooldown = 0.4;
      return;
    }

    if (tank.weapon === 'nova') {
      this.announceSkill(tank, 'nova');
      this.addFx('burst', tank.x, tank.y, 52, tank.colorIndex, 0.45);
      this.spawnTriangleShrapnel(
        tank.id,
        tank.x,
        tank.y,
        this.scaleCount(tank, GAME.novaShrapnel),
        tank.weaponPlus ? 1.15 : 1.05,
      );
      this.clearWeapon(tank);
      tank.fireCooldown = 0.35;
      return;
    }

    if (tank.weapon === 'rail') {
      this.announceSkill(tank, 'rail');
      this.spawnBullet(tank, 'normal', this.scaleSpeed(tank, GAME.railSpeed), 4, 3);
      this.bullets[this.bullets.length - 1]!.life = this.scaleDuration(tank, GAME.railLife);
      this.addMuzzleFx(tank);
      this.addFx('cast', tank.x, tank.y, 28, tank.colorIndex, 0.3);
      this.clearWeapon(tank);
      tank.fireCooldown = 0.3;
      return;
    }

    if (tank.weapon === 'invis') {
      this.announceSkill(tank, 'invis');
      tank.invisTime = this.scaleDuration(tank, GAME.invisDurationSec);
      this.addFx('cast', tank.x, tank.y, 36, tank.colorIndex, 0.45);
      this.clearWeapon(tank);
      tank.fireCooldown = 0.25;
      return;
    }

    if (tank.weapon === 'dash') {
      this.announceSkill(tank, 'dash');
      const fromX = tank.x;
      const fromY = tank.y;
      const f = forwardFromAngle(tank.angle);
      const step = 6;
      let x = tank.x;
      let y = tank.y;
      let traveled = 0;
      const maxDist = this.scaleDist(tank, GAME.dashDistance);
      while (traveled < maxDist) {
        const nx = x + f.x * step;
        const ny = y + f.y * step;
        const resolved = resolveCircleWalls(nx, ny, GAME.tankRadius + 6, this.maze.walls);
        if (Math.hypot(resolved.x - nx, resolved.y - ny) > 0.5) break;
        x = resolved.x;
        y = resolved.y;
        traveled += step;
      }
      tank.x = x;
      tank.y = y;
      this.addFx('blink', fromX, fromY, 18, tank.colorIndex, 0.28);
      this.addFx('blink', x, y, 18, tank.colorIndex, 0.32);
      this.clearWeapon(tank);
      tank.fireCooldown = 0.15;
      return;
    }

    if (tank.weapon === 'knockback') {
      this.announceSkill(tank, 'knockback');
      const radius = this.scaleRadius(tank, GAME.knockbackRadius);
      const force = this.scaleDist(tank, GAME.knockbackForce);
      this.addFx('emp', tank.x, tank.y, radius, tank.colorIndex, 0.4);
      for (const other of this.tanks.values()) {
        if (!other.alive || this.isAlly(tank, other)) continue;
        if (!circlesOverlap(tank.x, tank.y, radius, other.x, other.y, GAME.tankRadius)) continue;
        const dx = other.x - tank.x;
        const dy = other.y - tank.y;
        const d = Math.hypot(dx, dy) || 1;
        const resolved = resolveCircleWalls(
          other.x + (dx / d) * force,
          other.y + (dy / d) * force,
          GAME.tankRadius + 6,
          this.maze.walls,
        );
        other.x = resolved.x;
        other.y = resolved.y;
      }
      this.clearWeapon(tank);
      tank.fireCooldown = 0.3;
      return;
    }

    if (tank.weapon === 'magnet') {
      this.announceSkill(tank, 'magnet');
      const radius = this.scaleRadius(tank, GAME.magnetRadius);
      const pull = this.scaleDist(tank, GAME.magnetPull);
      this.addFx('freeze', tank.x, tank.y, radius, tank.colorIndex, 0.4);
      for (const other of this.tanks.values()) {
        if (!other.alive || this.isAlly(tank, other)) continue;
        if (!circlesOverlap(tank.x, tank.y, radius, other.x, other.y, GAME.tankRadius)) continue;
        const dx = tank.x - other.x;
        const dy = tank.y - other.y;
        const d = Math.hypot(dx, dy) || 1;
        const resolved = resolveCircleWalls(
          other.x + (dx / d) * pull,
          other.y + (dy / d) * pull,
          GAME.tankRadius + 6,
          this.maze.walls,
        );
        other.x = resolved.x;
        other.y = resolved.y;
      }
      this.clearWeapon(tank);
      tank.fireCooldown = 0.3;
      return;
    }

    if (tank.weapon === 'pierce') {
      this.announceSkill(tank, 'pierce');
      const hitsLeft = tank.weaponPlus ? GAME.pierceHitsPlus : GAME.pierceHits;
      const f = forwardFromAngle(tank.angle);
      const radius = 5;
      const p = this.safeForwardPoint(tank, GAME.tankRadius + radius + 2, radius);
      this.bullets.push({
        id: this.nextBulletId++,
        ownerId: tank.id,
        x: p.x,
        y: p.y,
        vx: f.x * this.scaleSpeed(tank, GAME.bulletSpeed * 1.2),
        vy: f.y * this.scaleSpeed(tank, GAME.bulletSpeed * 1.2),
        bounces: 0,
        kind: 'pierce',
        life: 6,
        radius,
        hitsLeft,
      });
      this.addMuzzleFx(tank);
      this.addFx('cast', tank.x, tank.y, 30, tank.colorIndex, 0.35);
      this.clearWeapon(tank);
      tank.fireCooldown = 0.3;
      return;
    }

    if (tank.weapon === 'quad') {
      this.announceSkill(tank, 'quad');
      const base = tank.angle;
      const spread = tank.weaponPlus ? GAME.quadSpread * 1.2 : GAME.quadSpread;
      for (let i = 0; i < 4; i++) {
        const ang = base - spread * 1.5 + i * spread;
        const f = forwardFromAngle(ang);
        const face = tank.angle;
        tank.angle = ang;
        const p = this.safeForwardPoint(tank, GAME.tankRadius + 6, GAME.bulletRadius);
        tank.angle = face;
        this.bullets.push({
          id: this.nextBulletId++,
          ownerId: tank.id,
          x: p.x,
          y: p.y,
          vx: f.x * this.scaleSpeed(tank, GAME.bulletSpeed),
          vy: f.y * this.scaleSpeed(tank, GAME.bulletSpeed),
          bounces: 0,
          kind: 'normal',
          life: 8,
          radius: GAME.bulletRadius,
        });
      }
      this.addMuzzleFx(tank);
      this.addFx('burst', tank.x, tank.y, 38, tank.colorIndex, 0.35);
      this.clearWeapon(tank);
      tank.fireCooldown = 0.35;
      return;
    }

    if (tank.weapon === 'umbrella') {
      this.announceSkill(tank, 'umbrella');
      tank.umbrellaPlus = tank.weaponPlus;
      tank.umbrellaTime = this.scaleDuration(tank, GAME.umbrellaDurationSec);
      this.addFx('shield', tank.x, tank.y, GAME.tankRadius + 16, tank.colorIndex, 0.5);
      this.clearWeapon(tank);
      tank.fireCooldown = 0.25;
      return;
    }

    if (tank.weapon === 'vortex') {
      this.announceSkill(tank, 'vortex');
      const radius = this.scaleRadius(tank, GAME.vortexRadius);
      const duration = this.scaleDuration(tank, GAME.vortexFreezeSec);
      this.addFx('freeze', tank.x, tank.y, radius, tank.colorIndex, 0.5);
      for (const other of this.tanks.values()) {
        if (!other.alive || this.isAlly(tank, other)) continue;
        if (circlesOverlap(tank.x, tank.y, radius, other.x, other.y, GAME.tankRadius)) {
          const dx = tank.x - other.x;
          const dy = tank.y - other.y;
          const d = Math.hypot(dx, dy) || 1;
          const pull = this.scaleDist(tank, 36);
          const resolved = resolveCircleWalls(
            other.x + (dx / d) * pull,
            other.y + (dy / d) * pull,
            GAME.tankRadius + 6,
            this.maze.walls,
          );
          other.x = resolved.x;
          other.y = resolved.y;
          other.freezeTime = Math.max(other.freezeTime, duration);
        }
      }
      this.clearWeapon(tank);
      tank.fireCooldown = 0.3;
      return;
    }

    if (tank.weapon === 'xsplit') {
      this.announceSkill(tank, 'xsplit');
      const f = forwardFromAngle(tank.angle);
      const radius = 5;
      const p = this.safeForwardPoint(tank, GAME.tankRadius + radius + 2, radius);
      this.bullets.push({
        id: this.nextBulletId++,
        ownerId: tank.id,
        x: p.x,
        y: p.y,
        vx: f.x * this.scaleSpeed(tank, GAME.bulletSpeed),
        vy: f.y * this.scaleSpeed(tank, GAME.bulletSpeed),
        bounces: 0,
        kind: 'xsplit',
        life: 10,
        radius,
        splitCount: tank.weaponPlus ? 5 : 3,
      });
      this.addMuzzleFx(tank);
      this.clearWeapon(tank);
      tank.fireCooldown = 0.3;
      return;
    }

    if (tank.weapon === 'yard') {
      this.announceSkill(tank, 'yard');
      const count = this.scaleCount(tank, GAME.yardMineCount);
      for (let i = 0; i < count; i++) {
        const t = count > 1 ? i / (count - 1) - 0.5 : 0;
        const ang = tank.angle + Math.PI + t * 0.9;
        const f = forwardFromAngle(ang);
        const mx = tank.x + f.x * (GAME.tankRadius + 10);
        const my = tank.y + f.y * (GAME.tankRadius + 10);
        this.mines.push({
          id: this.nextMineId++,
          ownerId: tank.id,
          x: mx,
          y: my,
          armed: false,
          armTimer: GAME.mineArmDelaySec,
          triggered: false,
          triggerTimer: 0,
          visible: true,
        });
      }
      this.addFx('booby', tank.x, tank.y, 24, tank.colorIndex, 0.45);
      this.clearWeapon(tank);
      tank.fireCooldown = 0.35;
    }
  }

  private addMuzzleFx(tank: SimTank): void {
    const p = this.safeForwardPoint(tank, GAME.tankRadius + 10, 4);
    this.addFx('muzzle', p.x, p.y, 10, tank.colorIndex, 0.18);
  }

  /**
   * Place a point along the tank's facing direction without crossing walls.
   * Fixes muzzle-through-wall: bullets must spawn on the same side as the hull.
   */
  private safeForwardPoint(
    tank: SimTank,
    reach: number,
    radius: number,
  ): { x: number; y: number } {
    const f = forwardFromAngle(tank.angle);
    const hitR = radius + GAME.wallThickness * 0.5;
    const x0 = tank.x;
    const y0 = tank.y;
    const x1 = tank.x + f.x * reach;
    const y1 = tank.y + f.y * reach;
    const hit = sweepCircleWalls(x0, y0, x1, y1, hitR, this.maze.walls);
    if (!hit) {
      const resolved = resolveCircleWalls(x1, y1, hitR, this.maze.walls);
      return { x: resolved.x, y: resolved.y };
    }
    return placeBulletOutsideWall(hit.wall, hit.x, hit.y, hitR, tank.x, tank.y);
  }

  private spawnBullet(
    tank: SimTank,
    kind: SimBullet['kind'],
    speed: number,
    radius: number,
    maxLifeBounces: number,
  ): void {
    const f = forwardFromAngle(tank.angle);
    const reach = GAME.tankRadius + radius + 2;
    const p = this.safeForwardPoint(tank, reach, radius);
    this.bullets.push({
      id: this.nextBulletId++,
      ownerId: tank.id,
      x: p.x,
      y: p.y,
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
    const muzzle = this.safeForwardPoint(tank, GAME.tankRadius + 4, 3);
    let x = muzzle.x;
    let y = muzzle.y;
    let vx = f.x;
    let vy = f.y;
    const step = 5;
    let bounces = 0;
    let segX = x;
    let segY = y;
    let pushed = 0;

    const pushSeg = (x2: number, y2: number, force = false) => {
      if (!force && Math.hypot(x2 - segX, y2 - segY) < 2) return;
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
      pushed += 1;
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
          pushSeg(x, y, true);
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
        if (other.invisTime > 0) continue;
        if (!circlesOverlap(x, y, 5, other.x, other.y, GAME.tankRadius)) continue;
        pushSeg(other.x, other.y, true);
        if (other.shieldTime > 0) return;
        other.alive = false;
        if (!pierce) return;
      }
    }

    pushSeg(x, y, true);
    if (pushed === 0) {
      const tip = this.safeForwardPoint(tank, GAME.tankRadius + 52, 3);
      this.beams.push({
        id: this.nextBeamId++,
        x1: muzzle.x,
        y1: muzzle.y,
        x2: tip.x,
        y2: tip.y,
        life: GAME.laserBeamLifeSec,
        kind,
      });
    }
  }

  private detonateFrag(bomb: SimBullet): void {
    this.bullets = this.bullets.filter((b) => b.id !== bomb.id);
    this.addFx('boom', bomb.x, bomb.y, 48, 0, 0.4);
    this.spawnTriangleShrapnel(bomb.ownerId, bomb.x, bomb.y, GAME.fragShrapnel);
  }

  /** Radial burst of small triangular shrapnel (mine / frag / nova). */
  private spawnTriangleShrapnel(
    ownerId: string,
    x: number,
    y: number,
    count: number,
    speedMul = 0.95,
  ): void {
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2 + (i % 2) * 0.07;
      const f = forwardFromAngle(ang);
      this.bullets.push({
        id: this.nextBulletId++,
        ownerId,
        x,
        y,
        vx: f.x * GAME.bulletSpeed * speedMul,
        vy: f.y * GAME.bulletSpeed * speedMul,
        bounces: 0,
        kind: 'shrapnel',
        life: 1.05,
        radius: 3.5,
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

      const speed = Math.hypot(bullet.vx, bullet.vy);
      const hitR = bullet.radius + GAME.wallThickness * 0.5;
      // More substeps for fast bullets; always use swept tests against walls
      const steps = Math.max(2, Math.ceil((speed * dt) / Math.max(2, hitR * 0.75)));
      const sdt = dt / steps;
      for (let i = 0; i < steps && alive; i++) {
        let travel = sdt;
        let guard = 0;
        while (travel > 1e-6 && guard++ < 6 && alive) {
          const x0 = bullet.x;
          const y0 = bullet.y;
          const x1 = x0 + bullet.vx * travel;
          const y1 = y0 + bullet.vy * travel;
          const hit = sweepCircleWalls(x0, y0, x1, y1, hitR, this.maze.walls);
          if (!hit) {
            bullet.x = x1;
            bullet.y = y1;
            break;
          }
          const placed = placeBulletOutsideWall(hit.wall, hit.x, hit.y, hitR, x0, y0);
          bullet.x = placed.x;
          bullet.y = placed.y;
          const bounced = bounceBulletOffWall(bullet.vx, bullet.vy, hit.wall);
          bullet.vx = bounced.vx;
          bullet.vy = bounced.vy;
          bullet.bounces += 1;
          events.push({ type: 'bounce', bulletId: bullet.id });
          if (bullet.kind === 'xsplit' && bullet.bounces === 1) {
            const count = bullet.splitCount ?? 3;
            const baseAng = Math.atan2(bullet.vy, bullet.vx);
            for (let j = 0; j < count; j++) {
              const ang =
                count > 1 ? baseAng - 0.35 + (j / (count - 1)) * 0.7 : baseAng;
              const f = forwardFromAngle(ang);
              this.bullets.push({
                id: this.nextBulletId++,
                ownerId: bullet.ownerId,
                x: bullet.x,
                y: bullet.y,
                vx: f.x * GAME.bulletSpeed * 0.95,
                vy: f.y * GAME.bulletSpeed * 0.95,
                bounces: 0,
                kind: 'shrapnel',
                life: 1.2,
                radius: 3.5,
              });
            }
            alive = false;
            break;
          }
          if (bullet.bounces > GAME.maxBulletBounces) {
            alive = false;
            break;
          }
          travel *= Math.max(0, 1 - hit.t);
        }
        if (!alive) break;

        const owner = this.tanks.get(bullet.ownerId);
        for (const tank of this.tanks.values()) {
          if (!tank.alive) continue;
          // Classic Tank Trouble: own shots are safe until they bounce once
          if (tank.id === bullet.ownerId) {
            if (bullet.bounces === 0 && bullet.kind !== 'shrapnel') continue;
          } else if (
            owner &&
            this.match.teamMode &&
            owner.team === tank.team &&
            bullet.kind !== 'shrapnel'
          ) {
            // Teammates (not self) stay friendly in mega mode
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
          if (tank.invisTime > 0 && tank.id !== bullet.ownerId) {
            continue;
          }
          if (tank.umbrellaTime > 0 && tank.id !== bullet.ownerId) {
            const toBullet = Math.atan2(bullet.y - tank.y, bullet.x - tank.x);
            let diff = toBullet - tank.angle;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            const arc = tank.umbrellaPlus ? GAME.umbrellaArcRad * 1.15 : GAME.umbrellaArcRad;
            if (Math.abs(diff) < arc / 2) {
              bullet.vx *= -1;
              bullet.vy *= -1;
              bullet.bounces += 1;
              break;
            }
          }
          if (tank.shieldTime > 0) {
            bullet.vx *= -1;
            bullet.vy *= -1;
            bullet.bounces += 1;
            break;
          }
          if (bullet.kind === 'pierce') {
            tank.alive = false;
            events.push({ type: 'hit', bulletId: bullet.id, tankId: tank.id });
            const left = (bullet.hitsLeft ?? 1) - 1;
            if (left > 0) {
              bullet.hitsLeft = left;
            } else {
              alive = false;
            }
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
          // Stay faintly marked so placement isn't "invisible"
          mine.visible = true;
        }
        keep.push(mine);
        continue;
      }

      if (mine.triggered) {
        mine.triggerTimer -= dt;
        if (mine.triggerTimer <= 0) {
          const owner = this.tanks.get(mine.ownerId);
          this.addFx('boom', mine.x, mine.y, GAME.mineBlastRadius, owner?.colorIndex ?? 0, 0.4);
          // Owner can be killed by own mine; only other teammates are safe
          for (const tank of this.tanks.values()) {
            if (!tank.alive) continue;
            if (
              owner &&
              tank.id !== owner.id &&
              this.isAlly(owner, tank)
            ) {
              continue;
            }
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
          this.spawnTriangleShrapnel(mine.ownerId, mine.x, mine.y, GAME.mineShrapnel);
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
      this.addFx('boom', h.x, h.y, h.radius, owner?.colorIndex ?? 0, 0.5);
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
