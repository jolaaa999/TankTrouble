import { defineConfig } from 'vitepress';

const PLAY_URL =
  'https://tank-trouble-ten.vercel.app/?ws=wss://tanktrouble-server.fly.dev';

export default defineConfig({
  lang: 'zh-CN',
  base: '/docs/',
  title: 'Tank Trouble',
  titleTemplate: ':title · 坦克动荡文档',
  description: 'Tank Trouble 在线联机文档 — 玩法、26 字母技能、部署与更新日志',
  head: [
    ['link', { rel: 'icon', href: '/favicon.svg' }],
    [
      'link',
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&family=JetBrains+Mono:wght@500;600&family=Noto+Sans+SC:wght@400;500;600;700&display=swap',
      },
    ],
  ],
  themeConfig: {
    logo: '/logo.svg',
    siteTitle: '坦克动荡文档',
    nav: [
      { text: '首页', link: '/' },
      { text: '快速开始', link: '/guide/quickstart' },
      { text: '在线演示', link: '/demo/play' },
      { text: '更新日志', link: '/changelog' },
      {
        text: '在线试玩',
        link: PLAY_URL,
        target: '_blank',
        rel: 'noreferrer',
      },
    ],
    sidebar: [
      {
        text: '快速开始',
        items: [
          { text: '项目介绍', link: '/guide/intro' },
          { text: '快速开始', link: '/guide/quickstart' },
          { text: '远程联机', link: '/guide/multiplayer' },
        ],
      },
      {
        text: '在线演示',
        items: [
          { text: 'V0.3.2 当前版本', link: '/demo/play' },
          { text: '版本对比', link: '/demo/versions' },
        ],
      },
      {
        text: '坦克动荡',
        items: [
          { text: '游戏说明', link: '/game/overview' },
          { text: '技能大全 A–Z', link: '/game/skills' },
          { text: '技能速查表', link: '/game/skill-grid' },
          { text: '游戏模式', link: '/game/modes' },
          { text: '地图编辑器', link: '/game/map-editor' },
        ],
      },
      {
        text: '更新日志',
        items: [{ text: 'Changelog', link: '/changelog' }],
      },
      {
        text: '路线图',
        items: [{ text: 'Roadmap', link: '/roadmap' }],
      },
      {
        text: '开发日志',
        items: [
          { text: '架构说明', link: '/dev/architecture' },
          { text: '本地开发', link: '/dev/local-dev' },
        ],
      },
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/jolaaa999/TankTrouble' },
    ],
    search: { provider: 'local' },
    outline: { label: '页面导航' },
    docFooter: { prev: '上一页', next: '下一页' },
    darkModeSwitchLabel: '外观',
    returnToTopLabel: '回到顶部',
    sidebarMenuLabel: '菜单',
  },
  vite: {
    server: { port: 27493 },
  },
});
