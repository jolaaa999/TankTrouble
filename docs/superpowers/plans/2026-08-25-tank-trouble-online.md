# Tank Trouble Online Implementation Plan

> **For agentic workers:** Execute task-by-task using the companion prompts in `docs/superpowers/prompts/`. Steps use checkbox (`- [ ]`) syntax for tracking. User pre-approved all decisions — do not ask for confirmation.

**Goal:** 复刻原版「坦克动荡」核心体验（迷宫 + 弹道反弹 + 同屏对战），并加上稳定的远程多人联机，客户端部署到 Vercel，权威服部署到 Fly.io。

**Architecture:** 服务端权威（Colyseus Room）跑确定性物理与胜负判定；客户端（Phaser 3）只负责输入、插值渲染与 UI。共享包 `@tanktrouble/shared` 放常量、地图种子算法、输入协议与可单测的仿真核心，避免双端漂移。

**Tech Stack:**
| 层 | 选型 | 理由 |
|---|---|---|
| Client | Phaser 3 + Vite + TypeScript | 浏览器 2D 事实标准，静态产物可直上 Vercel |
| Server | Colyseus 0.16+ + Node 22 + TypeScript | 房间/匹配/状态同步专为多人游戏设计 |
| Shared | 纯 TS 包（无 DOM） | 地图种子、碰撞、子弹反弹双端共用 |
| Monorepo | pnpm workspaces | 共享类型零拷贝 |
| Client deploy | **Vercel** | 静态 SPA，全球 CDN |
| Server deploy | **Fly.io** | 长连接 WebSocket + 固定 tick；比 Vercel Functions 更适合权威游戏循环 |
| Test | Vitest（shared/server） | 物理与房间逻辑可离线验证 |

## 关于 Vercel 多人联机（事实）

