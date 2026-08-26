# 项目介绍

**Tank Trouble Online** 是经典 Flash 游戏「坦克动荡 / Tank Trouble」的浏览器复刻版，在保留反弹炮弹、迷宫对战核心玩法的基础上，增加了 **26 字母技能体系** 与 **远程联机**。

## 技术栈

| 层 | 技术 | 部署 |
|---|---|---|
| 客户端 | Phaser 3 + Vite + TypeScript | Vercel |
| 服务端 | Colyseus + Node 22 | Fly.io |
| 共享逻辑 | 确定性迷宫 / 物理仿真 | monorepo `packages/shared` |

## 当前版本

<span class="version-pill">v0.3.1</span>

- **程序化音效与 BGM**（26 技能各不同释放音）
- **迷宫地图编辑器**（本地试玩、JSON 分享）
- **26** 种字母技能（A–Z），每种均有 **+** 加强版
- 多房间联机（按 4 位房间码隔离）
- 经典 4 人 / 超多人 6–8 人团战模式

## 与参考项目

玩法灵感来自 [tank-war.online 文档](https://tank-war.online/tank-war-README.html)。本项目聚焦原版核心 + 联机 + 技能扩展。

## 文档结构

- **快速开始** — 本地运行与联机
- **在线演示** — 当前版本试玩入口
- **坦克动荡** — 玩法与技能
- **更新日志 / 路线图** — 版本与规划
- **开发日志** — 架构与贡献
