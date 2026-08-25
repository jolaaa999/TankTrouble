import Phaser from 'phaser';
import { GAME, type WeaponKind } from '@tanktrouble/shared';

/** Classic Tank Trouble–style tank with weapon-dependent attachments. */
export class TankView {
  readonly body: Phaser.GameObjects.Container;
  private readonly hull: Phaser.GameObjects.Graphics;
  private readonly gear: Phaser.GameObjects.Graphics;
  private readonly shieldRing: Phaser.GameObjects.Graphics;
  private readonly badge: Phaser.GameObjects.Text;
  private readonly aiTag: Phaser.GameObjects.Text;
  private readonly colorIndex: number;
  private lastWeapon: WeaponKind = 'default';
  private lastShield = false;
  private lastBot = false;

  constructor(scene: Phaser.Scene, colorIndex: number) {
    this.colorIndex = colorIndex;
    this.hull = scene.add.graphics();
    this.gear = scene.add.graphics();
    this.shieldRing = scene.add.graphics();
    this.badge = scene.add
      .text(0, -26, '', {
        fontFamily: 'Courier New, monospace',
        fontSize: '12px',
        color: '#111111',
        backgroundColor: '#ffe082',
        padding: { x: 3, y: 1 },
      })
      .setOrigin(0.5)
      .setVisible(false);
    this.aiTag = scene.add
      .text(0, 22, 'AI', {
        fontFamily: 'Segoe UI, sans-serif',
        fontSize: '10px',
        color: '#ffffff',
        backgroundColor: '#546e7a',
        padding: { x: 3, y: 1 },
      })
      .setOrigin(0.5)
      .setVisible(false);

    this.drawHull();
    this.body = scene.add.container(0, 0, [
      this.hull,
      this.gear,
      this.shieldRing,
      this.badge,
      this.aiTag,
    ]);
  }

  setPose(
    x: number,
    y: number,
    angle: number,
    alive: boolean,
    shieldTime = 0,
    weapon: WeaponKind = 'default',
    isBot = false,
    turboTime = 0,
    freezeTime = 0,
  ): void {
    this.body.setPosition(x, y);
    this.body.setRotation(angle);
    this.badge.setRotation(-angle);
    this.aiTag.setRotation(-angle);
    this.body.setAlpha(alive ? (freezeTime > 0 ? 0.65 : 1) : 0.2);
    this.aiTag.setVisible(alive && isBot);

    const hasShield = alive && shieldTime > 0;
    if (
      weapon !== this.lastWeapon ||
      hasShield !== this.lastShield ||
      isBot !== this.lastBot
    ) {
      this.lastWeapon = weapon;
      this.lastShield = hasShield;
      this.lastBot = isBot;
      this.drawGear(weapon);
    }

    this.shieldRing.clear();
    if (hasShield) {
      this.shieldRing.lineStyle(3, 0x80deea, 0.9);
      this.shieldRing.strokeCircle(0, 0, GAME.tankRadius + 7);
      this.shieldRing.lineStyle(1, 0xe0f7fa, 0.5);
      this.shieldRing.strokeCircle(0, 0, GAME.tankRadius + 10);
    }
    if (alive && turboTime > 0) {
      this.shieldRing.lineStyle(2, 0xff6d00, 0.85);
      this.shieldRing.strokeCircle(0, 0, GAME.tankRadius + 5);
    }
    if (alive && freezeTime > 0) {
      this.shieldRing.lineStyle(3, 0x82b1ff, 0.9);
      this.shieldRing.strokeCircle(0, 0, GAME.tankRadius + 9);
    }
  }

