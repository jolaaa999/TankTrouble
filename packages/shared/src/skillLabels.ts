import type { PickupKind, WeaponKind } from './config.js';

/** Chinese display names shown when a skill is cast / applied. */
export const SKILL_LABELS: Record<string, string> = {
  default: '炮弹',
  laser: '激光',
  shotgun: '散弹',
  gatling: '加特林',
  homing: '追踪',
  booby: '地雷',
  frag: '破片',
  fragDetonate: '引爆',
  deathray: '死光',
  shield: '护盾',
  turbo: '加速',
  freeze: '冰冻',
  blink: '闪现',
  emp: '电磁脉冲',
  airstrike: '空袭',
  cannon: '重炮',
  nova: '星爆',
  rail: '轨道炮',
};

export function skillLabel(kind: WeaponKind | PickupKind | string): string {
  return SKILL_LABELS[kind] ?? kind;
}
