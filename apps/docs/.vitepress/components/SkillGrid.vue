<script setup lang="ts">
const skills = [
  { l: 'A', n: '空袭', c: '#ff5252' },
  { l: 'B', n: '地雷', c: '#795548' },
  { l: 'C', n: '重炮', c: '#455a64' },
  { l: 'D', n: '死光', c: '#d500f9' },
  { l: 'E', n: '电磁', c: '#ffd740' },
  { l: 'F', n: '破片', c: '#ffea00' },
  { l: 'G', n: '加特林', c: '#00e676' },
  { l: 'H', n: '追踪', c: '#651fff' },
  { l: 'I', n: '隐身', c: '#b0bec5' },
  { l: 'J', n: '突进', c: '#aeea00' },
  { l: 'K', n: '冲击', c: '#ff6f00' },
  { l: 'L', n: '激光', c: '#ff1744' },
  { l: 'M', n: '磁力', c: '#7e57c2' },
  { l: 'N', n: '星爆', c: '#ff4081' },
  { l: 'O', n: '护盾', c: '#00e5ff' },
  { l: 'P', n: '穿透', c: '#26a69a' },
  { l: 'Q', n: '四连', c: '#8d6e63' },
  { l: 'R', n: '轨道炮', c: '#18ffff' },
  { l: 'S', n: '散弹', c: '#ff9100' },
  { l: 'T', n: '加速', c: '#ff6d00' },
  { l: 'U', n: '伞盾', c: '#4dd0e1' },
  { l: 'V', n: '漩涡', c: '#5c6bc0' },
  { l: 'W', n: '闪现', c: '#b2ff59' },
  { l: 'X', n: '分裂', c: '#ce93d8' },
  { l: 'Y', n: '雷区', c: '#6d4c41' },
  { l: 'Z', n: '冰冻', c: '#82b1ff' },
];
</script>

<template>
  <div class="skill-grid">
    <div v-for="s in skills" :key="s.l" class="skill-card">
      <div class="skill-letter" :style="{ '--accent': s.c }">{{ s.l }}</div>
      <div class="skill-name">{{ s.n }}</div>
      <div class="skill-plus">{{ s.l }}+</div>
    </div>
  </div>
</template>

<style scoped>
.skill-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(108px, 1fr));
  gap: 12px;
  margin: 1.25rem 0 2rem;
}

.skill-card {
  position: relative;
  padding: 14px 10px 12px;
  border-radius: 12px;
  background: rgba(22, 22, 31, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.08);
  text-align: center;
  transition: transform 0.15s, border-color 0.15s, box-shadow 0.15s;
}

.skill-card:hover {
  transform: translateY(-2px);
  border-color: color-mix(in srgb, var(--accent) 55%, transparent);
  box-shadow: 0 8px 24px color-mix(in srgb, var(--accent) 25%, transparent);
}

.skill-letter {
  width: 42px;
  height: 42px;
  margin: 0 auto 8px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  font-family: var(--vp-font-family-mono);
  font-weight: 700;
  font-size: 1.15rem;
  color: #111;
  background: linear-gradient(145deg, var(--accent), color-mix(in srgb, var(--accent) 65%, #fff));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.35);
}

.skill-name {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--vp-c-text-1);
}

.skill-plus {
  margin-top: 4px;
  font-size: 0.72rem;
  font-family: var(--vp-font-family-mono);
  color: #fbbf24;
  opacity: 0.85;
}
</style>
