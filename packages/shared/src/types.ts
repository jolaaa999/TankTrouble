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
  team: number;
  fireCooldown: number;
  weapon: WeaponKind;
  /** Enhanced variant picked up (`技能名+`). */
  weaponPlus: boolean;
  ammo: number;
  shieldTime: number;
  turboTime: number;
  freezeTime: number;
  invisTime: number;
  umbrellaTime: number;
  umbrellaPlus: boolean;
  /** Turbo+ pickup — stronger speed boost while turbo is active. */
  turboPlus: boolean;
  prevFire: boolean;
  /** Death ray / laser aim visible */
  showLaserSight: boolean;
  isBot: boolean;
};

export type BulletKind = 'normal' | 'pellet' | 'homing' | 'frag' | 'shrapnel' | 'pierce' | 'xsplit';

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
  /** Pierce shots can hit multiple tanks. */
  hitsLeft?: number;
  /** Xsplit fan count after first bounce. */
  splitCount?: number;
};

export type SimBeam = {
  id: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  life: number;
  kind: 'laser' | 'deathray';
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

export type SimHazard = {
  id: number;
  x: number;
  y: number;
  radius: number;
  timer: number;
  ownerId: string;
};

export type SimFx = {
  id: number;
  kind:
    | 'freeze'
    | 'emp'
    | 'blink'
    | 'muzzle'
    | 'booby'
    | 'announce'
    | 'cast'
    | 'burst'
    | 'boom'
    | 'shield'
    | 'turbo'
    | 'airstrike';
  x: number;
  y: number;
  life: number;
  /** Initial life — client uses life/maxLife for animation progress. */
  maxLife: number;
  radius: number;
  colorIndex: number;
  /** Skill name for `announce` popups. */
  label: string;
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
  mazeCols: number;
  mazeRows: number;
  tanks: SimTank[];
  bullets: SimBullet[];
  beams: SimBeam[];
  pickups: SimPickup[];
  mines: SimMine[];
  hazards: SimHazard[];
  fx: SimFx[];
  scores: Record<string, number>;
  teamScores: Record<number, number>;
  phase: SimPhase;
  roundWinnerId: string | null;
  matchWinnerId: string | null;
  matchWinnerTeam: number | null;
  intermissionLeft: number;
  roundIndex: number;
};

export type SimEvent =
  | { type: 'bounce'; bulletId: number }
  | { type: 'hit'; bulletId: number; tankId: string }
  | { type: 'roundEnd'; winnerId: string | null; winnerTeam?: number | null }
  | { type: 'matchEnd'; winnerId: string | null; winnerTeam?: number | null }
  | { type: 'pickup'; tankId: string; kind: PickupKind }
  | { type: 'score'; tankId: string; score: number };
