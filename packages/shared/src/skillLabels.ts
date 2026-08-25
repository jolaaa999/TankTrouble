import type { PickupKind, SkillId, WeaponKind } from './skills.js';
import { skillDisplayLabel, pickupDisplayLabel } from './skills.js';

/** Chinese display names shown when a skill is cast / applied. */
export const SKILL_LABELS: Record<string, string> = {
  default: '炮弹',
  fragDetonate: '引爆',
};

export function skillLabel(
  kind: WeaponKind | PickupKind | SkillId | string,
  plus = false,
): string {
  if (kind.endsWith('_plus')) {
    const base = kind.slice(0, -5);
    return skillDisplayLabel(base, true);
  }
  return skillDisplayLabel(kind, plus);
}

export { pickupDisplayLabel };
