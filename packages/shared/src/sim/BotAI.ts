import { GAME } from '../config.js';
import type { InputMessage, SimTank, WallSegment } from '../types.js';
import { forwardFromAngle, sweepCircleWalls } from './collide.js';

export function isBotId(id: string): boolean {
  return id.startsWith('bot-');
}

export function fillWithBots(
  humanIds: string[],
  target: number = GAME.maxPlayers,
): string[] {
  const ids = [...humanIds];
  let i = 0;
  while (ids.length < target) {
    ids.push(`bot-${i++}`);
  }
  return ids;
}

function angleDiff(a: number, b: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** How far the tank can travel along `angle` before hitting a wall. */
export function clearanceAlong(
  x: number,
  y: number,
  angle: number,
  walls: readonly WallSegment[],
  maxDist = 120,
): number {
  if (walls.length === 0) return maxDist;
  const f = forwardFromAngle(angle);
  const r = GAME.tankRadius + 6;
  const hit = sweepCircleWalls(x, y, x + f.x * maxDist, y + f.y * maxDist, r, walls);
  if (!hit) return maxDist;
  return Math.max(0, hit.t * maxDist);
}

/**
 * Chase / loot AI with wall probes: turn toward open space, reverse when jammed.
 */
export function computeBotInput(
  self: SimTank,
  others: readonly SimTank[],
  pickups: readonly { x: number; y: number }[],
  timeSec: number,
  walls: readonly WallSegment[] = [],
): InputMessage {
  const input: InputMessage = {
    seq: (timeSec * 60) | 0,
    forward: false,
    back: false,
    left: false,
    right: false,
    fire: false,
  };
  if (!self.alive) return input;

  let targetX = self.x;
  let targetY = self.y;
  let mode: 'fight' | 'loot' | 'wander' = 'wander';

  let bestLoot = 110;
  for (const p of pickups) {
    const d = Math.hypot(p.x - self.x, p.y - self.y);
    if (d < bestLoot) {
      bestLoot = d;
      targetX = p.x;
      targetY = p.y;
      mode = 'loot';
    }
  }

  let nearest: SimTank | null = null;
  let best = Infinity;
  for (const t of others) {
    if (!t.alive || t.id === self.id) continue;
    const d = Math.hypot(t.x - self.x, t.y - self.y);
    if (d < best) {
      best = d;
      nearest = t;
    }
  }

  if (mode !== 'loot' && nearest) {
    targetX = nearest.x;
    targetY = nearest.y;
    mode = 'fight';
  } else if (mode === 'wander') {
    // Prefer open corridors instead of oscillating in place
    const samples = 8;
    let bestClear = -1;
    let bestAng = self.angle;
    for (let i = 0; i < samples; i++) {
      const ang = self.angle + (i / samples) * Math.PI * 2;
      const c = clearanceAlong(self.x, self.y, ang, walls, 140);
      if (c > bestClear) {
        bestClear = c;
        bestAng = ang;
      }
    }
    targetX = self.x + Math.cos(bestAng) * 80;
    targetY = self.y + Math.sin(bestAng) * 80;
  }

  const fwd = clearanceAlong(self.x, self.y, self.angle, walls, 130);
  const leftClear = clearanceAlong(self.x, self.y, self.angle - 0.7, walls, 100);
  const rightClear = clearanceAlong(self.x, self.y, self.angle + 0.7, walls, 100);
  const backClear = clearanceAlong(self.x, self.y, self.angle + Math.PI, walls, 70);

  const jammed = fwd < 28;
  const tight = fwd < 48;

  let desired = Math.atan2(targetY - self.y, targetX - self.x);

  // If path toward target is blocked, bias toward the more open side
  const towardClear = clearanceAlong(self.x, self.y, desired, walls, 110);
  if (towardClear < 55 || jammed) {
    if (leftClear > rightClear + 8) desired = self.angle - 1.1;
    else if (rightClear > leftClear + 8) desired = self.angle + 1.1;
    else if (backClear > 35) desired = self.angle + Math.PI;
    else desired = self.angle + (self.colorIndex % 2 === 0 ? 1.2 : -1.2);
  }

  const diff = angleDiff(self.angle, desired);
  const aimSlop = mode === 'loot' ? 0.32 : jammed ? 0.18 : 0.22;

  if (diff > aimSlop) input.right = true;
  else if (diff < -aimSlop) input.left = true;

  const facingOk = Math.abs(diff) < 0.6;
  const dist = Math.hypot(targetX - self.x, targetY - self.y);

  if (jammed) {
    // Back out of the wall, keep turning toward open space
    if (backClear > 18) input.back = true;
    else if (leftClear > rightClear) input.left = true;
    else input.right = true;
  } else if (tight && !facingOk) {
    // Too close to wall while turning — ease off throttle
    if (Math.abs(diff) > 0.9 && backClear > 22) input.back = true;
    else if (facingOk && fwd > 36) input.forward = true;
  } else if (facingOk) {
    if (mode === 'loot' || dist > 64) {
      if (fwd > 34) input.forward = true;
      else if (backClear > 24) input.back = true;
    } else if (dist < 46 && mode === 'fight') {
      if (backClear > 22) input.back = true;
    }
  } else if (Math.abs(diff) < 1.15 && fwd > 50) {
    // Creep forward while aligning if corridor is open
    input.forward = true;
  }

  // Don't charge a nearly-closed forward gap
  if (input.forward && fwd < 32) {
    input.forward = false;
    if (leftClear > rightClear) input.left = true;
    else input.right = true;
  }

  if (mode === 'fight' && nearest && Math.abs(diff) < 0.28 && dist < 420 && fwd > 20) {
    input.fire = self.weapon === 'gatling' ? true : ((timeSec * 4) | 0) % 3 !== 0;
  }
  if (mode === 'fight' && nearest && dist < 160 && self.weapon !== 'default') {
    input.fire = true;
  }

  return input;
}
