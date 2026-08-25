export const VERSION = '0.2.0';

export const GAME = {
  tickHz: 20,
  mazeCols: 11,
  mazeRows: 7,
  cellSize: 64,
  wallThickness: 8,
  tankRadius: 16,
  tankSpeed: 120,
  tankTurnSpeed: 2.8,
  bulletSpeed: 280,
  bulletRadius: 5,
  maxBulletsPerTank: 5,
  maxBulletBounces: 10,
  fireCooldownSec: 0.35,
  playerColors: [
    '#e53935',
    '#1e88e5',
    '#43a047',
    '#fdd835',
    '#8e24aa',
    '#00acc1',
    '#fb8c00',
    '#ec407a',
  ] as const,
  playerColorDark: [
    '#b71c1c',
    '#0d47a1',
    '#1b5e20',
    '#f9a825',
    '#4a148c',
    '#006064',
    '#e65100',
    '#ad1457',
  ] as const,
  maxPlayers: 4,
  megaMaxPlayers: 8,
  minPlayers: 1,
  fillWithBots: true,
  scoreToWin: 5,
  megaScoreToWin: 10,
  intermissionSec: 2.2,
  pickupSpawnIntervalSec: 7,
  pickupRadius: 14,
  maxPickups: 3,
  megaMaxPickups: 5,
  shieldDurationSec: 6,
  laserBounces: 8,
  laserBeamLifeSec: 0.45,
  shotgunPellets: 7,
  shotgunSpread: 0.45,
  shotgunAmmo: 3,
  gatlingAmmo: 28,
  gatlingCooldownSec: 0.07,
  gatlingBulletSpeed: 320,
  homingTurnRate: 3.2,
  homingSpeed: 220,
  fragShrapnel: 10,
  mineArmDelaySec: 0.45,
  mineRadius: 10,
  mineBlastRadius: 48,
  mineCount: 3,
  turboDurationSec: 5,
  turboSpeedMul: 1.65,
  turboTurnMul: 1.35,
  freezeDurationSec: 2.4,
  freezeRadius: 110,
  blinkDistance: 140,
  empRadius: 130,
  airstrikeDelaySec: 1.1,
  airstrikeRadius: 72,
} as const;

export type MatchMode = 'classic' | 'mega';

export type MatchConfig = {
  mode: MatchMode;
  maxPlayers: number;
  scoreToWin: number;
  fillWithBots: boolean;
  teamMode: boolean;
  scalingMaps: boolean;
};

export const CLASSIC_MATCH: MatchConfig = {
  mode: 'classic',
  maxPlayers: 4,
  scoreToWin: GAME.scoreToWin,
  fillWithBots: true,
  teamMode: false,
  scalingMaps: false,
};

export const MEGA_MATCH: MatchConfig = {
  mode: 'mega',
  maxPlayers: 8,
  scoreToWin: GAME.megaScoreToWin,
  fillWithBots: true,
  teamMode: true,
  scalingMaps: true,
};

export type WeaponKind =
  | 'default'
  | 'laser'
  | 'shotgun'
  | 'gatling'
  | 'homing'
  | 'booby'
  | 'frag'
  | 'deathray'
  | 'turbo'
  | 'freeze'
  | 'blink'
  | 'emp'
  | 'airstrike';

/** Pickups that appear on the map (shield/turbo apply immediately). */
export type PickupKind = WeaponKind | 'shield';

export const PICKUP_POOL: readonly PickupKind[] = [
  'laser',
  'shotgun',
  'gatling',
  'homing',
  'booby',
  'frag',
  'deathray',
  'shield',
  'turbo',
  'freeze',
  'blink',
  'emp',
  'airstrike',
] as const;

export function mazeSizeForRound(roundIndex: number, scaling: boolean): {
  cols: number;
  rows: number;
} {
  if (!scaling) return { cols: GAME.mazeCols, rows: GAME.mazeRows };
  const t = Math.max(0, Math.min(roundIndex - 1, 14));
  return {
    cols: GAME.mazeCols + Math.floor(t * 1.25),
    rows: GAME.mazeRows + Math.floor(t * 0.85),
  };
}
