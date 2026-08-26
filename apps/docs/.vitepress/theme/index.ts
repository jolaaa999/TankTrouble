import type { Theme } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import SkillGrid from '../components/SkillGrid.vue';
import './custom.css';

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('SkillGrid', SkillGrid);
  },
} satisfies Theme;
