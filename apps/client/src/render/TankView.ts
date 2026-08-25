import Phaser from 'phaser';
import { GAME, type WeaponKind } from '@tanktrouble/shared';

/** Classic Tank Trouble–style tank with weapon-dependent attachments. */
export class TankView {
  readonly body: Phaser.GameObjects.Container;
  private readonly hull: Phaser.GameObjects.Graphics;
  private readonly gear: Phaser.GameObjects.Graphics;
  private readonly shieldRing: Phaser.GameObjects.Graphics;
  private readonly badge: Phaser.GameObjects.Text;
  private readonly colorIndex: number;
  private lastWeapon: WeaponKind | 'shield-only' = 'default';
  private lastShield = false;

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

    this.drawHull();
    this.body = scene.add.container(0, 0, [
      this.hull,
      this.gear,
      this.shieldRing,
      this.badge,
    ]);
  }

  setPose(
    x: number,
    y: number,
    angle: number,
    alive: boolean,
    shieldTime = 0,
    weapon: WeaponKind = 'default',
  ): void {
    this.body.setPosition(x, y);
    this.body.setRotation(angle);
    this.body.setAlpha(alive ? 1 : 0.2);

    const hasShield = alive && shieldTime > 0;
    if (weapon !== this.lastWeapon || hasShield !== this.lastShield) {
      this.lastWeapon = weapon;
      this.lastShield = hasShield;
      this.drawGear(weapon, hasShield);
    }

    this.shieldRing.clear();
    if (hasShield) {
      this.shieldRing.lineStyle(3, 0x80deea, 0.9);
      this.shieldRing.strokeCircle(0, 0, GAME.tankRadius + 7);
      this.shieldRing.lineStyle(1, 0xe0f7fa, 0.5);
      this.shieldRing.strokeCircle(0, 0, GAME.tankRadius + 10);
    }
  }

  private drawHull(): void {
    const color = GAME.playerColors[this.colorIndex % GAME.playerColors.length]!;
    const dark = GAME.playerColorDark[this.colorIndex % GAME.playerColorDark.length]!;
    const c = Phaser.Display.Color.HexStringToColor(color).color;
    const d = Phaser.Display.Color.HexStringToColor(dark).color;
    const g = this.hull;
    g.clear();
    g.fillStyle(0x2b2b2b, 1);
    g.fillRoundedRect(-16, -14, 6, 28, 2);
    g.fillRoundedRect(10, -14, 6, 28, 2);
    g.fillStyle(d, 1);
    g.fillRoundedRect(-12, -12, 24, 24, 6);
    g.fillStyle(c, 1);
    g.fillRoundedRect(-10, -10, 20, 20, 5);
    g.fillStyle(0xffffff, 0.22);
    g.fillCircle(-2, -2, 4);
    // default short barrel
    g.fillStyle(d, 1);
    g.fillRoundedRect(4, -4, 14, 8, 2);
    g.fillStyle(0x1a1a1a, 1);
    g.fillRoundedRect(6, -2, 12, 4, 1);
  }

  private drawGear(weapon: WeaponKind, _hasShield: boolean): void {
    const g = this.gear;
    g.clear();
    this.badge.setVisible(weapon !== 'default');

    const labels: Partial<Record<WeaponKind, string>> = {
      laser: 'L',
      shotgun: 'S',
      gatling: 'G',
      homing: 'H',
      booby: 'B',
      frag: 'F',
      deathray: 'D',
    };
    if (weapon !== 'default') {
      this.badge.setText(labels[weapon] ?? '?');
      this.badge.setVisible(true);
    }

    switch (weapon) {
      case 'laser':
        // long thin red barrel + tip glow
        g.fillStyle(0xb71c1c, 1);
        g.fillRoundedRect(4, -3, 26, 6, 1);
        g.fillStyle(0xff1744, 1);
        g.fillCircle(30, 0, 3);
        g.lineStyle(1, 0xff8a80, 0.8);
        g.strokeCircle(30, 0, 5);
        break;
      case 'shotgun':
        // triple muzzle
        g.fillStyle(0xe65100, 1);
        g.fillRoundedRect(4, -8, 18, 5, 1);
        g.fillRoundedRect(4, -2, 20, 4, 1);
        g.fillRoundedRect(4, 3, 18, 5, 1);
        break;
      case 'gatling':
        // rotary multi-barrel
        g.fillStyle(0x1b5e20, 1);
        g.fillRoundedRect(2, -7, 22, 14, 3);
        g.fillStyle(0x69f0ae, 1);
        for (let i = 0; i < 4; i++) {
          g.fillCircle(10 + i * 4, -3 + (i % 2) * 4, 2);
        }
        break;
      case 'homing':
        // missile rack on side + nose cone
        g.fillStyle(0x4527a0, 1);
        g.fillRoundedRect(4, -5, 22, 10, 2);
        g.fillStyle(0xea80fc, 1);
        g.fillTriangle(26, -5, 26, 5, 34, 0);
        g.fillStyle(0xffffff, 0.5);
        g.fillCircle(12, 0, 2);
        break;
      case 'booby':
        // mine crate on rear
        g.fillStyle(0x5d4037, 1);
        g.fillRoundedRect(-22, -8, 12, 16, 2);
        g.fillStyle(0xffcc80, 1);
        g.fillTriangle(-16, -10, -20, -4, -12, -4);
        g.fillStyle(0xff1744, 1);
        g.fillCircle(-16, 2, 2);
        break;
      case 'frag':
        // fat bomb barrel
        g.fillStyle(0xf9a825, 1);
        g.fillRoundedRect(4, -6, 16, 12, 4);
        g.fillStyle(0x212121, 1);
        g.fillCircle(18, 0, 5);
        g.lineStyle(2, 0xffea00, 1);
        g.strokeCircle(18, 0, 7);
        break;
      case 'deathray':
        // oversized glowing cannon
        g.fillStyle(0x4a148c, 1);
        g.fillRoundedRect(2, -6, 28, 12, 2);
        g.fillStyle(0xd500f9, 1);
        g.fillRoundedRect(6, -3, 26, 6, 1);
        g.fillStyle(0xea80fc, 0.9);
        g.fillCircle(34, 0, 4);
        g.lineStyle(2, 0xf3e5f5, 0.7);
        g.strokeCircle(34, 0, 7);
        break;
      default:
        // keep hull default barrel only
        break;
    }
  }

  destroy(): void {
    this.body.destroy(true);
  }
}
