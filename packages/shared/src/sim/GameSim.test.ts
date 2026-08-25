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
  it('kills a tank when a bullet hits after leaving muzzle', () => {
    const sim = new GameSim(123, ['a', 'b']);
    const snap0 = sim.getSnapshot();
    const victim = snap0.tanks.find((t) => t.id === 'b')!;
    // Force a bullet onto victim by applying many forward+fire steps from a
    // handcrafted state via public API: move a close and shoot.
    // Place by stepping isn't easy — use reflection via apply + mutate through
    // repeated fires in open space after we sync positions via stepping near spawn.
    // Direct: fire from a toward b by aiming.
    void victim;
    const anySim = sim as unknown as {
      tanks: Map<
        string,
        { x: number; y: number; angle: number; alive: boolean; fireCooldown: number }
      >;
      bullets: {
        id: number;
        ownerId: string;
        x: number;
        y: number;
        vx: number;
        vy: number;
        bounces: number;
      }[];
    };
    const tankA = anySim.tanks.get('a')!;
    const tankB = anySim.tanks.get('b')!;
    tankA.x = 100;
    tankA.y = 100;
    tankA.angle = 0;
    tankB.x = 160;
    tankB.y = 100;
    anySim.bullets.push({
      id: 99,
      ownerId: 'a',
      x: 130,
      y: 100,
      vx: GAME.bulletSpeed,
      vy: 0,
      bounces: 1,
    });
    const events = sim.step(1 / GAME.tickHz);
    expect(events.some((e) => e.type === 'hit' && e.tankId === 'b')).toBe(true);
    expect(sim.getSnapshot().tanks.find((t) => t.id === 'b')!.alive).toBe(false);
  });

  it('ends round when one tank remains', () => {
    const sim = new GameSim(5, ['a', 'b']);
    const anySim = sim as unknown as {
      tanks: Map<string, { alive: boolean }>;
    };
    anySim.tanks.get('b')!.alive = false;
    const events = sim.step(1 / GAME.tickHz);
    expect(events.some((e) => e.type === 'roundEnd' && e.winnerId === 'a')).toBe(
      true,
    );
  });
});
