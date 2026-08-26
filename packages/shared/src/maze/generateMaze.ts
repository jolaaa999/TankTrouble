import { GAME } from '../config.js';
import type { MazeData } from '../types.js';
import {
  buildDefaultSpawns,
  buildWallSegments,
} from './mazeLayout.js';
import { createRng } from './rng.js';

export { buildWallSegments, buildDefaultSpawns, emptyWallGrid } from './mazeLayout.js';

/**
 * Recursive backtracker maze. hWalls[r][c] = wall on top edge of cell (r,c).
 * vWalls[r][c] = wall on left edge of cell (r,c).
 */
export function generateMaze(
  seed: number,
  cols: number = GAME.mazeCols,
  rows: number = GAME.mazeRows,
): MazeData {
  const rand = createRng(seed);
  const hWalls: boolean[][] = Array.from({ length: rows + 1 }, () =>
    Array.from({ length: cols }, () => true),
  );
  const vWalls: boolean[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols + 1 }, () => true),
  );

  const visited: boolean[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => false),
  );

  type Cell = { c: number; r: number };
  const stack: Cell[] = [{ c: 0, r: 0 }];
  visited[0]![0] = true;

  const dirs = [
    { dc: 0, dr: -1 },
    { dc: 1, dr: 0 },
    { dc: 0, dr: 1 },
    { dc: -1, dr: 0 },
  ];

  while (stack.length > 0) {
    const current = stack[stack.length - 1]!;
    const neighbors: { cell: Cell; dir: (typeof dirs)[number] }[] = [];
    for (const dir of dirs) {
      const nc = current.c + dir.dc;
      const nr = current.r + dir.dr;
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
      if (visited[nr]![nc]) continue;
      neighbors.push({ cell: { c: nc, r: nr }, dir });
    }

    if (neighbors.length === 0) {
      stack.pop();
      continue;
    }

    const pick = neighbors[Math.floor(rand() * neighbors.length)]!;
    const { cell, dir } = pick;
    if (dir.dr === -1) hWalls[current.r]![current.c] = false;
    else if (dir.dr === 1) hWalls[cell.r]![cell.c] = false;
    else if (dir.dc === -1) vWalls[current.r]![current.c] = false;
    else if (dir.dc === 1) vWalls[cell.r]![cell.c] = false;

    visited[cell.r]![cell.c] = true;
    stack.push(cell);
  }

  // Extra openings on larger maps → more complex loops
  const extraCuts = Math.max(0, Math.floor((cols * rows) / 18) - 4);
  for (let i = 0; i < extraCuts; i++) {
    if (rand() < 0.5) {
      const r = 1 + Math.floor(rand() * (rows - 1));
      const c = Math.floor(rand() * cols);
      hWalls[r]![c] = false;
    } else {
      const r = Math.floor(rand() * rows);
      const c = 1 + Math.floor(rand() * (cols - 1));
      vWalls[r]![c] = false;
    }
  }

  const cell = GAME.cellSize;
  const spawns = buildDefaultSpawns(cols, rows, cell);
  const walls = buildWallSegments(cols, rows, hWalls, vWalls, cell);

  return { seed, cols, rows, hWalls, vWalls, spawns, walls };
}
