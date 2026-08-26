import { GAME } from '../config.js';
import type { MazeData, WallSegment } from '../types.js';

/** JSON-serializable custom map for the maze editor. */
export type CustomMazeLayout = {
  name: string;
  cols: number;
  rows: number;
  hWalls: boolean[][];
  vWalls: boolean[][];
  spawns: { x: number; y: number }[];
};

export const MAZE_EDITOR_LIMITS = {
  minCols: 5,
  maxCols: GAME.megaMazeMaxCols,
  minRows: 5,
  maxRows: GAME.megaMazeMaxRows,
  maxSpawns: 8,
} as const;

export function buildWallSegments(
  cols: number,
  rows: number,
  hWalls: boolean[][],
  vWalls: boolean[][],
  cell: number = GAME.cellSize,
): WallSegment[] {
  const walls: WallSegment[] = [];
  const W = cols * cell;
  const H = rows * cell;

  walls.push({ x1: 0, y1: 0, x2: W, y2: 0, kind: 'h' });
  walls.push({ x1: 0, y1: H, x2: W, y2: H, kind: 'h' });
  walls.push({ x1: 0, y1: 0, x2: 0, y2: H, kind: 'v' });
  walls.push({ x1: W, y1: 0, x2: W, y2: H, kind: 'v' });

  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (hWalls[r]?.[c]) {
        const y = r * cell;
        const x1 = c * cell;
        walls.push({ x1, y1: y, x2: x1 + cell, y2: y, kind: 'h' });
      }
    }
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c <= cols; c++) {
      if (vWalls[r]?.[c]) {
        const x = c * cell;
        const y1 = r * cell;
        walls.push({ x1: x, y1, x2: x, y2: y1 + cell, kind: 'v' });
      }
    }
  }

  return walls;
}

export function buildDefaultSpawns(
  cols: number,
  rows: number,
  cell: number = GAME.cellSize,
): { x: number; y: number }[] {
  const midC = Math.floor(cols / 2);
  const midR = Math.floor(rows / 2);
  const points = [
    { c: 0, r: 0 },
    { c: cols - 1, r: 0 },
    { c: 0, r: rows - 1 },
    { c: cols - 1, r: rows - 1 },
    { c: midC, r: 0 },
    { c: midC, r: rows - 1 },
    { c: 0, r: midR },
    { c: cols - 1, r: midR },
  ];
  const seen = new Set<string>();
  const spawns: { x: number; y: number }[] = [];
  for (const p of points) {
    const key = `${p.c},${p.r}`;
    if (seen.has(key)) continue;
    seen.add(key);
    spawns.push({ x: p.c * cell + cell / 2, y: p.r * cell + cell / 2 });
  }
  return spawns;
}

export function emptyWallGrid(cols: number, rows: number): {
  hWalls: boolean[][];
  vWalls: boolean[][];
} {
  return {
    hWalls: Array.from({ length: rows + 1 }, () => Array.from({ length: cols }, () => false)),
    vWalls: Array.from({ length: rows }, () => Array.from({ length: cols + 1 }, () => false)),
  };
}

export function validateCustomMazeLayout(layout: CustomMazeLayout): string | null {
  const { minCols, maxCols, minRows, maxRows, maxSpawns } = MAZE_EDITOR_LIMITS;
  if (layout.cols < minCols || layout.cols > maxCols) {
    return `列数需在 ${minCols}–${maxCols}`;
  }
  if (layout.rows < minRows || layout.rows > maxRows) {
    return `行数需在 ${minRows}–${maxRows}`;
  }
  if (layout.hWalls.length !== layout.rows + 1) return 'hWalls 行数不匹配';
  if (layout.vWalls.length !== layout.rows) return 'vWalls 行数不匹配';
  for (const row of layout.hWalls) {
    if (row.length !== layout.cols) return 'hWalls 列数不匹配';
  }
  for (const row of layout.vWalls) {
    if (row.length !== layout.cols + 1) return 'vWalls 列数不匹配';
  }
  if (layout.spawns.length < 2) return '至少需要 2 个出生点';
  if (layout.spawns.length > maxSpawns) return `出生点最多 ${maxSpawns} 个`;
  return null;
}

export function buildMazeFromLayout(layout: CustomMazeLayout, seed = 0): MazeData {
  const err = validateCustomMazeLayout(layout);
  if (err) throw new Error(err);
  const cell = GAME.cellSize;
  const spawns =
    layout.spawns.length >= 2
      ? layout.spawns.map((s) => ({ x: s.x, y: s.y }))
      : buildDefaultSpawns(layout.cols, layout.rows, cell);
  return {
    seed,
    cols: layout.cols,
    rows: layout.rows,
    hWalls: layout.hWalls.map((row) => [...row]),
    vWalls: layout.vWalls.map((row) => [...row]),
    spawns,
    walls: buildWallSegments(layout.cols, layout.rows, layout.hWalls, layout.vWalls, cell),
  };
}

export function layoutFromMazeData(maze: MazeData, name = '未命名'): CustomMazeLayout {
  return {
    name,
    cols: maze.cols,
    rows: maze.rows,
    hWalls: maze.hWalls.map((row) => [...row]),
    vWalls: maze.vWalls.map((row) => [...row]),
    spawns: maze.spawns.map((s) => ({ x: s.x, y: s.y })),
  };
}

export function parseCustomMazeLayout(json: string): CustomMazeLayout {
  const raw = JSON.parse(json) as CustomMazeLayout;
  const err = validateCustomMazeLayout(raw);
  if (err) throw new Error(err);
  return raw;
}

export function serializeCustomMazeLayout(layout: CustomMazeLayout): string {
  const err = validateCustomMazeLayout(layout);
  if (err) throw new Error(err);
  return JSON.stringify(layout, null, 2);
}
