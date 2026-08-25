export const VERSION = '0.1.1';

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
  playerColors: ['#e53935', '#1e88e5', '#43a047', '#fdd835'] as const,
  /** Classic Tank Trouble body shades (darker tread / outline) */
  playerColorDark: ['#b71c1c', '#0d47a1', '#1b5e20', '#f9a825'] as const,
  maxPlayers: 4,
  /** Humans needed to start; bots fill up to maxPlayers. */
  minPlayers: 1,
  fillWithBots: true,
  scoreToWin: 5,
  intermissionSec: 2.2,
  pickupSpawnIntervalSec: 7,
  pickupRadius: 14,
  maxPickups: 3,
  shieldDurationSec: 6,
  laserSpeed: 900,
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
} as const;

export type WeaponKind =
  | 'default'
  | 'laser'
  | 'shotgun'
  | 'gatling'
  | 'homing'
  | 'booby'
  | 'frag'
  | 'deathray';

/** Pickups that appear on the map (shield applies immediately). */
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
] as const;
