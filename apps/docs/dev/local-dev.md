# 本地开发

## 依赖

- Node.js ≥ 22
- pnpm 9.x

## 常用命令

```bash
pnpm install
pnpm --filter @tanktrouble/shared build

pnpm dev:client    # 游戏客户端 :27492
pnpm dev:server    # 游戏服     :27491
pnpm dev:docs      # 文档站     :27493

pnpm test          # shared 单元测试
pnpm build         # 全量构建
```

## 客户端环境变量

`apps/client/.env`：

```
VITE_COLYSEUS_URL=ws://localhost:27491
```

## 修改技能后

1. 改 `packages/shared/src/skills.ts` / `GameSim.ts`
2. `pnpm --filter @tanktrouble/shared build`
3. 重启 client / server
4. 同步更新 `docs/skills.md` 与 `apps/docs/game/skills.md`

## 部署游戏服

```bash
fly deploy -a tanktrouble-server --remote-only
```

## 部署文档站

```bash
pnpm --filter @tanktrouble/docs build
# 输出：apps/docs/.vitepress/dist
```

Vercel 项目设置：

- Root Directory: `apps/docs`
- Build: `pnpm install && pnpm build`
- Output: `.vitepress/dist`
