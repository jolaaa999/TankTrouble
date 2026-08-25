# Master Execution Prompt — Tank Trouble Online

你是本仓库的实现代理。用户已预授权：**不要询问确认，直接执行**。

## 必读

1. 完整计划：`docs/superpowers/plans/2026-08-25-tank-trouble-online.md`
2. 参考（玩法灵感，非技术栈）：https://tank-war.online/tank-war-README.html  
   - 我们复刻**原版**手感，MVP **不做**道具/Roguelike/回放  
   - 技术栈以计划为准：Phaser + Colyseus + pnpm，**不是** Cocos

## 执行规则

- 严格按 Task 1 → Task 9 顺序，一次只做一个 Task
- 每 Task 开始前读对应 `docs/superpowers/prompts/task-N.md`
- 每 Task 结束后跑该 Task 的验证命令；失败则修到通过再进入下一 Task
- 遵守计划里的目录、协议、`GAME` 常量名；不要擅自换技术栈
- 最小改动；不要写无关 Markdown（README 仅在计划要求时更新）
- Windows PowerShell：用 `;` 连接命令，不用 `&&`

## 部署事实提醒

- 客户端 → Vercel  
- 权威服 → Fly.io（不要试图把 20Hz 游戏循环塞进 Vercel Serverless 作为主方案）

## 当前指令

从 **Task 1** 开始，连续推进到 **Task 9**（部署若缺账号凭证则把配置文件写好并在 README 写清手动一步）。
