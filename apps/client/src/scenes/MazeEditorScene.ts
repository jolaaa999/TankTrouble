import Phaser from 'phaser';
import {
  GAME,
  MAZE_EDITOR_LIMITS,
  buildDefaultSpawns,
  buildMazeFromLayout,
  emptyWallGrid,
  generateMaze,
  layoutFromMazeData,
  type CustomMazeLayout,
} from '@tanktrouble/shared';
import { MazeView } from '../render/MazeView';
import {
  copyMazeJson,
  importMazeJson,
  loadStoredMaze,
  saveStoredMaze,
} from '../maze/customMazeStorage';

type EditorTool = 'wall' | 'spawn';

export class MazeEditorScene extends Phaser.Scene {
  private mapName = '我的地图';
  private cols: number = GAME.mazeCols;
  private rows: number = GAME.mazeRows;
  private hWalls: boolean[][] = [];
  private vWalls: boolean[][] = [];
  private spawns: { x: number; y: number }[] = [];
  private tool: EditorTool = 'wall';
  private offsetX = 0;
  private offsetY = 0;
  private mazeView: MazeView | null = null;
  private spawnGfx: Phaser.GameObjects.Graphics | null = null;
  private statusText: Phaser.GameObjects.Text | null = null;
  private toolLabel: Phaser.GameObjects.Text | null = null;
  private readonly edgeHit = 12;

  constructor() {
    super('mazeEditor');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(0x1b2430);
    this.mazeView = new MazeView(this);
    this.spawnGfx = this.add.graphics().setDepth(2);

    const stored = loadStoredMaze();
    if (stored) this.applyLayout(stored);
    else this.loadRandomMaze();

    this.statusText = this.add
      .text(16, 52, '', {
        fontFamily: 'Segoe UI, sans-serif',
        fontSize: '14px',
        color: '#cfd8dc',
      })
      .setScrollFactor(0)
      .setDepth(30);

    this.toolLabel = this.add
      .text(16, 72, '', {
        fontFamily: 'Segoe UI, sans-serif',
        fontSize: '13px',
        color: '#80cbc4',
      })
      .setScrollFactor(0)
      .setDepth(30);

    this.add
      .text(this.scale.width / 2, 18, '迷宫地图编辑器', {
        fontFamily: 'Georgia, serif',
        fontSize: '26px',
        color: '#f5f0e6',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(30);

    this.buildToolbar();
    this.layoutView();
    this.refreshUi();

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.y < 96) return;
      this.handleGridClick(p.x, p.y);
    });

