import { describe, expect, it } from 'vitest';
import { generateMaze } from './generateMaze.js';
import {
  buildMazeFromLayout,
  layoutFromMazeData,
  parseCustomMazeLayout,
  serializeCustomMazeLayout,
} from './mazeLayout.js';

describe('mazeLayout', () => {
  it('round-trips a generated maze through custom layout', () => {
    const maze = generateMaze(42, 9, 6);
    const layout = layoutFromMazeData(maze, 'test');
    const rebuilt = buildMazeFromLayout(layout, 42);
    expect(rebuilt.cols).toBe(maze.cols);
    expect(rebuilt.rows).toBe(maze.rows);
    expect(rebuilt.hWalls).toEqual(maze.hWalls);
    expect(rebuilt.vWalls).toEqual(maze.vWalls);
    expect(rebuilt.walls.length).toBe(maze.walls.length);
  });

  it('serializes and parses JSON layout', () => {
    const maze = generateMaze(7);
    const layout = layoutFromMazeData(maze, 'arena');
    const json = serializeCustomMazeLayout(layout);
    const parsed = parseCustomMazeLayout(json);
    expect(parsed.name).toBe('arena');
    expect(parsed.cols).toBe(layout.cols);
  });
});
