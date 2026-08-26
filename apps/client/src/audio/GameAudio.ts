import {
  SKILLS,
  SKILL_IDS,
  type SimEvent,
  type SkillId,
  type WeaponKind,
} from '@tanktrouble/shared';

type BgmMode = 'menu' | 'battle' | 'none';

let shared: GameAudio | null = null;

export function getGameAudio(): GameAudio {
  if (!shared) shared = new GameAudio();
  return shared;
}

/** Map Chinese announce labels back to skill ids. */
const labelToSkill = new Map<string, SkillId | 'fragDetonate' | 'default'>();
for (const id of SKILL_IDS) {
  labelToSkill.set(SKILLS[id].label, id);
  labelToSkill.set(`${SKILLS[id].label}+`, id);
}
labelToSkill.set('引爆', 'fragDetonate');
labelToSkill.set('炮弹', 'default');

export class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private bgmGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private unlocked = false;
  private bgmMode: BgmMode = 'none';
  private bgmTimer: ReturnType<typeof setInterval> | null = null;
  private bgmOscs: OscillatorNode[] = [];
  private bgmMelody: { f: number; d: number; vol?: number }[] = [];
  private bgmStep = 0;
  private bgmBeatMs = 280;
  private seenFxIds = new Set<number>();
  private tankAlive = new Map<string, boolean>();
  private tankPrevPos = new Map<string, { x: number; y: number }>();
  private tankMoveCd = new Map<string, number>();
  private prevPickupIds = new Set<number>();
  private gatlingUntil = 0;

  async unlock(): Promise<void> {
    if (this.unlocked) return;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.bgmGain = this.ctx.createGain();
    this.sfxGain = this.ctx.createGain();
    this.bgmGain.gain.value = 0.22;
    this.sfxGain.gain.value = 0.55;
    this.master.gain.value = 0.85;
    this.bgmGain.connect(this.master);
    this.sfxGain.connect(this.master);
    this.master.connect(this.ctx.destination);
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    this.unlocked = true;
  }

  resetBattleState(): void {
    this.seenFxIds.clear();
    this.tankAlive.clear();
    this.tankPrevPos.clear();
    this.tankMoveCd.clear();
    this.prevPickupIds.clear();
    this.gatlingUntil = 0;
  }

  startMenuBgm(): void {
    this.startBgm('menu');
  }

  startBattleBgm(): void {
    this.startBgm('battle');
  }

  stopBgm(): void {
    this.bgmMode = 'none';
    if (this.bgmTimer !== null) {
      clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }
    for (const o of this.bgmOscs) {
      try {
        o.stop();
      } catch {
        /* already stopped */
      }
      o.disconnect();
    }
    this.bgmOscs = [];
    this.bgmMelody = [];
    this.bgmStep = 0;
  }

  handleSimEvents(events: SimEvent[]): void {
    for (const e of events) {
      if (e.type === 'bounce') this.playBounce();
      if (e.type === 'pickup') this.playPickup();
      if (e.type === 'roundEnd') this.playRoundEnd();
    }
  }

  processFx(
    fx: {
      id: number;
      kind: string;
      radius: number;
      label?: string;
    }[],
  ): void {
    const now = performance.now();
    for (const f of fx) {
      if (this.seenFxIds.has(f.id)) continue;
      this.seenFxIds.add(f.id);

      if (f.kind === 'announce') {
        const label = f.label ?? '';
        if (label.startsWith('加特林')) this.gatlingUntil = now + 2500;
        this.playSkillFromLabel(label);
      } else if (f.kind === 'muzzle') {
        this.playShoot(now < this.gatlingUntil ? 'gatling' : 'default');
      } else if (f.kind === 'boom') {
        this.playExplosion(f.radius >= 40 ? 'large' : 'small');
      }
    }

    if (this.seenFxIds.size > 600) {
      const live = new Set(fx.map((f) => f.id));
      for (const id of this.seenFxIds) {
        if (!live.has(id)) this.seenFxIds.delete(id);
      }
    }
  }

  processTanks(
    tanks: { id: string; x: number; y: number; alive: boolean }[],
    dt: number,
  ): void {
    for (const t of tanks) {
      if (!t.alive) {
        if (this.tankAlive.get(t.id) === true) this.playDeath();
        this.tankAlive.set(t.id, false);
        continue;
      }

      const prev = this.tankPrevPos.get(t.id);
      if (prev) {
        const dist = Math.hypot(t.x - prev.x, t.y - prev.y);
        if (dist > 0.4) {
          let cd = this.tankMoveCd.get(t.id) ?? 0;
          cd -= dt;
          if (cd <= 0) {
            this.playMove(Math.min(1, dist / 8));
            this.tankMoveCd.set(t.id, 0.11);
          } else {
            this.tankMoveCd.set(t.id, cd);
          }
        }
      }
      this.tankPrevPos.set(t.id, { x: t.x, y: t.y });
      this.tankAlive.set(t.id, true);
    }
  }

  processPickups(pickups: { id: number }[]): void {
    const live = new Set(pickups.map((p) => p.id));
    for (const id of this.prevPickupIds) {
      if (!live.has(id)) this.playPickup();
    }
    this.prevPickupIds = live;
  }

  resetPickups(): void {
    this.prevPickupIds.clear();
  }

  playSkillFromLabel(label: string): void {
    const key = labelToSkill.get(label);
    if (key && key !== 'default' && key !== 'fragDetonate') {
      this.playSkill(key);
      return;
    }
    if (key === 'fragDetonate') {
      this.playExplosion('small');
      return;
    }
  }

  playShoot(kind: WeaponKind | 'gatling' | 'default' = 'default'): void {
    if (kind === 'gatling') {
      this.tone(880, 0.025, 'square', 0.08);
      return;
    }
    if (kind === 'cannon' || kind === 'rail') {
      this.noise(0.12, 0.35, 180, 0.22);
      this.tone(90, 0.15, 'sine', 0.2);
      return;
    }
    this.noise(0.05, 0.5, 900, 0.18);
    this.tone(160, 0.06, 'triangle', 0.12);
  }

  playSkill(skill: SkillId): void {
    switch (skill) {
      case 'laser':
        this.sweep(1200, 220, 0.18, 'sawtooth', 0.2);
        break;
      case 'freeze':
        this.tone(880, 0.08, 'sine', 0.12);
        this.tone(660, 0.12, 'sine', 0.1, 0.06);
        this.tone(440, 0.16, 'triangle', 0.08, 0.12);
        break;
      case 'blink':
      case 'dash':
        this.sweep(600, 1400, 0.1, 'sine', 0.16);
        this.sweep(1400, 400, 0.08, 'sine', 0.1, 0.08);
        break;
      case 'emp':
        this.noise(0.2, 0.2, 400, 0.22);
        this.tone(120, 0.25, 'square', 0.08);
        break;
      case 'airstrike':
        this.sweep(200, 80, 0.35, 'sawtooth', 0.18);
        this.noise(0.25, 0.15, 200, 0.15, 0.12);
        break;
      case 'shotgun':
        this.noise(0.08, 0.35, 700, 0.2);
        this.tone(120, 0.05, 'triangle', 0.1, 0.02);
        this.tone(90, 0.05, 'triangle', 0.08, 0.04);
        break;
      case 'homing':
        this.sweep(400, 900, 0.14, 'sine', 0.14);
        break;
      case 'frag':
        this.tone(300, 0.08, 'square', 0.12);
        this.noise(0.06, 0.4, 500, 0.1, 0.04);
        break;
      case 'gatling':
        this.tone(700, 0.06, 'square', 0.1);
        break;
      case 'deathray':
        this.sweep(200, 1800, 0.28, 'sawtooth', 0.22);
        break;
      case 'cannon':
        this.noise(0.14, 0.25, 160, 0.28);
        this.tone(70, 0.2, 'sine', 0.18);
        break;
      case 'nova':
        this.chord([523, 659, 784], 0.2, 0.14);
        this.noise(0.1, 0.35, 1200, 0.12, 0.05);
        break;
      case 'rail':
        this.sweep(1800, 120, 0.12, 'square', 0.2);
        this.noise(0.08, 0.6, 2000, 0.1);
        break;
      case 'invis':
        this.sweep(800, 200, 0.22, 'sine', 0.1);
        break;
      case 'knockback':
        this.tone(180, 0.1, 'square', 0.2);
        this.noise(0.08, 0.3, 300, 0.15, 0.04);
        break;
      case 'magnet':
        this.sweep(300, 700, 0.2, 'sine', 0.14);
        this.sweep(700, 300, 0.2, 'sine', 0.1, 0.08);
        break;
      case 'pierce':
        this.tone(520, 0.06, 'triangle', 0.14);
        this.sweep(520, 980, 0.1, 'triangle', 0.1, 0.04);
        break;
      case 'quad':
        for (let i = 0; i < 4; i++) this.tone(440 + i * 40, 0.04, 'square', 0.08, i * 0.03);
        break;
      case 'umbrella':
        this.chord([440, 554, 659], 0.25, 0.12);
        break;
      case 'vortex':
        this.sweep(900, 200, 0.3, 'triangle', 0.14);
        this.sweep(200, 900, 0.25, 'triangle', 0.1, 0.12);
        break;
      case 'xsplit':
        this.tone(660, 0.05, 'square', 0.12);
        this.tone(880, 0.05, 'square', 0.1, 0.04);
        break;
      case 'yard':
      case 'booby':
        this.tone(220, 0.08, 'square', 0.14);
        this.tone(180, 0.1, 'triangle', 0.1, 0.05);
        break;
      case 'shield':
        this.chord([523, 659, 880], 0.18, 0.12);
        break;
      case 'turbo':
        this.sweep(300, 800, 0.12, 'sawtooth', 0.14);
        break;
      default:
        this.tone(440, 0.08, 'sine', 0.1);
    }
  }

  playExplosion(size: 'small' | 'large'): void {
    const dur = size === 'large' ? 0.35 : 0.22;
    const gain = size === 'large' ? 0.32 : 0.22;
    this.noise(dur, 0.12, size === 'large' ? 120 : 220, gain);
    this.tone(size === 'large' ? 60 : 90, dur * 0.7, 'sine', gain * 0.7);
  }

  playDeath(): void {
    this.sweep(420, 80, 0.28, 'sawtooth', 0.2);
    this.noise(0.15, 0.2, 400, 0.15, 0.05);
  }

  playBounce(): void {
    this.tone(920, 0.04, 'triangle', 0.08);
  }

  playPickup(): void {
    this.tone(660, 0.06, 'sine', 0.1);
    this.tone(880, 0.08, 'sine', 0.1, 0.05);
  }

  playMove(speed: number): void {
    const vol = 0.04 + speed * 0.05;
    this.noise(0.035, 0.25, 180 + speed * 80, vol);
  }

  playRoundEnd(): void {
    this.chord([392, 494, 587], 0.35, 0.14);
  }

  private startBgm(mode: BgmMode): void {
    if (!this.unlocked || !this.ctx || !this.bgmGain) return;
    if (this.bgmMode === mode) return;
    this.stopBgm();
    this.bgmMode = mode;

    if (mode === 'menu') {
      this.bgmMelody = [
        { f: 523.25, d: 0.24 },
        { f: 659.25, d: 0.24 },
        { f: 783.99, d: 0.24 },
        { f: 987.77, d: 0.34 },
        { f: 783.99, d: 0.24 },
        { f: 659.25, d: 0.24 },
        { f: 523.25, d: 0.38 },
        { f: 0, d: 0.12 },
        { f: 587.33, d: 0.24 },
        { f: 698.46, d: 0.24 },
        { f: 880.0, d: 0.34 },
        { f: 698.46, d: 0.24 },
        { f: 587.33, d: 0.24 },
        { f: 523.25, d: 0.42 },
        { f: 0, d: 0.2 },
      ];
      this.bgmBeatMs = 300;
      this.startBgmBass(196.0, 0.055);
    } else {
      this.bgmMelody = [
        { f: 220.0, d: 0.16, vol: 0.07 },
        { f: 261.63, d: 0.16, vol: 0.07 },
        { f: 329.63, d: 0.16, vol: 0.075 },
        { f: 392.0, d: 0.22, vol: 0.08 },
        { f: 329.63, d: 0.16, vol: 0.075 },
        { f: 293.66, d: 0.16, vol: 0.07 },
        { f: 246.94, d: 0.24, vol: 0.065 },
        { f: 0, d: 0.08 },
        { f: 196.0, d: 0.16, vol: 0.07 },
        { f: 246.94, d: 0.16, vol: 0.075 },
        { f: 311.13, d: 0.16, vol: 0.08 },
        { f: 369.99, d: 0.22, vol: 0.085 },
        { f: 311.13, d: 0.16, vol: 0.08 },
        { f: 277.18, d: 0.16, vol: 0.075 },
        { f: 220.0, d: 0.28, vol: 0.07 },
        { f: 0, d: 0.1 },
      ];
      this.bgmBeatMs = 220;
      this.startBgmBass(110.0, 0.06);
    }

    this.bgmStep = 0;
    this.playBgmStep();
    this.bgmTimer = setInterval(() => this.playBgmStep(), this.bgmBeatMs);
  }

  private playBgmStep(): void {
    if (this.bgmMelody.length === 0) return;
    const note = this.bgmMelody[this.bgmStep % this.bgmMelody.length]!;
    this.bgmStep += 1;
    if (note.f <= 0) return;
    const wave = this.bgmMode === 'battle' ? 'square' : 'triangle';
    this.playBgmNote(note.f, note.d, note.vol ?? 0.085, wave);
  }

  private startBgmBass(rootHz: number, gain: number): void {
    if (!this.ctx || !this.bgmGain) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const lfo = this.ctx.createOscillator();
    const lfoG = this.ctx.createGain();
    o.type = 'sine';
    o.frequency.value = rootHz;
    lfo.type = 'sine';
    lfo.frequency.value = 0.12;
    lfoG.gain.value = rootHz * 0.04;
    lfo.connect(lfoG);
    lfoG.connect(o.frequency);
    g.gain.value = gain;
    o.connect(g);
    g.connect(this.bgmGain);
    lfo.start();
    o.start();
    this.bgmOscs.push(o, lfo);
  }

  private playBgmNote(
    freq: number,
    dur: number,
    gain: number,
    type: OscillatorType,
  ): void {
    if (!this.ctx || !this.bgmGain) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(this.bgmGain);
    o.start(t);
    o.stop(t + dur + 0.04);
  }

  private tone(
    freq: number,
    dur: number,
    type: OscillatorType,
    gain: number,
    delay = 0,
  ): void {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(this.sfxGain);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private sweep(
    f0: number,
    f1: number,
    dur: number,
    type: OscillatorType,
    gain: number,
    delay = 0,
  ): void {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(this.sfxGain);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private chord(freqs: number[], dur: number, gain: number, delay = 0): void {
    for (const f of freqs) this.tone(f, dur, 'sine', gain / freqs.length, delay);
  }

  private noise(
    dur: number,
    q: number,
    filterFreq: number,
    gain: number,
    delay = 0,
  ): void {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0)!;
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = filterFreq;
    filter.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.sfxGain);
    src.start(t);
    src.stop(t + dur + 0.02);
  }
}
