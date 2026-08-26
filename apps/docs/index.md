---
layout: home

hero:
  name: Tank Trouble
  text: 坦克动荡文档
  tagline: 浏览器联机坦克对战 · Phaser 客户端 + Colyseus 权威服 · A–Z 共 26 种技能（含加强版 +）
  image:
    src: /hero-tank.svg
    alt: Tank Trouble
  actions:
    - theme: brand
      text: 在线试玩
      link: https://tank-trouble-ten.vercel.app/?ws=wss://tanktrouble-server.fly.dev
      target: _blank
    - theme: alt
      text: 快速开始
      link: /guide/quickstart
    - theme: alt
      text: 技能大全
      link: /game/skills

features:
  - icon: 🎮
    title: 经典玩法
    details: 迷宫反弹炮弹、击杀得分、先到 5 分（超多人 10 局）获胜。支持本地双人与远程房间联机。
  - icon: ⚡
    title: 26 字母技能
    details: 每个字母对应一种技能，地图上还有同名加强版拾取物（Z+ = 冰冻+），效果全面强化。
  - icon: 🌐
    title: 前后端分离部署
    details: 前端 Vercel 托管静态页，游戏服 Fly.io 长连接。多房间按房间码隔离，可同时开多局。
  - icon: 📖
    title: 完整文档
    details: 玩法、联机、技能数值、更新日志与开发说明，一站式查阅。
---

## 快速链接

| 链接 | 说明 |
|------|------|
| [在线试玩](https://tank-trouble-ten.vercel.app/?ws=wss://tanktrouble-server.fly.dev) | 正式联机地址（含 WebSocket 参数） |
| [技能大全](/game/skills) | A–Z 全技能 + 加强版说明 |
| [远程联机](/guide/multiplayer) | 房间创建 / 加入 / 多房间说明 |
| [GitHub](https://github.com/jolaaa999/TankTrouble) | 源码仓库 |
