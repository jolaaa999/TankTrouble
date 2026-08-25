import { GAME } from '../config.js';
import type { InputMessage, SimTank } from '../types.js';

export function isBotId(id: string): boolean {
  return id.startsWith('bot-');
}

export function fillWithBots(
  humanIds: string[],
  target = GAME.maxPlayers,
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

/** Simple chase / aim / shoot AI for bot tanks. */
export function computeBotInput(
  self: SimTank,
  others: readonly SimTank[],
  pickups: readonly { x: number; y: number }[],
  timeSec: number,
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
  let mode: 'fight' | 'loot' = 'fight';

  let bestLoot = 90;
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

  if (mode === 'fight' && nearest) {
    targetX = nearest.x;
    targetY = nearest.y;
  } else if (!nearest) {
    const wobble = timeSec * 0.7 + self.colorIndex;
    targetX = self.x + Math.cos(wobble) * 80;
    targetY = self.y + Math.sin(wobble) * 80;
  }

  const desired = Math.atan2(targetY - self.y, targetX - self.x);
  const diff = angleDiff(self.angle, desired);
  const aimSlop = mode === 'loot' ? 0.35 : 0.22;

  if (diff > aimSlop) input.right = true;
  else if (diff < -aimSlop) input.left = true;

  const facingOk = Math.abs(diff) < 0.55;
  const dist = Math.hypot(targetX - self.x, targetY - self.y);

  if (facingOk) {
    if (mode === 'loot' || dist > 70) input.forward = true;
    else if (dist < 48 && mode === 'fight') input.back = true;
  } else if (Math.abs(diff) < 1.2) {
    input.forward = true;
  }

  if (((timeSec * 10) | 0) % 23 === self.colorIndex) {
    input.back = !input.forward;
    input.forward = false;
  }

  if (mode === 'fight' && nearest && Math.abs(diff) < 0.28 && dist < 420) {
    input.fire = self.weapon === 'gatling' ? true : ((timeSec * 4) | 0) % 3 !== 0;
  }
  if (mode === 'fight' && nearest && dist < 160 && self.weapon !== 'default') {
    input.fire = true;
  }

  return input;
}
