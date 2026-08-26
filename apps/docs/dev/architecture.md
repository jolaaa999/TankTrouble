# 架构说明

## Monorepo 结构

```
TankTrouble/
├── apps/
│   ├── client/     # Phaser 3 游戏客户端
│   ├── server/     # Colyseus 游戏服
│   └── docs/       # VitePress 文档站
├── packages/
│   └── shared/     # 确定性仿真 GameSim、迷宫、技能配置
└── docs/           # 原始 Markdown（skills.md 等）
```

## 数据流（联机）

1. 客户端发送 `input` 消息（移动 + 开火）
2. `BattleRoom` 以 **30Hz** 固定步长驱动 `GameSim`
3. 仿真结果同步到 Colyseus Schema → 客户端渲染

## 技能配置

- 注册表：`packages/shared/src/skills.ts`
- 仿真逻辑：`packages/shared/src/sim/GameSim.ts`
- 加强版：`weaponPlus` 标志 + `plus*Mul` 倍率

## 房间模型

- 类型：`battle`，按 `roomCode` 过滤
- 每房间独立 `GameSim` 实例
- 玩家全部离开后 `disconnect()` 销毁房间

## 部署

| 组件 | 平台 | 说明 |
|------|------|------|
| 客户端 | Vercel | 静态 SPA |
| 游戏服 | Fly.io | WebSocket + HTTP health |
| 文档 | Vercel（可选） | `apps/docs` 静态构建 |

## 参考

- [tank-war.online 文档](https://tank-war.online/tank-war-README.html)
- 项目计划：`docs/superpowers/plans/2026-08-25-tank-trouble-online.md`
