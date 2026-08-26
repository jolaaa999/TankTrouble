# 快速开始

## 在线试玩（无需安装）

<a class="play-cta" href="https://tank-trouble-ten.vercel.app/?ws=wss://tanktrouble-server.fly.dev" target="_blank" rel="noreferrer">▶ 打开在线游戏</a>

好友联机请使用**完整链接**（含 `?ws=wss://...`），详见 [远程联机](/guide/multiplayer)。

## 本地开发

### 环境要求

- Node.js **≥ 22**
- pnpm **9.x**

### 安装与启动

```bash
git clone https://github.com/jolaaa999/TankTrouble.git
cd TankTrouble
pnpm install
pnpm --filter @tanktrouble/shared build

# 终端 1：游戏服
pnpm dev:server    # http://localhost:27491

# 终端 2：客户端
pnpm dev:client    # http://localhost:27492
```

### 本地文档站

```bash
pnpm dev:docs      # http://localhost:27493
```

## 操作说明

| 玩家 | 移动 | 开火 / 技能 |
|------|------|-------------|
| P1 / 联机 | WASD | 空格 |
| 本地 P2 | 方向键 | Enter |

## 菜单入口

- **本地双人** — 同一浏览器两人对战
- **创建房间 / 加入房间** — 远程联机，输入 4 位房间码
- **超多人模式** — 6 或 8 人红蓝团战

准备：大厅内按 **R** 切换准备，全员准备且人数满足后自动开战。

## 环境变量（客户端）

```bash
# apps/client/.env
VITE_COLYSEUS_URL=ws://localhost:27491
```

生产环境设为 `wss://tanktrouble-server.fly.dev`。
