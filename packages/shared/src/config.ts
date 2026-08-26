export const VERSION = '0.3.9';

export const GAME = {
  tickHz: 60,
  mazeCols: 11,
  mazeRows: 7,
  cellSize: 64,
  wallThickness: 8,
  tankRadius: 16,
  tankSpeed: 130,
  tankTurnSpeed: 3.6,
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
  fillWithBots: false,
  scoreToWin: 5,
  megaScoreToWin: 10,
  intermissionSec: 2.2,
  pickupSpawnIntervalSec: 7,
  pickupRadius: 14,
  maxPickups: 3,
  megaMaxPickups: 5,
  /** Cap mega map growth so it always fits a 1280×800 canvas with margin. */
  megaMazeMaxCols: 15,
  megaMazeMaxRows: 10,
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
  fragShrapnel: 14,
  mineArmDelaySec: 0.45,
  mineRadius: 10,
  mineBlastRadius: 48,
  mineCount: 3,
  mineShrapnel: 12,
  turboDurationSec: 5,
  turboSpeedMul: 1.65,
  turboTurnMul: 1.35,
  freezeDurationSec: 2.4,
  freezeRadius: 110,
  blinkDistance: 140,
  empRadius: 130,
  airstrikeDelaySec: 1.1,
  airstrikeRadius: 72,
  cannonSpeed: 180,
  cannonRadius: 9,
  cannonLife: 10,
  novaShrapnel: 16,
  railSpeed: 520,
  railLife: 1.4,
  dashDistance: 90,
  knockbackRadius: 100,
  knockbackForce: 55,
  magnetRadius: 110,
  magnetPull: 70,
  invisDurationSec: 2.2,
  umbrellaDurationSec: 4.5,
  umbrellaArcRad: 1.35,
  vortexRadius: 95,
  vortexFreezeSec: 1.0,
  yardMineCount: 5,
  quadSpread: 0.28,
  pierceHits: 2,
  pierceHitsPlus: 3,
  plusRadiusMul: 1.45,
  plusDurationMul: 1.6,
  plusCountMul: 1.5,
  plusDistMul: 1.35,
  plusSpeedMul: 1.2,
  plusShieldDurationSec: 9.5,
  plusTurboDurationSec: 7.5,
  plusTurboSpeedMul: 1.85,
  plusTurboTurnMul: 1.5,
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
  fillWithBots: false,
  teamMode: false,
  scalingMaps: false,
};

export const MEGA_MATCH: MatchConfig = {
  mode: 'mega',
  maxPlayers: 8,
  scoreToWin: GAME.megaScoreToWin,
  fillWithBots: false,
  teamMode: true,
  scalingMaps: true,
};

export type { SkillId, WeaponKind, PickupKind } from './skills.js';
export { PICKUP_POOL, SKILLS, SKILL_IDS } from './skills.js';

export function mazeSizeForRound(roundIndex: number, scaling: boolean): {
  cols: number;
  rows: number;
} {
  if (!scaling) return { cols: GAME.mazeCols, rows: GAME.mazeRows };
  const t = Math.max(0, roundIndex - 1);
  return {
    cols: Math.min(GAME.megaMazeMaxCols, GAME.mazeCols + Math.min(4, t)),
    rows: Math.min(GAME.megaMazeMaxRows, GAME.mazeRows + Math.min(3, Math.floor(t * 0.75))),
  };
}
