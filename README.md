# Tank Trouble Online

原版「坦克动荡」风格的浏览器坦克对战 + 远程联机。

## 技术栈

| 层 | 技术 | 部署 |
|---|---|---|
| Client | Phaser 3 + Vite + TypeScript | **Vercel** |
| Server | Colyseus 0.15 + Node 22 | **Fly.io** |
| Shared | 确定性迷宫 / 物理仿真 | — |

> Vercel 适合静态前端；权威游戏房间需要长连接与固定 tick，因此服放在 Fly.io。浏览器打开 Vercel 域名后连 `wss://*.fly.dev`。

## 本地开发

```bash
pnpm install
pnpm --filter @tanktrouble/shared build
pnpm dev:server   # http://localhost:27491  /  ws://localhost:27491
pnpm dev:client   # http://localhost:27492
```

- 本地双人：菜单 → 本地双人（P1 WASD+空格，P2 方向键+Enter）
- 联机：创建房间 / 加入房间 → 按 R 准备 → ≥2 人全员准备后开战

环境变量（client）：

```
VITE_COLYSEUS_URL=ws://localhost:27491
```

## 部署

### 1) Fly.io（游戏服）

```bash
# 在仓库根目录
fly apps create tanktrouble-server
fly secrets set ALLOWED_ORIGINS=https://your-app.vercel.app
fly deploy
```

记下 `wss://tanktrouble-server.fly.dev`。

### 2) Vercel（前端）

- Root Directory: `apps/client`
- Install: `cd ../.. && pnpm install`
- Build: `cd ../.. && pnpm --filter @tanktrouble/shared build && pnpm --filter @tanktrouble/client build`
- Output: `dist`
- Env: `VITE_COLYSEUS_URL=wss://tanktrouble-server.fly.dev`

或使用 `apps/client/vercel.json` 的 SPA rewrite。

## 参考

玩法灵感：[tank-war.online 文档](https://tank-war.online/tank-war-README.html)（Cocos 增强版）。本项目复刻原版核心 + 联机，MVP 不含道具 / Roguelike。

计划：`docs/superpowers/plans/2026-08-25-tank-trouble-online.md`
