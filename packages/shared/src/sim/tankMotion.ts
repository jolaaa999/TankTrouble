import { GAME } from '../config.js';
import type { InputMessage, WallSegment } from '../types.js';
import { forwardFromAngle, resolveCircleWalls } from './collide.js';

export type TankMotionState = {
  x: number;
  y: number;
  angle: number;
  freezeTime: number;
  turboTime: number;
  turboPlus: boolean;
};

/** Shared tank movement step (used by GameSim and online client prediction). */
export function stepTankMotion(
  tank: TankMotionState,
  input: Pick<InputMessage, 'left' | 'right' | 'forward' | 'back'>,
  walls: readonly WallSegment[],
  dt: number,
  steeringLocked = false,
): void {
  if (tank.freezeTime > 0) return;

  const speedMul =
    tank.turboTime > 0
      ? tank.turboPlus
        ? GAME.plusTurboSpeedMul
        : GAME.turboSpeedMul
      : 1;
  const turnMul =
    tank.turboTime > 0
      ? tank.turboPlus
        ? GAME.plusTurboTurnMul
        : GAME.turboTurnMul
      : 1;

  if (input.left) tank.angle -= GAME.tankTurnSpeed * turnMul * dt;
  if (input.right) tank.angle += GAME.tankTurnSpeed * turnMul * dt;

  if (steeringLocked) return;

  let move = 0;
  if (input.forward) move += 1;
  if (input.back) move -= 1;
  if (move === 0) return;

  const f = forwardFromAngle(tank.angle);
  tank.x += f.x * GAME.tankSpeed * speedMul * move * dt;
  tank.y += f.y * GAME.tankSpeed * speedMul * move * dt;
  const resolved = resolveCircleWalls(tank.x, tank.y, GAME.tankRadius + 6, walls);
  tank.x = resolved.x;
  tank.y = resolved.y;
}
