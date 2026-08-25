import { describe, expect, it } from 'vitest';
import { GAME } from '../config.js';
import { bounceBulletOffWall, sweepCircleWalls } from './collide.js';
import { clearanceAlong, computeBotInput } from './BotAI.js';
import { GameSim } from './GameSim.js';

describe('collide bounce', () => {
  it('flips vx on vertical wall', () => {
    const r = bounceBulletOffWall(10, 3, {
      x1: 0,
      y1: 0,
      x2: 0,
      y2: 100,
      kind: 'v',
    });
    expect(r.vx).toBe(-10);
    expect(r.vy).toBe(3);
  });

  it('flips vy on horizontal wall', () => {
    const r = bounceBulletOffWall(10, 3, {
      x1: 0,
      y1: 0,
      x2: 100,
      y2: 0,
      kind: 'h',
    });
    expect(r.vx).toBe(10);
    expect(r.vy).toBe(-3);
  });

  it('detects tunneling through a vertical wall in one step', () => {
    const wall = { x1: 100, y1: 0, x2: 100, y2: 200, kind: 'v' as const };
    const hit = sweepCircleWalls(80, 100, 130, 100, 5, [wall]);
    expect(hit).not.toBeNull();
    expect(hit!.t).toBeGreaterThan(0);
    expect(hit!.t).toBeLessThanOrEqual(1);
    expect(hit!.wall).toBe(wall);
  });

  it('does not report a hit when moving away from a wall', () => {
    const wall = { x1: 100, y1: 0, x2: 100, y2: 200, kind: 'v' as const };
    const hit = sweepCircleWalls(120, 100, 160, 100, 5, [wall]);
    expect(hit).toBeNull();
  });
});

describe('GameSim muzzle', () => {
  it('does not spawn bullets on the far side of a wall when muzzle clips through', () => {
    const sim = new GameSim(3, ['a', 'b'], { fillBots: false });
    const anySim = sim as unknown as {
      tanks: Map<string, { x: number; y: number; angle: number; alive: boolean }>;
      maze: { walls: { x1: number; y1: number; x2: number; y2: number; kind: 'h' | 'v' }[] };
      spawnBullet: (
        tank: unknown,
        kind: string,
        speed: number,
        radius: number,
        life: number,
      ) => void;
      bullets: { x: number; y: number }[];
    };
    // Vertical wall at x=200; tank on the right, facing left so barrel aims through wall
    anySim.maze.walls = [{ x1: 200, y1: 0, x2: 200, y2: 400, kind: 'v' }];
    const tank = anySim.tanks.get('a')!;
    tank.x = 200 + GAME.tankRadius + 1;
    tank.y = 200;
    tank.angle = Math.PI; // face left through wall
    anySim.spawnBullet(tank, 'normal', GAME.bulletSpeed, GAME.bulletRadius, 8);
    const b = anySim.bullets[anySim.bullets.length - 1]!;
    // Must remain on the tank's side (x > wall)
    expect(b.x).toBeGreaterThan(200);
  });
});

describe('BotAI wall avoidance', () => {
  it('does not drive forward into a wall directly ahead', () => {
    const wall = { x1: 200, y1: 0, x2: 200, y2: 400, kind: 'v' as const };
    const self = {
      id: 'bot-0',
      x: 200 - GAME.tankRadius - 8,
      y: 200,
      angle: 0, // facing the wall
      alive: true,
      colorIndex: 0,
      team: 0,
      fireCooldown: 0,
      weapon: 'default' as const,
      ammo: Infinity,
      shieldTime: 0,
      turboTime: 0,
      freezeTime: 0,
      prevFire: false,
      showLaserSight: false,
      isBot: true,
    };
    const input = computeBotInput(self, [], [], 1.5, [wall]);
    expect(input.forward).toBe(false);
    expect(clearanceAlong(self.x, self.y, self.angle, [wall], 100)).toBeLessThan(40);
  });
});

