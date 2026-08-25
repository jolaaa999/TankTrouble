import { describe, expect, it } from 'vitest';
import { Vec2 } from './Vec2.js';

describe('Vec2', () => {
  it('adds and subtracts', () => {
    const a = new Vec2(1, 2);
    const b = new Vec2(3, 4);
    expect(a.add(b)).toEqual(new Vec2(4, 6));
    expect(b.sub(a)).toEqual(new Vec2(2, 2));
  });

  it('scales and dots', () => {
    const a = new Vec2(2, 3);
    expect(a.scale(2)).toEqual(new Vec2(4, 6));
    expect(a.dot(new Vec2(4, 5))).toBe(23);
  });

  it('computes length and normalize', () => {
    const a = new Vec2(3, 4);
    expect(a.len()).toBe(5);
    const n = a.normalize();
    expect(n.x).toBeCloseTo(0.6);
    expect(n.y).toBeCloseTo(0.8);
    expect(new Vec2(0, 0).normalize()).toEqual(new Vec2(0, 0));
  });
});
