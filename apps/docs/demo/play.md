# Tank Trouble 游戏演示

<span class="version-pill">V0.3.17</span> · 当前线上版本

## 在线试玩

<a class="play-cta" href="https://tank-trouble-ten.vercel.app/?ws=wss://tanktrouble-server.fly.dev" target="_blank" rel="noreferrer">▶ 点击启动游戏</a>

## 游戏说明

- 击杀对手得 **1** 分，进入下一小局（新迷宫 + 乱序出生点）
- 经典模式默认先到 **5** 分胜；超多人默认 **10** 局胜（创建房间前可切换胜利积分）
- 场上彩色方块为技能拾取物，**A–Z 共 26 种**，各有 **+** 加强版
- 详细技能见 [技能大全](/game/skills)

## 操作说明

| 玩家 | 移动 | 开火 / 释放技能 |
|------|------|-----------------|
| P1 / 联机 | **W A S D** | **空格** |
| 本地 P2 | **方向键** | **Enter** |

大厅内按 **R** 切换准备状态。

## 本版本亮点

- ✅ 局内聊天：坦克头顶气泡 + 按 Enter/T 打开面板（快捷语 + 全员/阵营频道）
- ✅ 单人+AI 按 R 重开
- ✅ 房间大厅：浏览等待中的房间并点击加入
- ✅ 迷宫地图编辑器（本地试玩、JSON 导入导出）
- ✅ 26 字母技能 + 52 种拾取（含加强版）
- ✅ 反弹弹自伤（反弹后可击杀自己）
- ✅ 地雷可自踩、破片 / 星爆三角碎片
- ✅ 多房间联机、超多人团战地图封顶
- ✅ 技能释放中文飘字与特效

## 服务端

- 地址：`wss://tanktrouble-server.fly.dev`
- 健康检查：https://tanktrouble-server.fly.dev/health

## 相关文档

- [远程联机](/guide/multiplayer)
- [技能速查表](/game/skill-grid)
- [地图编辑器](/game/map-editor)
- [更新日志](/changelog)
