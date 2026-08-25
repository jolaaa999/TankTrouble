import { GAME } from '../config.js';
import type { MazeData, WallSegment } from '../types.js';
import { createRng } from './rng.js';

function buildWallSegments(
  cols: number,
  rows: number,
  hWalls: boolean[][],
  vWalls: boolean[][],
  cell: number,
): WallSegment[] {
  const walls: WallSegment[] = [];
  const W = cols * cell;
  const H = rows * cell;

  // Outer bounds
  walls.push({ x1: 0, y1: 0, x2: W, y2: 0, kind: 'h' });
  walls.push({ x1: 0, y1: H, x2: W, y2: H, kind: 'h' });
  walls.push({ x1: 0, y1: 0, x2: 0, y2: H, kind: 'v' });
  walls.push({ x1: W, y1: 0, x2: W, y2: H, kind: 'v' });

  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (hWalls[r][c]) {
        const y = r * cell;
        const x1 = c * cell;
        walls.push({ x1, y1: y, x2: x1 + cell, y2: y, kind: 'h' });
      }
    }
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c <= cols; c++) {
      if (vWalls[r][c]) {
        const x = c * cell;
        const y1 = r * cell;
        walls.push({ x1: x, y1, x2: x, y2: y1 + cell, kind: 'v' });
      }
    }
  }

  return walls;
}

/**
 * Recursive backtracker maze. hWalls[r][c] = wall on top edge of cell (r,c)
 * (also bottom of cell above). vWalls[r][c] = wall on left edge of cell (r,c).
 */
export function generateMaze(
  seed: number,
  cols = GAME.mazeCols,
  rows = GAME.mazeRows,
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
  visited[0][0] = true;

  const dirs = [
    { dc: 0, dr: -1 },
    { dc: 1, dr: 0 },
    { dc: 0, dr: 1 },
    { dc: -1, dr: 0 },
  ];

  while (stack.length > 0) {
    const current = stack[stack.length - 1];
    const neighbors: { cell: Cell; dir: (typeof dirs)[number] }[] = [];
    for (const dir of dirs) {
      const nc = current.c + dir.dc;
      const nr = current.r + dir.dr;
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
      if (visited[nr][nc]) continue;
      neighbors.push({ cell: { c: nc, r: nr }, dir });
    }

    if (neighbors.length === 0) {
      stack.pop();
      continue;
    }

    const pick = neighbors[Math.floor(rand() * neighbors.length)];
    const { cell, dir } = pick;
    // Carve wall between current and neighbor
    if (dir.dr === -1) hWalls[current.r][current.c] = false;
    else if (dir.dr === 1) hWalls[cell.r][cell.c] = false;
    else if (dir.dc === -1) vWalls[current.r][current.c] = false;
    else if (dir.dc === 1) vWalls[cell.r][cell.c] = false;

    visited[cell.r][cell.c] = true;
    stack.push(cell);
  }

  const cell = GAME.cellSize;
  const cornerCells: Cell[] = [
    { c: 0, r: 0 },
    { c: cols - 1, r: 0 },
    { c: 0, r: rows - 1 },
    { c: cols - 1, r: rows - 1 },
  ];
  const spawns = cornerCells.map(({ c, r }) => ({
    x: c * cell + cell / 2,
    y: r * cell + cell / 2,
  }));

  const walls = buildWallSegments(cols, rows, hWalls, vWalls, cell);

  return { seed, cols, rows, hWalls, vWalls, spawns, walls };
}
