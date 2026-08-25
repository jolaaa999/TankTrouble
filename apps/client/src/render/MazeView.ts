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
    g.lineStyle(1, 0xd2b48c, 0.35);
    for (let c = 1; c < maze.cols; c++) {
      const x = offsetX + c * GAME.cellSize;
      g.lineBetween(x, offsetY, x, offsetY + h);
    }
    for (let r = 1; r < maze.rows; r++) {
      const y = offsetY + r * GAME.cellSize;
      g.lineBetween(offsetX, y, offsetX + w, y);
    }

    g.lineStyle(GAME.wallThickness, 0x5d4037, 1);
    for (const wall of maze.walls) {
      g.beginPath();
      g.moveTo(offsetX + wall.x1, offsetY + wall.y1);
      g.lineTo(offsetX + wall.x2, offsetY + wall.y2);
      g.strokePath();
    }
    // softer inner highlight on walls
    g.lineStyle(2, 0x8d6e63, 0.5);
    for (const wall of maze.walls) {
      g.beginPath();
      g.moveTo(offsetX + wall.x1, offsetY + wall.y1);
      g.lineTo(offsetX + wall.x2, offsetY + wall.y2);
      g.strokePath();
    }
  }

  destroy(): void {
    this.graphics.destroy();
  }
}
