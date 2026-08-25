import Phaser from 'phaser';
import type { MazeData } from '@tanktrouble/shared';
import { GAME } from '@tanktrouble/shared';

export class MazeView {
  private graphics: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.graphics = scene.add.graphics();
  }

  draw(maze: MazeData, offsetX: number, offsetY: number): void {
    const g = this.graphics;
    g.clear();
    const w = maze.cols * GAME.cellSize;
    const h = maze.rows * GAME.cellSize;
    // Classic sandy arena
    g.fillStyle(0xe8d4a8, 1);
    g.fillRect(offsetX, offsetY, w, h);
    g.lineStyle(1, 0xcbb896, 0.4);
    for (let c = 1; c < maze.cols; c++) {
      const x = offsetX + c * GAME.cellSize;
      g.lineBetween(x, offsetY, x, offsetY + h);
    }
    for (let r = 1; r < maze.rows; r++) {
      const y = offsetY + r * GAME.cellSize;
      g.lineBetween(offsetX, y, offsetX + w, y);
    }

    // One pass: dark outline + fill (was 3 full wall loops)
    for (const wall of maze.walls) {
      const x1 = offsetX + wall.x1;
      const y1 = offsetY + wall.y1;
      const x2 = offsetX + wall.x2;
      const y2 = offsetY + wall.y2;
      g.lineStyle(GAME.wallThickness + 2, 0x3e2723, 1);
      g.beginPath();
      g.moveTo(x1, y1);
      g.lineTo(x2, y2);
      g.strokePath();
      g.lineStyle(GAME.wallThickness, 0x6d4c41, 1);
      g.beginPath();
      g.moveTo(x1, y1);
      g.lineTo(x2, y2);
      g.strokePath();
    }
  }

  destroy(): void {
    this.graphics.destroy();
  }
}