describe('GameSim', () => {
  it('kills a tank when a bullet hits', () => {
    const sim = new GameSim(123, ['a', 'b'], { fillBots: false });
    const anySim = sim as unknown as {
      tanks: Map<
        string,
        { x: number; y: number; angle: number; alive: boolean; shieldTime: number }
      >;
      bullets: {
        id: number;
        ownerId: string;
        x: number;
        y: number;
        vx: number;
        vy: number;
        bounces: number;
        kind: string;
        life: number;
        radius: number;
      }[];
    };
    const tankA = anySim.tanks.get('a')!;
    const tankB = anySim.tanks.get('b')!;
    tankA.x = 100;
    tankA.y = 100;
    tankB.x = 160;
    tankB.y = 100;
    tankB.shieldTime = 0;
    anySim.bullets.push({
      id: 99,
      ownerId: 'a',
      x: 130,
      y: 100,
      vx: GAME.bulletSpeed,
      vy: 0,
      bounces: 1,
      kind: 'normal',
      life: 10,
      radius: GAME.bulletRadius,
    });
    const events = sim.step(1 / GAME.tickHz);
    expect(events.some((e) => e.type === 'hit' && e.tankId === 'b')).toBe(true);
    expect(sim.getSnapshot().tanks.find((t) => t.id === 'b')!.alive).toBe(false);
  });

  it('awards score and enters intermission when one tank remains', () => {
    const sim = new GameSim(5, ['a', 'b'], { fillBots: false });
    const anySim = sim as unknown as {
      tanks: Map<string, { alive: boolean }>;
    };
    anySim.tanks.get('b')!.alive = false;
    const events = sim.step(1 / GAME.tickHz);
    expect(events.some((e) => e.type === 'roundEnd' && e.winnerId === 'a')).toBe(true);
    expect(events.some((e) => e.type === 'score' && e.tankId === 'a' && e.score === 1)).toBe(
      true,
    );
    expect(sim.getSnapshot().phase).toBe('intermission');
    expect(sim.getSnapshot().scores.a).toBe(1);
  });

  it('uses different seeds across rounds', () => {
    const sim = new GameSim(42, ['a', 'b'], { fillBots: false });
    const seed1 = sim.getSnapshot().seed;
    const anySim = sim as unknown as {
      tanks: Map<string, { alive: boolean }>;
      intermissionLeft: number;
      phase: string;
    };
    anySim.tanks.get('b')!.alive = false;
    sim.step(1 / GAME.tickHz);
    anySim.intermissionLeft = 0;
    sim.step(1 / GAME.tickHz);
    const seed2 = sim.getSnapshot().seed;
    expect(seed2).not.toBe(seed1);
    expect(sim.getSnapshot().phase).toBe('playing');
  });

  it('fills roster with bots up to maxPlayers', () => {
    const sim = new GameSim(7, ['a'], { fillBots: true });
    const tanks = sim.getSnapshot().tanks;
    expect(tanks).toHaveLength(GAME.maxPlayers);
    expect(tanks.filter((t) => t.isBot)).toHaveLength(GAME.maxPlayers - 1);
  });

  it('fires laser as an instant beam, not a bullet', () => {
    const sim = new GameSim(9, ['a', 'b'], { fillBots: false });
    const anySim = sim as unknown as {
      tanks: Map<
        string,
        {
          x: number;
          y: number;
          angle: number;
          alive: boolean;
          weapon: string;
          ammo: number;
          shieldTime: number;
          prevFire: boolean;
        }
      >;
      bullets: unknown[];
      beams: unknown[];
      inputs: Map<string, { fire: boolean; seq: number; forward: boolean; back: boolean; left: boolean; right: boolean }>;
    };
    const a = anySim.tanks.get('a')!;
    const b = anySim.tanks.get('b')!;
    a.x = 100;
    a.y = 100;
    a.angle = 0;
    a.weapon = 'laser';
    a.ammo = 1;
    a.prevFire = false;
    b.x = 180;
    b.y = 100;
    b.shieldTime = 0;
    anySim.inputs.set('a', {
      seq: 1,
      forward: false,
      back: false,
      left: false,
      right: false,
      fire: true,
    });
    const events = sim.step(1 / GAME.tickHz);
    expect(anySim.bullets).toHaveLength(0);
    expect(anySim.beams.length).toBeGreaterThan(0);
    expect(b.alive).toBe(false);
    expect(events.some((e) => e.type === 'hit' || e.type === 'roundEnd')).toBe(true);
  });

  it('mega team mode scores team wins and scales map', () => {
    const sim = new GameSim(11, ['a', 'b', 'c', 'd'], {
      fillBots: false,
      match: {
        mode: 'mega',
        maxPlayers: 4,
        scoreToWin: 10,
        teamMode: true,
        scalingMaps: true,
        fillWithBots: false,
      },
    });
    expect(sim.getSnapshot().mazeCols).toBe(GAME.mazeCols);
    const anySim = sim as unknown as {
      tanks: Map<string, { alive: boolean; team: number }>;
      intermissionLeft: number;
    };
    for (const t of anySim.tanks.values()) {
      if (t.team === 1) t.alive = false;
    }
    sim.step(1 / GAME.tickHz);
    expect(sim.getSnapshot().teamScores[0]).toBe(1);
    anySim.intermissionLeft = 0;
    sim.step(1 / GAME.tickHz);
    expect(sim.getSnapshot().mazeCols).toBeGreaterThan(GAME.mazeCols);
  });
});
