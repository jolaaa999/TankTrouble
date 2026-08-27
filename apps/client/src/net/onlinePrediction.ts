import { GAME, type InputMessage } from '@tanktrouble/shared';
import { stepTankMotion, type TankMotionState } from '@tanktrouble/shared';

export type WallSeg = { x1: number; y1: number; x2: number; y2: number; kind: 'h' | 'v' };
export type Pose2 = { x: number; y: number; angle: number };

export type ServerTankSample = {
  x: number;
  y: number;
  angle: number;
  alive: boolean;
  freezeTime: number;
  turboTime: number;
  turboPlus: boolean;
};

function lerpAngle(from: number, to: number, t: number): number {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return from + d * t;
}

function poseLerp(a: Pose2, b: Pose2, t: number): Pose2 {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    angle: lerpAngle(a.angle, b.angle, t),
  };
}

function copyMotion(server: ServerTankSample): TankMotionState {
  return {
    x: server.x,
    y: server.y,
    angle: server.angle,
    freezeTime: server.freezeTime,
    turboTime: server.turboTime,
    turboPlus: server.turboPlus,
  };
}

/**
 * Client-side prediction aligned to server 60Hz ticks.
 * - Simulation + input send share one tick clock (matches BattleRoom).
 * - Display interpolates between tick poses for smooth high-FPS rendering.
 */
export class OnlineSelfPredictor {
  predicted: TankMotionState | null = null;
  private prevPose: Pose2 | null = null;
  tickAcc = 0;
  inputBuffer: InputMessage[] = [];
  private lastReconciledInputSeq = -1;
  private seqSentAt = new Map<number, number>();
  private seq = 0;
  rttMs = 80;

  readonly fixedDt = 1 / GAME.tickHz;
  private readonly maxInputBuffer = 90;
  private readonly maxReplaySteps = 24;
  private readonly desyncSnapPx = 44;

  reset(): void {
    this.predicted = null;
    this.prevPose = null;
    this.tickAcc = 0;
    this.inputBuffer = [];
    this.lastReconciledInputSeq = -1;
    this.seqSentAt.clear();
    this.seq = 0;
    this.rttMs = 80;
  }

  getDisplayPose(): Pose2 | null {
    if (!this.predicted) return null;
    const cur: Pose2 = {
      x: this.predicted.x,
      y: this.predicted.y,
      angle: this.predicted.angle,
    };
    if (!this.prevPose) return cur;
    const t = Math.min(1, this.tickAcc / this.fixedDt);
    return poseLerp(this.prevPose, cur, t);
  }

  private tickBuffs(dt: number): void {
    if (!this.predicted) return;
    this.predicted.freezeTime = Math.max(0, this.predicted.freezeTime - dt);
    this.predicted.turboTime = Math.max(0, this.predicted.turboTime - dt);
    if (this.predicted.turboTime <= 0) this.predicted.turboPlus = false;
  }

  reconcile(
    serverMe: ServerTankSample,
    lastInputSeq: number,
    walls: readonly WallSeg[],
    steeringLocked: boolean,
  ): void {
    if (!serverMe.alive) {
      this.predicted = copyMotion(serverMe);
      this.prevPose = { x: serverMe.x, y: serverMe.y, angle: serverMe.angle };
      this.inputBuffer = [];
      this.lastReconciledInputSeq = -1;
      this.tickAcc = 0;
      return;
    }

    const err =
      this.predicted != null
        ? Math.hypot(serverMe.x - this.predicted.x, serverMe.y - this.predicted.y)
        : 0;
    const needsFull =
      this.predicted == null ||
      lastInputSeq !== this.lastReconciledInputSeq ||
      err > this.desyncSnapPx;

    if (!needsFull) {
      if (this.predicted) {
        this.predicted.freezeTime = serverMe.freezeTime;
        this.predicted.turboTime = serverMe.turboTime;
        this.predicted.turboPlus = serverMe.turboPlus;
      }
      return;
    }

    if (lastInputSeq > this.lastReconciledInputSeq) {
      const sentAt = this.seqSentAt.get(lastInputSeq);
      if (sentAt != null) {
        const sample = performance.now() - sentAt;
        this.rttMs = this.rttMs * 0.8 + sample * 0.2;
      }
    }
    this.lastReconciledInputSeq = lastInputSeq;

    this.predicted = copyMotion(serverMe);
    this.prevPose = { x: serverMe.x, y: serverMe.y, angle: serverMe.angle };

    if (walls.length === 0) {
      this.tickAcc = 0;
      return;
    }

    const pending = this.inputBuffer.filter((i) => i.seq > lastInputSeq);
    if (pending.length > this.maxReplaySteps) {
      this.inputBuffer = this.inputBuffer.filter((i) => i.seq > lastInputSeq);
      this.tickAcc = 0;
      return;
    }

    const replayStart: Pose2 = { x: serverMe.x, y: serverMe.y, angle: serverMe.angle };

    for (const input of pending) {
      this.tickBuffs(this.fixedDt);
      if (this.predicted.freezeTime > 0) break;
      stepTankMotion(this.predicted, input, walls, this.fixedDt, steeringLocked);
    }

    this.inputBuffer = this.inputBuffer.filter((i) => i.seq > lastInputSeq);
    this.prevPose = replayStart;
    this.tickAcc = 0;
  }

  /**
   * Advance simulation at fixed Hz; emit one input message per tick (same rate as server).
   */
  advance(
    frameDt: number,
    readInput: () => Omit<InputMessage, 'seq'>,
    walls: readonly WallSeg[],
    steeringLocked: boolean,
    send: (msg: InputMessage) => void,
    alive: boolean,
  ): void {
    if (!alive || !this.predicted || walls.length === 0) return;

    this.tickAcc += Math.min(0.05, frameDt);
    if (this.tickAcc > 0.15) this.tickAcc = 0.15;

    while (this.tickAcc >= this.fixedDt) {
      this.prevPose = {
        x: this.predicted.x,
        y: this.predicted.y,
        angle: this.predicted.angle,
      };

      this.seq += 1;
      const msg: InputMessage = { seq: this.seq, ...readInput() };
      send(msg);
      this.pushBuffer(msg);
      this.seqSentAt.set(msg.seq, performance.now());
      if (this.seqSentAt.size > 128) {
        const oldest = this.seq - 128;
        for (const k of this.seqSentAt.keys()) {
          if (k < oldest) this.seqSentAt.delete(k);
        }
      }

      this.tickBuffs(this.fixedDt);
      if (this.predicted.freezeTime <= 0) {
        stepTankMotion(this.predicted, msg, walls, this.fixedDt, steeringLocked);
      }

      this.tickAcc -= this.fixedDt;
    }
  }

  syncBuffs(freezeTime: number, turboTime: number, turboPlus: boolean): void {
    if (!this.predicted) return;
    this.predicted.freezeTime = freezeTime;
    this.predicted.turboTime = turboTime;
    this.predicted.turboPlus = turboPlus;
  }

  private pushBuffer(msg: InputMessage): void {
    this.inputBuffer.push(msg);
    if (this.inputBuffer.length > this.maxInputBuffer) {
      this.inputBuffer.splice(0, this.inputBuffer.length - this.maxInputBuffer);
    }
  }
}
