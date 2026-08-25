import { describe, expect, it } from 'vitest';
import { PICKUP_POOL, SKILL_IDS, SKILLS, parsePickup, pickupLetter } from './skills.js';

describe('skills registry', () => {
  it('defines exactly 26 letter skills A–Z', () => {
    expect(SKILL_IDS).toHaveLength(26);
    const letters = SKILL_IDS.map((id) => SKILLS[id].letter);
    expect(new Set(letters).size).toBe(26);
    expect(letters.sort().join('')).toBe('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
  });

  it('includes base and plus variants in pickup pool', () => {
    expect(PICKUP_POOL).toHaveLength(52);
    const parsed = parsePickup('freeze_plus');
    expect(parsed).toEqual({ skillId: 'freeze', plus: true });
    expect(pickupLetter('laser_plus')).toBe('L+');
  });
});
