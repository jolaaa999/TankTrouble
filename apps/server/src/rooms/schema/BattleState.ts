import { Schema, type, MapSchema } from '@colyseus/schema';

export class PlayerState extends Schema {
  @type('string') id = '';
  @type('boolean') ready = false;
  @type('number') colorIndex = 0;
  @type('number') score = 0;
}

export class TankState extends Schema {
  @type('string') id = '';
  @type('number') x = 0;
  @type('number') y = 0;
  @type('number') angle = 0;
  @type('boolean') alive = true;
  @type('number') colorIndex = 0;
  @type('number') shieldTime = 0;
  @type('string') weapon = 'default';
  @type('number') ammo = 0;
  @type('boolean') showLaserSight = false;
  @type('boolean') isBot = false;
}

export class BulletState extends Schema {
  @type('number') id = 0;
  @type('number') x = 0;
  @type('number') y = 0;
  @type('number') vx = 0;
  @type('number') vy = 0;
  @type('string') kind = 'normal';
}

export class PickupState extends Schema {
  @type('number') id = 0;
  @type('string') kind = 'laser';
  @type('number') x = 0;
  @type('number') y = 0;
}

export class MineState extends Schema {
  @type('number') id = 0;
  @type('number') x = 0;
  @type('number') y = 0;
  @type('boolean') visible = true;
  @type('boolean') triggered = false;
}

export class BattleState extends Schema {
  @type('string') roomCode = '';
  @type('number') seed = 0;
  @type('string') phase: 'waiting' | 'playing' | 'intermission' | 'matchEnd' = 'waiting';
  @type('string') winnerId = '';
  @type('string') matchWinnerId = '';
  @type('number') roundIndex = 1;
  @type('number') intermissionLeft = 0;
  /** When true, GameSim pads humans with AI up to maxPlayers. */
  @type('boolean') fillWithBots = true;
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type({ map: TankState }) tanks = new MapSchema<TankState>();
  @type({ map: BulletState }) bullets = new MapSchema<BulletState>();
  @type({ map: PickupState }) pickups = new MapSchema<PickupState>();
  @type({ map: MineState }) mines = new MapSchema<MineState>();
  @type({ map: 'number' }) scores = new MapSchema<number>();
}
