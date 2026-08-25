/** A–Z skill registry: one skill per letter, each with a `_plus` pickup variant. */
export const SKILL_IDS = [
  'airstrike',
  'booby',
  'cannon',
  'deathray',
  'emp',
  'frag',
  'gatling',
  'homing',
  'invis',
  'dash',
  'knockback',
  'laser',
  'magnet',
  'nova',
  'shield',
  'pierce',
  'quad',
  'rail',
  'shotgun',
  'turbo',
  'umbrella',
  'vortex',
  'blink',
  'xsplit',
  'yard',
  'freeze',
] as const;

export type SkillId = (typeof SKILL_IDS)[number];
export type WeaponKind = SkillId | 'default';
export type PickupKind = SkillId | `${SkillId}_plus`;

export type SkillDef = {
  letter: string;
  label: string;
  color: number;
  /** Applied on pickup — no weapon slot. */
  instant: boolean;
};

export const SKILLS: Record<SkillId, SkillDef> = {
  airstrike: { letter: 'A', label: '空袭', color: 0xff5252, instant: false },
  booby: { letter: 'B', label: '地雷', color: 0x795548, instant: false },
  cannon: { letter: 'C', label: '重炮', color: 0x455a64, instant: false },
  deathray: { letter: 'D', label: '死光', color: 0xd500f9, instant: false },
  emp: { letter: 'E', label: '电磁', color: 0xffd740, instant: false },
  frag: { letter: 'F', label: '破片', color: 0xffea00, instant: false },
  gatling: { letter: 'G', label: '加特林', color: 0x00e676, instant: false },
  homing: { letter: 'H', label: '追踪', color: 0x651fff, instant: false },
  invis: { letter: 'I', label: '隐身', color: 0xb0bec5, instant: false },
  dash: { letter: 'J', label: '突进', color: 0xaeea00, instant: false },
  knockback: { letter: 'K', label: '冲击', color: 0xff6f00, instant: false },
  laser: { letter: 'L', label: '激光', color: 0xff1744, instant: false },
  magnet: { letter: 'M', label: '磁力', color: 0x7e57c2, instant: false },
  nova: { letter: 'N', label: '星爆', color: 0xff4081, instant: false },
  shield: { letter: 'O', label: '护盾', color: 0x00e5ff, instant: true },
  pierce: { letter: 'P', label: '穿透', color: 0x26a69a, instant: false },
  quad: { letter: 'Q', label: '四连', color: 0x8d6e63, instant: false },
  rail: { letter: 'R', label: '轨道炮', color: 0x18ffff, instant: false },
  shotgun: { letter: 'S', label: '散弹', color: 0xff9100, instant: false },
  turbo: { letter: 'T', label: '加速', color: 0xff6d00, instant: true },
  umbrella: { letter: 'U', label: '伞盾', color: 0x4dd0e1, instant: false },
  vortex: { letter: 'V', label: '漩涡', color: 0x5c6bc0, instant: false },
  blink: { letter: 'W', label: '闪现', color: 0xb2ff59, instant: false },
  xsplit: { letter: 'X', label: '分裂', color: 0xce93d8, instant: false },
  yard: { letter: 'Y', label: '雷区', color: 0x6d4c41, instant: false },
  freeze: { letter: 'Z', label: '冰冻', color: 0x82b1ff, instant: false },
};

export const PICKUP_POOL: readonly PickupKind[] = SKILL_IDS.flatMap((id) => [
  id,
  `${id}_plus` as PickupKind,
]);

export function isSkillId(kind: string): kind is SkillId {
  return (SKILL_IDS as readonly string[]).includes(kind);
}

export function parsePickup(kind: string): { skillId: SkillId; plus: boolean } | null {
  if (isSkillId(kind)) return { skillId: kind, plus: false };
  if (kind.endsWith('_plus')) {
    const base = kind.slice(0, -5);
    if (isSkillId(base)) return { skillId: base, plus: true };
  }
  return null;
}

export function pickupKind(skillId: SkillId, plus: boolean): PickupKind {
  return plus ? (`${skillId}_plus` as PickupKind) : skillId;
}

export function skillLetter(skillId: SkillId): string {
  return SKILLS[skillId].letter;
}

export function skillDisplayLabel(skillId: SkillId | string, plus = false): string {
  if (skillId === 'fragDetonate') return '引爆';
  if (skillId === 'default') return '炮弹';
  if (!isSkillId(skillId)) return skillId;
  return plus ? `${SKILLS[skillId].label}+` : SKILLS[skillId].label;
}

export function pickupDisplayLabel(kind: PickupKind): string {
  const parsed = parsePickup(kind);
  if (!parsed) return kind;
  return skillDisplayLabel(parsed.skillId, parsed.plus);
}

export function pickupLetter(kind: PickupKind): string {
  const parsed = parsePickup(kind);
  if (!parsed) return '?';
  const letter = skillLetter(parsed.skillId);
  return parsed.plus ? `${letter}+` : letter;
}
