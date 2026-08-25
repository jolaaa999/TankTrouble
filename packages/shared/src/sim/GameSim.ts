import { GAME } from '../config.js';
import { generateMaze } from '../maze/generateMaze.js';
import type {
  InputMessage,
  MazeData,
  SimBullet,
  SimEvent,
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

export class GameSim {
  readonly maze: MazeData;
  private tanks = new Map<string, SimTank>();
  private bullets: SimBullet[] = [];
  private inputs = new Map<string, InputMessage>();
  private nextBulletId = 1;
  private phase: SimSnapshot['phase'] = 'playing';
  private winnerId: string | null = null;

  constructor(seed: number, playerIds: string[]) {
    this.maze = generateMaze(seed);
    playerIds.forEach((id, index) => {
      const spawn = this.maze.spawns[index % this.maze.spawns.length];
      const tank: SimTank = {
        id,
        x: spawn.x,
        y: spawn.y,
        angle: index % 2 === 0 ? 0 : Math.PI,
        alive: true,
        colorIndex: index % GAME.playerColors.length,
        fireCooldown: 0,
      };
      this.tanks.set(id, tank);
      this.inputs.set(id, emptyInput());
    });
  }

  applyInput(playerId: string, input: InputMessage): void {
    if (!this.tanks.has(playerId)) return;
    this.inputs.set(playerId, { ...input });
  }

  step(dt: number): SimEvent[] {
    const events: SimEvent[] = [];
    if (this.phase !== 'playing') return events;

    for (const tank of this.tanks.values()) {
      if (!tank.alive) continue;
      const input = this.inputs.get(tank.id) ?? emptyInput();
      if (input.left) tank.angle -= GAME.tankTurnSpeed * dt;
      if (input.right) tank.angle += GAME.tankTurnSpeed * dt;

      let move = 0;
      if (input.forward) move += 1;
      if (input.back) move -= 1;
      if (move !== 0) {
        const f = forwardFromAngle(tank.angle);
        tank.x += f.x * GAME.tankSpeed * move * dt;
        tank.y += f.y * GAME.tankSpeed * move * dt;
        const resolved = resolveCircleWalls(
          tank.x,
          tank.y,
          GAME.tankRadius,
          this.maze.walls,
        );
        tank.x = resolved.x;
        tank.y = resolved.y;
      }

      tank.fireCooldown = Math.max(0, tank.fireCooldown - dt);
      if (input.fire && tank.fireCooldown <= 0) {
        const owned = this.bullets.filter((b) => b.ownerId === tank.id).length;
        if (owned < GAME.maxBulletsPerTank) {
          const f = forwardFromAngle(tank.angle);
          const muzzle = GAME.tankRadius + GAME.bulletRadius + 2;
          this.bullets.push({
            id: this.nextBulletId++,
            ownerId: tank.id,
            x: tank.x + f.x * muzzle,
            y: tank.y + f.y * muzzle,
            vx: f.x * GAME.bulletSpeed,
            vy: f.y * GAME.bulletSpeed,
            bounces: 0,
          });
          tank.fireCooldown = GAME.fireCooldownSec;
        }
      }
    }

    const survivors: SimBullet[] = [];
    for (const bullet of this.bullets) {
      let alive = true;
      const steps = 4;
      const sdt = dt / steps;
      for (let i = 0; i < steps && alive; i++) {
        bullet.x += bullet.vx * sdt;
        bullet.y += bullet.vy * sdt;

        for (const wall of this.maze.walls) {
          const hit = circleHitsSegment(
            bullet.x,
            bullet.y,
            GAME.bulletRadius,
            wall,
          );
          if (!hit.hit) continue;
          // Push out then bounce
          bullet.x += hit.nx * hit.depth;
          bullet.y += hit.ny * hit.depth;
          const bounced = bounceBulletOffWall(bullet.vx, bullet.vy, wall);
          bullet.vx = bounced.vx;
          bullet.vy = bounced.vy;
          bullet.bounces += 1;
          events.push({ type: 'bounce', bulletId: bullet.id });
          if (bullet.bounces > GAME.maxBulletBounces) {
            alive = false;
          }
          break;
        }

        if (!alive) break;

        for (const tank of this.tanks.values()) {
          if (!tank.alive) continue;
          if (tank.id === bullet.ownerId && bullet.bounces === 0) continue;
          if (
            !circlesOverlap(
              bullet.x,
              bullet.y,
              GAME.bulletRadius,
              tank.x,
              tank.y,
              GAME.tankRadius,
            )
          ) {
            continue;
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

    const living = [...this.tanks.values()].filter((t) => t.alive);
    if (living.length <= 1) {
      this.phase = 'ended';
      this.winnerId = living[0]?.id ?? null;
      events.push({ type: 'roundEnd', winnerId: this.winnerId });
    }

    return events;
  }

  getSnapshot(): SimSnapshot {
    return {
      seed: this.maze.seed,
      tanks: [...this.tanks.values()].map((t) => ({ ...t })),
      bullets: this.bullets.map((b) => ({ ...b })),
      phase: this.phase,
      winnerId: this.winnerId,
    };
  }

  markDead(playerId: string): SimEvent[] {
    const tank = this.tanks.get(playerId);
    if (!tank || !tank.alive) return [];
    tank.alive = false;
    const events: SimEvent[] = [{ type: 'hit', bulletId: -1, tankId: playerId }];
    const living = [...this.tanks.values()].filter((t) => t.alive);
    if (living.length <= 1 && this.phase === 'playing') {
      this.phase = 'ended';
      this.winnerId = living[0]?.id ?? null;
      events.push({ type: 'roundEnd', winnerId: this.winnerId });
    }
    return events;
  }
}
