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
 * Chase / loot AI: keep moving, only reverse when nearly kissing a wall.
 * Probe count is kept low for tick performance.
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

  let bestLoot = 130;
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
    // Cheap wander — no multi-sample wall fan every tick
    const wobble = Math.sin(timeSec * 1.4 + self.colorIndex * 1.7) * 0.9;
    const ang = self.angle + wobble;
    targetX = self.x + Math.cos(ang) * 90;
    targetY = self.y + Math.sin(ang) * 90;
  }

  // Three probes only (was 12+)
  const fwd = clearanceAlong(self.x, self.y, self.angle, walls, 90);
  const leftClear = clearanceAlong(self.x, self.y, self.angle - 1.0, walls, 70);
  const rightClear = clearanceAlong(self.x, self.y, self.angle + 1.0, walls, 70);

  let desired = Math.atan2(targetY - self.y, targetX - self.x);
  const towardClear = clearanceAlong(self.x, self.y, desired, walls, 80);

  if (towardClear < 36 || fwd < 24) {
    if (leftClear > rightClear + 6) desired = self.angle - 1.15;
    else if (rightClear > leftClear + 6) desired = self.angle + 1.15;
    else desired = self.angle + (self.colorIndex % 2 === 0 ? Math.PI * 0.7 : -Math.PI * 0.7);
  }

  const diff = angleDiff(self.angle, desired);
  const aimSlop = mode === 'loot' ? 0.28 : 0.2;

  if (diff > aimSlop) input.right = true;
  else if (diff < -aimSlop) input.left = true;

  const distance = Math.hypot(targetX - self.x, targetY - self.y);

  // Hard jam: reverse; otherwise prefer forward so bots don't freeze
  if (fwd < 20) {
    input.back = true;
    input.forward = false;
  } else if (Math.abs(diff) < 0.95) {
    if (mode === 'fight' && distance < 50 && fwd > 28) {
      // Hold distance a bit
      if (distance < 38) input.back = true;
      else input.forward = true;
    } else {
      input.forward = true;
    }
  } else if (fwd > 40) {
    // Creep while turning in open space
    input.forward = true;
  }

  if (mode === 'fight' && nearest && Math.abs(diff) < 0.3 && distance < 440 && fwd > 16) {
    input.fire = self.weapon === 'gatling' ? true : ((timeSec * 4) | 0) % 3 !== 0;
  }
  if (mode === 'fight' && nearest && distance < 170 && self.weapon !== 'default') {
    input.fire = true;
  }

  return input;
}
