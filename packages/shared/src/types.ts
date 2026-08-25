import type { PickupKind, WeaponKind } from './config.js';

export type InputMessage = {
  seq: number;
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  fire: boolean;
};

export type SimTank = {
  id: string;
  x: number;
  y: number;
  angle: number;
  alive: boolean;
  colorIndex: number;
  fireCooldown: number;
  weapon: WeaponKind;
  ammo: number;
  shieldTime: number;
  prevFire: boolean;
  /** Death ray / laser aim visible */
  showLaserSight: boolean;
};

export type BulletKind = 'normal' | 'laser' | 'pellet' | 'homing' | 'frag' | 'shrapnel';

export type SimBullet = {
  id: number;
  ownerId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  bounces: number;
  kind: BulletKind;
  life: number;
  radius: number;
};

export type SimPickup = {
  id: number;
  kind: PickupKind;
  x: number;
  y: number;
};

export type SimMine = {
  id: number;
  ownerId: string;
  x: number;
  y: number;
  armed: boolean;
  armTimer: number;
  triggered: boolean;
  triggerTimer: number;
  visible: boolean;
};

export type WallSegment = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  kind: 'h' | 'v';
};

export type MazeData = {
  seed: number;
  cols: number;
  rows: number;
  hWalls: boolean[][];
  vWalls: boolean[][];
  spawns: { x: number; y: number }[];
  walls: WallSegment[];
};

export type SimPhase = 'playing' | 'intermission' | 'matchEnd';

export type SimSnapshot = {
  seed: number;
  tanks: SimTank[];
  bullets: SimBullet[];
  pickups: SimPickup[];
  mines: SimMine[];
  scores: Record<string, number>;
  phase: SimPhase;
  roundWinnerId: string | null;
  matchWinnerId: string | null;
  intermissionLeft: number;
  roundIndex: number;
};

export type SimEvent =
  | { type: 'bounce'; bulletId: number }
  | { type: 'hit'; bulletId: number; tankId: string }
  | { type: 'roundEnd'; winnerId: string | null }
  | { type: 'matchEnd'; winnerId: string | null }
  | { type: 'pickup'; tankId: string; kind: PickupKind }
  | { type: 'score'; tankId: string; score: number };
