import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { MazeEditorScene } from './scenes/MazeEditorScene';
import { GameScene } from './scenes/GameScene';
import { HallScene } from './scenes/HallScene';
import { LobbyScene } from './scenes/LobbyScene';
import { ResultScene } from './scenes/ResultScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.WEBGL,
  parent: 'game',
  backgroundColor: '#1b2430',
  width: 1280,
  height: 800,
  fps: {
    target: 60,
    min: 30,
    forceSetTimeOut: false,
    smoothStep: true,
  },
  render: {
    antialias: true,
    roundPixels: true,
    powerPreference: 'high-performance',
    batchSize: 4096,
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 1280,
    height: 800,
    zoom: 1,
    autoRound: true,
  },
  // Skip unused Phaser systems for less overhead
  physics: undefined,
  scene: [BootScene, MenuScene, MazeEditorScene, HallScene, LobbyScene, GameScene, ResultScene],
  callbacks: {
    postBoot: (game) => {
      const canvas = game.canvas;
      if (canvas) canvas.style.imageRendering = 'auto';
      game.loop.targetFps = 60;
    },
  },
};

// eslint-disable-next-line no-new
new Phaser.Game(config);
