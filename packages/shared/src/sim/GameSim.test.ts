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
