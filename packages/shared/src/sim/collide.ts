import type { WallSegment } from '../types.js';

export function circleHitsSegment(
  cx: number,
  cy: number,
  radius: number,
  wall: WallSegment,
): { hit: boolean; nx: number; ny: number; depth: number } {
  // Closest point on segment to circle center
  const dx = wall.x2 - wall.x1;
  const dy = wall.y2 - wall.y1;
  const lenSq = dx * dx + dy * dy;
  let t = 0;
  if (lenSq > 1e-8) {
    t = ((cx - wall.x1) * dx + (cy - wall.y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
  }
  const px = wall.x1 + t * dx;
  const py = wall.y1 + t * dy;
  const ox = cx - px;
  const oy = cy - py;
  const dist = Math.hypot(ox, oy);
  if (dist >= radius) {
    return { hit: false, nx: 0, ny: 0, depth: 0 };
  }
  if (dist < 1e-8) {
    if (wall.kind === 'h') return { hit: true, nx: 0, ny: cy <= py ? -1 : 1, depth: radius };
    return { hit: true, nx: cx <= px ? -1 : 1, ny: 0, depth: radius };
  }
  return {
    hit: true,
    nx: ox / dist,
    ny: oy / dist,
    depth: radius - dist,
  };
}

export function resolveCircleWalls(
  x: number,
  y: number,
  radius: number,
  walls: WallSegment[],
  iterations = 3,
): { x: number; y: number } {
  let cx = x;
  let cy = y;
  for (let i = 0; i < iterations; i++) {
    for (const wall of walls) {
      const hit = circleHitsSegment(cx, cy, radius, wall);
      if (!hit.hit) continue;
      cx += hit.nx * hit.depth;
      cy += hit.ny * hit.depth;
    }
  }
  return { x: cx, y: cy };
}

export function bounceBulletOffWall(
  vx: number,
  vy: number,
  wall: WallSegment,
): { vx: number; vy: number } {
  if (wall.kind === 'h') return { vx, vy: -vy };
  return { vx: -vx, vy };
}

export type SweepHit = {
  t: number;
  x: number;
  y: number;
  wall: WallSegment;
};

/**
 * Continuous collision against axis-aligned wall segments.
 * Stops bullets tunneling through walls when a single step jumps past the line.
 */
export function sweepCircleWalls(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  radius: number,
  walls: readonly WallSegment[],
): SweepHit | null {
  for (const wall of walls) {
    const hit = circleHitsSegment(x0, y0, radius, wall);
    if (hit.hit) {
      return {
        t: 0,
        x: x0 + hit.nx * hit.depth,
        y: y0 + hit.ny * hit.depth,
        wall,
      };
    }
  }

  const dx = x1 - x0;
  const dy = y1 - y0;
  let best: SweepHit | null = null;

  for (const wall of walls) {
    const cand = sweepAgainstWall(x0, y0, dx, dy, radius, wall);
    if (!cand) continue;
    if (!best || cand.t < best.t - 1e-9) best = cand;
  }
  return best;
}

function sweepAgainstWall(
  x0: number,
  y0: number,
  dx: number,
  dy: number,
  radius: number,
  wall: WallSegment,
): SweepHit | null {
  const eps = 1e-6;
  if (wall.kind === 'v') {
    const wx = wall.x1;
    const yMin = Math.min(wall.y1, wall.y2) - radius;
    const yMax = Math.max(wall.y1, wall.y2) + radius;
    if (Math.abs(dx) < eps) return null;
    let best: SweepHit | null = null;
    for (const plane of [wx - radius, wx + radius]) {
      const t = (plane - x0) / dx;
      if (t <= eps || t > 1) continue;
      const y = y0 + t * dy;
      if (y < yMin - eps || y > yMax + eps) continue;
      // Approaching this face only (from outside toward the wall)
      if (plane < wx && dx <= 0) continue;
      if (plane > wx && dx >= 0) continue;
      const x = x0 + t * dx;
      if (!best || t < best.t) best = { t, x, y, wall };
    }
    return best;
  }

  const wy = wall.y1;
  const xMin = Math.min(wall.x1, wall.x2) - radius;
  const xMax = Math.max(wall.x1, wall.x2) + radius;
  if (Math.abs(dy) < eps) return null;
  let best: SweepHit | null = null;
  for (const plane of [wy - radius, wy + radius]) {
    const t = (plane - y0) / dy;
    if (t <= eps || t > 1) continue;
    const x = x0 + t * dx;
    if (x < xMin - eps || x > xMax + eps) continue;
    if (plane < wy && dy <= 0) continue;
    if (plane > wy && dy >= 0) continue;
    const y = y0 + t * dy;
    if (!best || t < best.t) best = { t, x, y, wall };
  }
  return best;
}

export function placeBulletOutsideWall(
  wall: WallSegment,
  x: number,
  y: number,
  radius: number,
  prevX: number,
  prevY: number,
): { x: number; y: number } {
  const pad = 0.1;
  if (wall.kind === 'v') {
    const wx = wall.x1;
    const fromLeft = prevX <= wx;
    return { x: fromLeft ? wx - radius - pad : wx + radius + pad, y };
  }
  const wy = wall.y1;
  const fromTop = prevY <= wy;
  return { x, y: fromTop ? wy - radius - pad : wy + radius + pad };
}

export function circlesOverlap(
  ax: number,
  ay: number,
  ar: number,
  bx: number,
  by: number,
  br: number,
): boolean {
  const dx = ax - bx;
  const dy = ay - by;
  const r = ar + br;
  return dx * dx + dy * dy <= r * r;
}

export function forwardFromAngle(angle: number): { x: number; y: number } {
  return { x: Math.cos(angle), y: Math.sin(angle) };
}
