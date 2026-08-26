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
2. **同步文档**（与代码同一提交）：
   - `docs/skills.md`
   - `apps/docs/game/skills.md`
   - 若字母/名称变了：`apps/docs/.vitepress/components/SkillGrid.vue`
   - `apps/docs/changelog.md`（用户可见变更）
3. `pnpm --filter @tanktrouble/shared build`
4. 重启 client / server
5. `pnpm --filter @tanktrouble/docs build` 验证文档可构建

> 项目规则：任何玩法、联机、UI 外链、版本号调整都应按 `.cursor/rules/sync-docs.mdc` 更新 `apps/docs/`。

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