- Vercel Functions **已支持 WebSocket（公测）**，适合聊天/协作，但多实例间状态需 Redis，且不适合长期 20–30Hz 权威物理房间。
- 本项目采用业界默认拆分：**前端 Vercel + 游戏服 Fly.io**。玩家打开 Vercel 域名，浏览器连 `wss://*.fly.dev`。
- 参考项目 [tank-war.online](https://tank-war.online/tank-war-README.html) 用 Cocos + 自研联机；我们刻意不用 Cocos（编辑器重、Web 部署重），玩法对标 **4399 原版**，联机与种子地图思想可借鉴其文档。

## Global Constraints

- 语言：TypeScript strict
- 包管理：pnpm ≥ 9
- Node：≥ 22 LTS
- 房间人数：2–4
- 权威 tick：20 Hz（固定）
- 地图：格子迷宫，种子可复现
- MVP **不做**：道具、技能、Roguelike、回放、可破坏墙（留 Phase 2）
- 操作（可配置）：P1 WASD+空格；联机每人本地一套；触摸可选后置
- 配置集中：`packages/shared/src/config.ts`（数值全部可调）
- 一次只完成一个 Task；每 Task 结束必须可验证
- 未经用户要求不强制 git commit；需要时可在 Task 末建议 commit message

## 产品边界（MVP）

**必须有：**
1. 随机/种子迷宫
2. 坦克转向 + 前进后退 + 碰撞墙
3. 子弹碰墙反弹、命中坦克淘汰
4. 本地离线 2 人热座（验证手感）
5. 在线：创建房间码 / 加入房间 / 2–4 人对战 / 最后存活获胜
6. 简单大厅 UI（房间码、准备、再来一局）
7. 部署：client → Vercel，server → Fly.io

**明确不做（MVP）：** AI 机器人、道具、技能、回放、排行榜、账号系统

## 仓库结构（锁定）

```
TankTrouble/
├── package.json                 # pnpm workspace scripts
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── README.md
├── apps/
│   ├── client/                  # Phaser + Vite → Vercel
│   │   ├── package.json
│   │   ├── vite.config.ts
│   │   ├── index.html
│   │   ├── vercel.json
│   │   └── src/
│   │       ├── main.ts
│   │       ├── net/ColyseusClient.ts
│   │       ├── scenes/BootScene.ts
│   │       ├── scenes/MenuScene.ts
│   │       ├── scenes/LobbyScene.ts
│   │       ├── scenes/GameScene.ts
│   │       ├── scenes/ResultScene.ts
│   │       ├── render/TankView.ts
│   │       ├── render/BulletView.ts
│   │       ├── render/MazeView.ts
│   │       └── ui/...
│   └── server/                  # Colyseus → Fly.io
│       ├── package.json
│       ├── Dockerfile
│       ├── fly.toml
│       └── src/
│           ├── index.ts
│           ├── rooms/BattleRoom.ts
│           └── rooms/schema/BattleState.ts
├── packages/
│   └── shared/
│       ├── package.json
│       └── src/
│           ├── index.ts
│           ├── config.ts
│           ├── types.ts
│           ├── math/Vec2.ts
│           ├── maze/generateMaze.ts
│           ├── sim/GameSim.ts
│           ├── sim/Tank.ts
│           ├── sim/Bullet.ts
│           └── sim/collide.ts
└── docs/
    └── superpowers/
        ├── plans/...
        └── prompts/...
```

## 核心协议（锁定）

**Client → Server（每帧或按键变化）：**
```ts
type InputMessage = {
  seq: number;
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  fire: boolean;
};
```

**Server → Client（20Hz schema sync + 事件）：**
- Schema：`tanks[{id,x,y,angle,alive,colorIndex}]`, `bullets[{id,x,y,vx,vy}]`, `walls` 由种子客户端本地生成（不传全图）
- 消息：`roundStart { seed, scores }`, `roundEnd { winnerId }`, `playerLeft`

**权威规则：**
- 仅服务器生成子弹、判定命中与墙碰
- 客户端用最新状态插值；本地可做预测但 MVP 可先「只插值」降低复杂度

---

### Task 1: Monorepo 脚手架

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.gitignore`, `README.md`
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/src/index.ts`, `packages/shared/src/config.ts`
- Create: `apps/client/package.json`, `apps/client/vite.config.ts`, `apps/client/index.html`, `apps/client/tsconfig.json`, `apps/client/src/main.ts`
- Create: `apps/server/package.json`, `apps/server/tsconfig.json`, `apps/server/src/index.ts`

**Interfaces:**
- Produces: workspace scripts `dev`, `dev:client`, `dev:server`, `build`, `test`

- [ ] **Step 1:** 初始化 pnpm workspace（apps/* + packages/*）
- [ ] **Step 2:** shared 导出空 `config` 与 `VERSION = '0.1.0'`
- [ ] **Step 3:** client Vite 能打开空白页；server 能 `listen(27491)` 打印 hello
- [ ] **Step 4:** 验证

```bash
pnpm install
pnpm --filter @tanktrouble/client dev
pnpm --filter @tanktrouble/server dev
```

Expected: client `http://localhost:27492`，server log `TankTrouble server on :27491`

---

### Task 2: Shared 配置与向量数学

**Files:**
- Create: `packages/shared/src/config.ts`, `packages/shared/src/math/Vec2.ts`, `packages/shared/src/types.ts`
- Test: `packages/shared/src/math/Vec2.test.ts`

**Interfaces:**
- Produces: `GAME` 常量对象；`Vec2` 带 `add/sub/scale/len/normalize/dot`

- [ ] **Step 1:** 写 Vec2 失败测试
- [ ] **Step 2:** 实现 Vec2 + config（坦克半径、速度、子弹速度、反弹次数上限、tickHz=20、格子尺寸等）
- [ ] **Step 3:** `pnpm --filter @tanktrouble/shared test` 全绿

`config.ts` 关键数值（可调）：
```ts
export const GAME = {
  tickHz: 20,
  mazeCols: 11,
  mazeRows: 7,
  cellSize: 64,
  wallThickness: 8,
  tankRadius: 18,
  tankSpeed: 120,       // px/s
  tankTurnSpeed: 2.8,   // rad/s
  bulletSpeed: 280,
  bulletRadius: 5,
  maxBulletsPerTank: 5,
  maxBulletBounces: 8,
  fireCooldownSec: 0.35,
  playerColors: ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f'],
  maxPlayers: 4,
  minPlayers: 2,
} as const;
```

---

### Task 3: 种子迷宫生成

**Files:**
- Create: `packages/shared/src/maze/generateMaze.ts`, `packages/shared/src/maze/rng.ts`
- Test: `packages/shared/src/maze/generateMaze.test.ts`

**Interfaces:**
- Produces: `generateMaze(seed: number, cols, rows) => { hWalls: boolean[][]; vWalls: boolean[][]; spawns: {x,y}[] }`
- 算法：Recursive Backtracker（迷宫）+ 外框墙；spawn 取 4 个角落附近空格中心

- [ ] **Step 1:** 同 seed 两次生成结果 deepEqual
- [ ] **Step 2:** 不同 seed 大概率不等
- [ ] **Step 3:** 实现并通过测试

验证：`pnpm --filter @tanktrouble/shared test`

---

### Task 4: 确定性仿真核心 GameSim

**Files:**
- Create: `packages/shared/src/sim/Tank.ts`, `Bullet.ts`, `collide.ts`, `GameSim.ts`
- Test: `packages/shared/src/sim/GameSim.test.ts`

**Interfaces:**
```ts
class GameSim {
  constructor(seed: number, playerIds: string[]);
  applyInput(playerId: string, input: InputMessage): void;
  step(dt: number): SimEvent[]; // hit, bounce, roundEnd...
  getSnapshot(): SimSnapshot;
}
```

规则：
- 坦克圆 vs 轴对齐墙段 → 推出
- 子弹圆 vs 墙 → 按法线反转对应分量（水平墙翻 vy，竖直墙翻 vx）
- 子弹 vs 坦克（非己方或允许友伤=false）→ 坦克 `alive=false`，子弹移除
- 子弹 bounce 次数超限 → 移除
- 存活 ≤1 → `roundEnd`

- [ ] **Step 1:** 测试：子弹水平撞竖墙后 vx 变号
- [ ] **Step 2:** 测试：子弹命中坦克后 alive=false
- [ ] **Step 3:** 实现最小可过测试代码
- [ ] **Step 4:** 全测通过

---

### Task 5: 客户端离线热座（验证手感）

**Files:**
- Create: client scenes + renderers；Menu 进 Local Duo；GameScene 直接跑 `GameSim`

**Interfaces:**
- Consumes: `GameSim`, `generateMaze`, `GAME`
- Produces: 可玩的本地 2 人对战

控件：
- P1: WASD + Space
- P2: 方向键 + Enter

- [ ] **Step 1:** MazeView / TankView / BulletView 绘制
- [ ] **Step 2:** GameScene 每帧收集双人输入 → `sim.step`
- [ ] **Step 3:** 一方死后显示胜者 + R 重开

验证：浏览器本地互射，子弹反弹手感接近原版。

---

### Task 6: Colyseus BattleRoom

**Files:**
- Create: `apps/server/src/rooms/schema/BattleState.ts`, `BattleRoom.ts`, 更新 `index.ts`
- Test: `apps/server/src/rooms/BattleRoom.test.ts`（可选房间单元：用 `@colyseus/testing`）

**Interfaces:**
- Room name: `battle`
- `onCreate({ roomCode? })`：生成 4 位房间码
- `onJoin`：分配 colorIndex；人数达 min 且全 ready → `startRound`
- 固定 `setSimulationInterval` @ 50ms → `sim.step` → 写 schema
- messages: `input`, `ready`, `restart`

- [ ] **Step 1:** Schema 定义 tanks/bullets/phase/seed/roomCode
- [ ] **Step 2:** BattleRoom 接入 GameSim
- [ ] **Step 3:** 本地两个浏览器连 `ws://localhost:27491` 能开战（可先用 playground）

验证：`pnpm --filter @tanktrouble/server dev` + Colyseus playground 或临时测试客户端。

---

### Task 7: 客户端联机大厅 + 对战

**Files:**
- Create: `apps/client/src/net/ColyseusClient.ts`, `LobbyScene.ts`；改 `MenuScene` / `GameScene`

**Interfaces:**
- `createRoom() => roomCode`
- `joinRoom(code) => void`
- GameScene 在 online 模式：发 input，渲染 schema（不再本地权威 step）

- [ ] **Step 1:** 菜单：本地双人 / 创建房间 / 加入房间
- [ ] **Step 2:** Lobby 显示房间码、玩家列表、Ready
- [ ] **Step 3:** GameScene online 路径
- [ ] **Step 4:** Result → 回大厅或 restart

验证：两台浏览器（或双窗口）创建/加入，同局对战，胜负一致。

---

### Task 8: 打磨与防呆

**Files:**
- Modify: config、UI 文案、断线处理、房间满拒绝、刷新重连（MVP：断线即淘汰或移除）

- [ ] 断线：从房间移除；若对战中当死亡处理
- [ ] 房间满 / 码错误：明确 toast
- [ ] README：本地启动步骤
- [ ] 环境变量：`VITE_COLYSEUS_URL`（默认 `ws://localhost:27491`）

验证：错误码、满员、中途退出各测一遍。

---

### Task 9: 部署

**Files:**
- Create: `apps/client/vercel.json`, `apps/server/Dockerfile`, `apps/server/fly.toml`
- Modify: README 部署章节

**部署步骤（执行时）：**
1. Fly：在 `apps/server` 执行 `fly launch` / `fly deploy`，记下 `wss://<app>.fly.dev`
2. Vercel：导入 monorepo，Root `apps/client`，Build `pnpm --filter @tanktrouble/client build`，Output `dist`，Env `VITE_COLYSEUS_URL=wss://<app>.fly.dev`
3. CORS / `ALLOWED_ORIGINS` 设为 Vercel 域名

验证：生产域名两人开战成功。

---

### Task 10（可选 Phase 2 清单，不在 MVP 执行）

- AI 补位（参考 tank-war 机器人）
- 道具 / 技能
- 回放（存 input + seed）
- 可破坏墙
- 移动端虚拟摇杆

---

## Self-Review

| 需求 | Task |
|---|---|
| 原版迷宫坦克 + 反弹 | 3–5 |
| 远程联机 | 6–7 |
| 配置集中 | 2 |
| Vercel 可玩入口 | 9（client） |
| 权威联机稳定性 | 6 + Fly server |
| 参考 tank-war 但不过度抄道具 | MVP 边界已排除道具 |

无 TBD 占位；协议与目录已锁定。

## Execution

用户已授权自动执行。按 `docs/superpowers/prompts/00-master.md` 顺序喂给执行代理，从 Task 1 开始直到 Task 9。
