import { describe, expect, it } from 'vitest';
import { generateMaze } from './generateMaze.js';

describe('generateMaze', () => {
  it('is deterministic for the same seed', () => {
    const a = generateMaze(42);
    const b = generateMaze(42);
    expect(a.hWalls).toEqual(b.hWalls);
    expect(a.vWalls).toEqual(b.vWalls);
    expect(a.spawns).toEqual(b.spawns);
  });

  it('usually differs across seeds', () => {
    const a = generateMaze(1);
    const b = generateMaze(999);
    expect(JSON.stringify(a.hWalls) === JSON.stringify(b.hWalls)).toBe(false);
  });

  it('provides four spawns and outer walls', () => {
    const m = generateMaze(7);
    expect(m.spawns.length).toBeGreaterThanOrEqual(4);
    expect(m.walls.length).toBeGreaterThan(4);
  });
});
