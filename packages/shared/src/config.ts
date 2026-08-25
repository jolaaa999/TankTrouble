export const VERSION = '0.1.0';

export const GAME = {
  tickHz: 20,
  mazeCols: 11,
  mazeRows: 7,
  cellSize: 64,
  wallThickness: 8,
  tankRadius: 18,
  tankSpeed: 120,
  tankTurnSpeed: 2.8,
  bulletSpeed: 280,
  bulletRadius: 5,
  maxBulletsPerTank: 5,
  maxBulletBounces: 8,
  fireCooldownSec: 0.35,
  playerColors: ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f'],
  maxPlayers: 4,
  minPlayers: 2,
} as const;
