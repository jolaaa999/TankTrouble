import { describe, expect, it } from 'vitest';
import { GAME } from '../config.js';
import { bounceBulletOffWall } from './collide.js';
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
});

describe('GameSim', () => {
  it('kills a tank when a bullet hits', () => {
    const sim = new GameSim(123, ['a', 'b']);
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
});
