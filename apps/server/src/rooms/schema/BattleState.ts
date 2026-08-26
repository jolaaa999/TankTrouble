import { Schema, type, MapSchema } from '@colyseus/schema';

export class PlayerState extends Schema {
  @type('string') id = '';
  @type('boolean') ready = false;
  @type('number') colorIndex = 0;
  @type('number') score = 0;
  @type('number') team = 0;
}

export class TankState extends Schema {
  @type('string') id = '';
  @type('number') x = 0;
  @type('number') y = 0;
  @type('number') angle = 0;
  @type('boolean') alive = true;
  @type('number') colorIndex = 0;
  @type('number') team = 0;
  @type('number') shieldTime = 0;
  @type('number') turboTime = 0;
  @type('boolean') turboPlus = false;
  @type('number') freezeTime = 0;
  @type('string') weapon = 'default';
  @type('boolean') weaponPlus = false;
  @type('number') ammo = 0;
  @type('boolean') showLaserSight = false;
  @type('boolean') isBot = false;
  @type('number') invisTime = 0;
  @type('number') umbrellaTime = 0;
}

export class BulletState extends Schema {
  @type('number') id = 0;
  @type('number') x = 0;
  @type('number') y = 0;
  @type('number') vx = 0;
  @type('number') vy = 0;
  @type('string') kind = 'normal';
  @type('string') ownerId = '';
}

export class BeamState extends Schema {
  @type('number') id = 0;
  @type('number') x1 = 0;
  @type('number') y1 = 0;
  @type('number') x2 = 0;
  @type('number') y2 = 0;
  @type('number') life = 0;
  @type('string') kind = 'laser';
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

export class HazardState extends Schema {
  @type('number') id = 0;
  @type('number') x = 0;
  @type('number') y = 0;
  @type('number') radius = 0;
  @type('number') timer = 0;
}

export class FxState extends Schema {
  @type('number') id = 0;
  @type('string') kind = 'muzzle';
  @type('number') x = 0;
  @type('number') y = 0;
  @type('number') life = 0;
  @type('number') maxLife = 0.35;
  @type('number') radius = 0;
  @type('number') colorIndex = 0;
  @type('string') label = '';
}

export class BattleState extends Schema {
  @type('string') roomCode = '';
  @type('number') seed = 0;
  @type('number') mazeCols = 11;
  @type('number') mazeRows = 7;
  @type('string') phase: 'waiting' | 'playing' | 'intermission' | 'matchEnd' = 'waiting';
  @type('string') winnerId = '';
  @type('string') matchWinnerId = '';
  @type('number') matchWinnerTeam = -1;
  @type('number') roundIndex = 1;
  @type('number') intermissionLeft = 0;
  @type('boolean') fillWithBots = false;
  /** classic | mega */
  @type('string') mode = 'classic';
  @type('number') rosterSize = 4;
  @type('number') scoreToWin = 5;
  @type('number') teamScore0 = 0;
  @type('number') teamScore1 = 0;
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type({ map: TankState }) tanks = new MapSchema<TankState>();
  @type({ map: BulletState }) bullets = new MapSchema<BulletState>();
  @type({ map: BeamState }) beams = new MapSchema<BeamState>();
  @type({ map: PickupState }) pickups = new MapSchema<PickupState>();
  @type({ map: MineState }) mines = new MapSchema<MineState>();
  @type({ map: HazardState }) hazards = new MapSchema<HazardState>();
  @type({ map: FxState }) fx = new MapSchema<FxState>();
  @type({ map: 'number' }) scores = new MapSchema<number>();
}