  private drawHull(): void {
    const color = GAME.playerColors[this.colorIndex % GAME.playerColors.length]!;
    const dark = GAME.playerColorDark[this.colorIndex % GAME.playerColorDark.length]!;
    const c = Phaser.Display.Color.HexStringToColor(color).color;
    const d = Phaser.Display.Color.HexStringToColor(dark).color;
    const g = this.hull;
    g.clear();
    // Tracks run parallel to facing (+X): above / below the hull
    g.fillStyle(0x2b2b2b, 1);
    g.fillRoundedRect(-14, -16, 28, 6, 2);
    g.fillRoundedRect(-14, 10, 28, 6, 2);
    // Hull elongated along facing direction
    g.fillStyle(d, 1);
    g.fillRoundedRect(-13, -11, 26, 22, 5);
    g.fillStyle(c, 1);
    g.fillRoundedRect(-11, -9, 22, 18, 4);
    // Hatch highlight
    g.fillStyle(0xffffff, 0.22);
    g.fillCircle(-2, 0, 4);
    // Barrel points +X (same as movement / rotation angle)
    g.fillStyle(d, 1);
    g.fillRoundedRect(6, -4, 14, 8, 2);
    g.fillStyle(0x1a1a1a, 1);
    g.fillRoundedRect(10, -2, 12, 4, 1);
  }

  private drawGear(weapon: WeaponKind): void {
    const g = this.gear;
    g.clear();

    const labels: Partial<Record<WeaponKind, string>> = {
      laser: 'L',
      shotgun: 'S',
      gatling: 'G',
      homing: 'H',
      booby: 'B',
      frag: 'F',
      deathray: 'D',
      freeze: 'Z',
      blink: 'W',
      emp: 'E',
      airstrike: 'A',
    };
    if (weapon !== 'default' && weapon !== 'turbo') {
      this.badge.setText(labels[weapon] ?? '?');
      this.badge.setVisible(true);
    } else {
      this.badge.setVisible(false);
    }

    switch (weapon) {
      case 'laser':
        g.fillStyle(0xb71c1c, 1);
        g.fillRoundedRect(4, -2, 30, 4, 1);
        g.fillStyle(0xff1744, 1);
        g.fillRoundedRect(8, -1, 28, 2, 1);
        break;
      case 'shotgun':
        g.fillStyle(0xe65100, 1);
        g.fillRoundedRect(4, -8, 18, 5, 1);
        g.fillRoundedRect(4, -2, 20, 4, 1);
        g.fillRoundedRect(4, 3, 18, 5, 1);
        break;
      case 'gatling':
        g.fillStyle(0x1b5e20, 1);
        g.fillRoundedRect(2, -7, 22, 14, 3);
        g.fillStyle(0x69f0ae, 1);
        for (let i = 0; i < 4; i++) {
          g.fillCircle(10 + i * 4, -3 + (i % 2) * 4, 2);
        }
        break;
      case 'homing':
        g.fillStyle(0x4527a0, 1);
        g.fillRoundedRect(4, -5, 22, 10, 2);
        g.fillStyle(0xea80fc, 1);
        g.fillTriangle(26, -5, 26, 5, 34, 0);
        break;
      case 'booby':
        g.fillStyle(0x5d4037, 1);
        g.fillRoundedRect(-22, -8, 12, 16, 2);
        g.fillStyle(0xff1744, 1);
        g.fillCircle(-16, 2, 2);
        break;
      case 'frag':
        g.fillStyle(0xf9a825, 1);
        g.fillRoundedRect(4, -6, 16, 12, 4);
        g.fillStyle(0x212121, 1);
        g.fillCircle(18, 0, 5);
        break;
      case 'deathray':
        g.fillStyle(0x4a148c, 1);
        g.fillRoundedRect(2, -6, 28, 12, 2);
        g.fillStyle(0xd500f9, 1);
        g.fillRoundedRect(6, -3, 26, 6, 1);
        g.fillCircle(34, 0, 4);
        break;
      case 'freeze':
        g.fillStyle(0x1565c0, 1);
        g.fillCircle(18, 0, 8);
        g.fillStyle(0xe3f2fd, 0.9);
        g.fillCircle(18, 0, 4);
        break;
      case 'blink':
        g.fillStyle(0x76ff03, 1);
        g.fillTriangle(8, -8, 8, 8, 28, 0);
        break;
      case 'emp':
        g.fillStyle(0xffd600, 1);
        g.fillRoundedRect(4, -6, 18, 12, 2);
        g.lineStyle(2, 0xff6f00, 1);
        g.strokeCircle(22, 0, 8);
        break;
      case 'airstrike':
        g.fillStyle(0xff1744, 1);
        g.fillTriangle(6, 8, 22, -10, 26, 8);
        break;
      default:
        break;
    }
  }

  destroy(): void {
    this.body.destroy(true);
  }
}
