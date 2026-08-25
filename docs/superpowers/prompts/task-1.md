# Task 1 Prompt — Monorepo 脚手架

执行计划 Task 1。工作区：`e:\PROJECT\TankTrouble`。

## 目标

创建 pnpm monorepo：`packages/shared`、`apps/client`（Vite 空白页）、`apps/server`（:27491 hello）。

## 包名

- `@tanktrouble/shared`
- `@tanktrouble/client`
- `@tanktrouble/server`

## 必须产出

- 根 `package.json` scripts：`dev:client` `dev:server` `build` `test`
- `pnpm-workspace.yaml`：`apps/*` `packages/*`
- shared 导出 `VERSION` 与空/初版 `GAME` 占位可随后 Task 补全
- client：`index.html` + `src/main.ts` 显示 "Tank Trouble"
- server：`src/index.ts` listen 27491

## 验证

```powershell
pnpm install
pnpm --filter @tanktrouble/shared build
```

手动确认 client/server 能启动。完成后进入 Task 2。
