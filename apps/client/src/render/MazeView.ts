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
    g.fillStyle(0xd6c4a8, 1);
    g.fillRect(offsetX, offsetY, w, h);

    g.lineStyle(GAME.wallThickness, 0x2c241b, 1);
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
