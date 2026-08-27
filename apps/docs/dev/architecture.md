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

1. 客户端 `OnlineSelfPredictor` 以 **60Hz** 发送 `input`（带递增 `seq`）并同步推进一步预测
2. `BattleRoom` 以 **60Hz** 驱动 `GameSim`，同步每位玩家的 **`lastInputSeq`**
3. 收到快照：`lastInputSeq` 变化或偏差 > 44px 时，以服务器姿态为基准 **回放未确认输入**
4. 渲染：本地坦克用 **tick 内插值** 的 display pose；他人坦克用快照插值（带 RTT 微调）

客户端预测模块：`apps/client/src/net/onlinePrediction.ts`

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
