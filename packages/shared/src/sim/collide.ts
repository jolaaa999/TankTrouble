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
    // Center on segment — use wall normal by kind
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
