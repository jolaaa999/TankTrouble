import { Schema, type, MapSchema } from '@colyseus/schema';

export class PlayerState extends Schema {
  @type('string') id = '';
  @type('boolean') ready = false;
  @type('number') colorIndex = 0;
}

export class TankState extends Schema {
  @type('string') id = '';
  @type('number') x = 0;
  @type('number') y = 0;
  @type('number') angle = 0;
  @type('boolean') alive = true;
  @type('number') colorIndex = 0;
}

export class BulletState extends Schema {
  @type('number') id = 0;
  @type('number') x = 0;
  @type('number') y = 0;
  @type('number') vx = 0;
  @type('number') vy = 0;
}

export class BattleState extends Schema {
  @type('string') roomCode = '';
  @type('number') seed = 0;
  @type('string') phase: 'waiting' | 'playing' | 'ended' = 'waiting';
  @type('string') winnerId = '';
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type({ map: TankState }) tanks = new MapSchema<TankState>();
  @type({ map: BulletState }) bullets = new MapSchema<BulletState>();
}
