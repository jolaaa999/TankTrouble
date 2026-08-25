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
};

export type SimBullet = {
  id: number;
  ownerId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  bounces: number;
};

export type WallSegment = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** 'h' horizontal wall (normal along y), 'v' vertical wall (normal along x) */
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

export type SimSnapshot = {
  seed: number;
  tanks: SimTank[];
  bullets: SimBullet[];
  phase: 'waiting' | 'playing' | 'ended';
  winnerId: string | null;
};

export type SimEvent =
  | { type: 'bounce'; bulletId: number }
  | { type: 'hit'; bulletId: number; tankId: string }
  | { type: 'roundEnd'; winnerId: string | null };
