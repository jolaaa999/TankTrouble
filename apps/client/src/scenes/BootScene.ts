import Phaser from 'phaser';
import { getGameAudio } from '../audio/GameAudio';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  create(): void {
    const audio = getGameAudio();
    const unlock = () => void audio.unlock();
    this.input.once('pointerdown', unlock);
    this.input.keyboard?.once('keydown', unlock);
    this.scene.start('menu');
  }
}