    this.input.keyboard?.on('keydown-ESC', () => this.scene.start('menu'));
  }

  private buildToolbar(): void {
    const y = 36;
    const buttons: { label: string; x: number; w: number; fn: () => void; color?: number }[] = [
      { label: '返回', x: 56, w: 72, fn: () => this.scene.start('menu'), color: 0x455a64 },
      { label: '墙壁', x: 136, w: 72, fn: () => this.setTool('wall'), color: 0x5e35b1 },
      { label: '出生点', x: 216, w: 80, fn: () => this.setTool('spawn'), color: 0x00838f },
      { label: '随机', x: 304, w: 72, fn: () => this.loadRandomMaze(), color: 0x37474f },
      { label: '保存', x: 384, w: 72, fn: () => this.saveMap(), color: 0x2e7d32 },
      { label: '导出', x: 464, w: 72, fn: () => void this.exportMap(), color: 0x455a64 },
      { label: '导入', x: 544, w: 72, fn: () => this.importMap(), color: 0x455a64 },
      { label: '试玩', x: 624, w: 72, fn: () => this.testPlay(), color: 0x2f6fed },
      { label: '列−', x: 720, w: 52, fn: () => this.resize(-1, 0), color: 0x37474f },
      { label: '列+', x: 778, w: 52, fn: () => this.resize(1, 0), color: 0x37474f },
      { label: '行−', x: 836, w: 52, fn: () => this.resize(0, -1), color: 0x37474f },
      { label: '行+', x: 894, w: 52, fn: () => this.resize(0, 1), color: 0x37474f },
      { label: '清空', x: 960, w: 72, fn: () => this.clearWalls(), color: 0x6d4c41 },
    ];
    for (const b of buttons) {
      this.makeToolbarButton(b.x, y, b.w, b.label, b.fn, b.color ?? 0x455a64);
    }
  }

  private makeToolbarButton(
    x: number,
    y: number,
    w: number,
    label: string,
    onClick: () => void,
    color: number,
  ): void {
    const bg = this.add
      .rectangle(x, y, w, 32, color, 0.95)
      .setInteractive({ useHandCursor: true })
      .setScrollFactor(0)
      .setDepth(30);
    this.add
      .text(x, y, label, {
        fontFamily: 'Segoe UI, sans-serif',
        fontSize: '13px',
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(31);
    bg.on('pointerdown', (p: Phaser.Input.Pointer) => {
      p.event?.stopPropagation();
      onClick();
    });
  }

  private setTool(tool: EditorTool): void {
    this.tool = tool;
    this.refreshUi();
  }

  private applyLayout(layout: CustomMazeLayout): void {
    this.mapName = layout.name;
    this.cols = layout.cols;
    this.rows = layout.rows;
    this.hWalls = layout.hWalls.map((row: boolean[]) => [...row]);
    this.vWalls = layout.vWalls.map((row: boolean[]) => [...row]);
    this.spawns = layout.spawns.map((s: { x: number; y: number }) => ({ x: s.x, y: s.y }));
    this.layoutView();
    this.refreshUi();
  }

  private currentLayout(): CustomMazeLayout {
    return {
      name: this.mapName,
      cols: this.cols,
      rows: this.rows,
      hWalls: this.hWalls.map((row) => [...row]),
      vWalls: this.vWalls.map((row) => [...row]),
      spawns: this.spawns.map((s) => ({ x: s.x, y: s.y })),
    };
  }

  private loadRandomMaze(): void {
    const seed = (Math.random() * 1e9) | 0;
    const maze = generateMaze(seed, this.cols, this.rows);
    this.applyLayout(layoutFromMazeData(maze, this.mapName));
  }

  private clearWalls(): void {
    const grids = emptyWallGrid(this.cols, this.rows);
    this.hWalls = grids.hWalls;
    this.vWalls = grids.vWalls;
    this.refreshUi();
  }

  private resize(dc: number, dr: number): void {
    const { minCols, maxCols, minRows, maxRows } = MAZE_EDITOR_LIMITS;
    const nc = Phaser.Math.Clamp(this.cols + dc, minCols, maxCols);
    const nr = Phaser.Math.Clamp(this.rows + dr, minRows, maxRows);
    if (nc === this.cols && nr === this.rows) return;

    const grids = emptyWallGrid(nc, nr);
    for (let r = 0; r <= Math.min(this.rows, nr); r++) {
      for (let c = 0; c < Math.min(this.cols, nc); c++) {
        if (this.hWalls[r]?.[c] !== undefined) grids.hWalls[r]![c] = this.hWalls[r]![c]!;
      }
    }
    for (let r = 0; r < Math.min(this.rows, nr); r++) {
      for (let c = 0; c <= Math.min(this.cols, nc); c++) {
        if (this.vWalls[r]?.[c] !== undefined) grids.vWalls[r]![c] = this.vWalls[r]![c]!;
      }
    }
    this.cols = nc;
    this.rows = nr;
    this.hWalls = grids.hWalls;
    this.vWalls = grids.vWalls;
    this.spawns = buildDefaultSpawns(nc, nr).slice(0, MAZE_EDITOR_LIMITS.maxSpawns);
    this.layoutView();
    this.refreshUi();
  }

  private layoutView(): void {
    const w = this.cols * GAME.cellSize;
    const h = this.rows * GAME.cellSize;
    const viewW = this.scale.width;
    const viewH = this.scale.height - 110;
    const zoom = Math.min(1, (viewW - 48) / w, (viewH - 24) / h);
    this.offsetX = (viewW - w * zoom) / 2;
    this.offsetY = 100 + (viewH - h * zoom) / 2;
    this.cameras.main.setZoom(1);
    this.cameras.main.centerOn(viewW / 2, viewH / 2 + 50);
    this.cameras.main.setScroll(0, 0);
  }

  private mazeForDraw() {
    return buildMazeFromLayout(this.currentLayout(), 0);
  }

  private refreshUi(): void {
    const maze = this.mazeForDraw();
    this.mazeView?.draw(maze, this.offsetX, this.offsetY);
    this.drawSpawns();
    this.statusText?.setText(
      `${this.mapName}  ·  ${this.cols}×${this.rows}  ·  出生点 ${this.spawns.length}`,
    );
    this.toolLabel?.setText(
      this.tool === 'wall'
        ? '工具：墙壁 — 点格子边缘切换墙体（外圈由边界自动封闭）'
        : '工具：出生点 — 点击格子添加/移除出生点（至少 2 个才能试玩）',
    );
  }

  private drawSpawns(): void {
    const g = this.spawnGfx;
    if (!g) return;
    g.clear();
    const cell = GAME.cellSize;
    for (const s of this.spawns) {
      const x = this.offsetX + s.x;
      const y = this.offsetY + s.y;
      g.fillStyle(0x00e676, 0.85);
      g.fillCircle(x, y, 10);
      g.lineStyle(2, 0x1b5e20, 1);
      g.strokeCircle(x, y, 10);
    }
    // grid hint
    g.lineStyle(1, 0xffffff, 0.06);
    for (let c = 0; c <= this.cols; c++) {
      const x = this.offsetX + c * cell;
      g.lineBetween(x, this.offsetY, x, this.offsetY + this.rows * cell);
    }
    for (let r = 0; r <= this.rows; r++) {
      const y = this.offsetY + r * cell;
      g.lineBetween(this.offsetX, y, this.offsetX + this.cols * cell, y);
    }
  }

  private handleGridClick(worldX: number, worldY: number): void {
    const cell = GAME.cellSize;
    const lx = worldX - this.offsetX;
    const ly = worldY - this.offsetY;
    if (lx < 0 || ly < 0 || lx > this.cols * cell || ly > this.rows * cell) return;

    const c = Math.floor(lx / cell);
    const r = Math.floor(ly / cell);
    const tx = lx - c * cell;
    const ty = ly - r * cell;

    if (this.tool === 'spawn') {
      this.toggleSpawn(c, r);
      this.refreshUi();
      return;
    }

    const hit = this.edgeHit;
    if (ty < hit && r >= 0 && r <= this.rows && c >= 0 && c < this.cols) {
      this.hWalls[r]![c] = !this.hWalls[r]![c];
    } else if (tx < hit && c >= 0 && c <= this.cols && r >= 0 && r < this.rows) {
      this.vWalls[r]![c] = !this.vWalls[r]![c];
    } else if (ty > cell - hit && r + 1 <= this.rows && c >= 0 && c < this.cols) {
      this.hWalls[r + 1]![c] = !this.hWalls[r + 1]![c];
    } else if (tx > cell - hit && c + 1 <= this.cols && r >= 0 && r < this.rows) {
      this.vWalls[r]![c + 1] = !this.vWalls[r]![c + 1];
    }
    this.refreshUi();
  }

  private toggleSpawn(c: number, r: number): void {
    const cell = GAME.cellSize;
    const x = c * cell + cell / 2;
    const y = r * cell + cell / 2;
    const idx = this.spawns.findIndex(
      (s) => Math.hypot(s.x - x, s.y - y) < cell * 0.35,
    );
    if (idx >= 0) {
      this.spawns.splice(idx, 1);
      return;
    }
    if (this.spawns.length >= MAZE_EDITOR_LIMITS.maxSpawns) return;
    this.spawns.push({ x, y });
  }

  private saveMap(): void {
    try {
      saveStoredMaze(this.currentLayout());
      this.statusText?.setText('已保存到浏览器本地');
    } catch (e) {
      this.statusText?.setText(`保存失败：${(e as Error).message}`);
    }
  }

  private async exportMap(): Promise<void> {
    try {
      await copyMazeJson(this.currentLayout());
      this.statusText?.setText('地图 JSON 已复制到剪贴板');
    } catch (e) {
      this.statusText?.setText(`导出失败：${(e as Error).message}`);
    }
  }

  private importMap(): void {
    const raw = window.prompt('粘贴地图 JSON：', '');
    if (!raw?.trim()) return;
    try {
      this.applyLayout(importMazeJson(raw));
      this.statusText?.setText('导入成功');
    } catch (e) {
      this.statusText?.setText(`导入失败：${(e as Error).message}`);
    }
  }

  private testPlay(): void {
    const layout = this.currentLayout();
    if (layout.spawns.length < 2) {
      this.statusText?.setText('试玩需要至少 2 个出生点');
      return;
    }
    try {
      buildMazeFromLayout(layout, 0);
      saveStoredMaze(layout);
      const roster = Math.min(4, Math.max(2, layout.spawns.length));
      this.scene.start('game', {
        mode: 'local',
        withBots: true,
        fillBots: true,
        matchMode: 'classic',
        rosterSize: roster,
        customMaze: layout,
      });
    } catch (e) {
      this.statusText?.setText(`无法试玩：${(e as Error).message}`);
    }
  }
}
