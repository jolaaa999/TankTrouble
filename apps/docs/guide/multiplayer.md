# 远程联机

## 架构说明

Vercel 只托管**静态前端**，不能跑 Colyseus 游戏房间。浏览器打开 Vercel 页面后，通过 WebSocket 连接 Fly.io 上的游戏服。

```
浏览器 (Vercel)  ──WebSocket──▶  游戏服 (Fly.io)
     Phaser 渲染                      权威仿真 30Hz
```

## 正式联机地址

<a class="play-cta" href="https://tank-trouble-ten.vercel.app/?ws=wss://tanktrouble-server.fly.dev" target="_blank" rel="noreferrer">▶ 打开联机游戏</a>

```
https://tank-trouble-ten.vercel.app/?ws=wss://tanktrouble-server.fly.dev
```

`?ws=` 参数告诉客户端连哪个 WebSocket 服。若在 Vercel 配置了 `VITE_COLYSEUS_URL`，可省略该参数。

## 开房间流程

1. 打开上方链接
2. 一人点 **创建房间**，记下 4 位房间码（如 `AB3K`）
3. 好友点 **加入房间**，输入同一房间码
4. 所有人按 **R** 准备 → 人数满足后开战

## 多房间支持

**可以同时开多个房间**，互不干扰：

- 每个房间有独立 **roomCode**
- 不同朋友组用不同房间码即可
- 所有人离开后房间自动销毁

### 会不会卡？

当前 Fly 配置为 **1 核 + 512MB**，所有房间跑在同一实例上：

| 情况 | 预期 |
|------|------|
| 2–5 间同时在打的经典局 | 通常流畅 |
| 很多间超多人模式同时打 | 可能 CPU 吃紧、延迟升高 |
| 等待中的空房间 | 开销很小 |

卡顿主要来自**服务器算力**与**网络**，不是「不允许开多房间」。

## 健康检查

服务端状态：https://tanktrouble-server.fly.dev/health

应返回 `"ok": true` 与当前 `version`。

## 临时联机（本机隧道）

无 Fly 部署时可用 Cloudflare 隧道：

```bash
pnpm dev:server
cloudflared tunnel --url http://localhost:27491
# 得到 wss://xxxx.trycloudflare.com
# 打开：https://你的vercel/?ws=wss://xxxx.trycloudflare.com
```

## 常见问题

::: tip 创建 / 加入失败
确认链接带 `?ws=wss://...`，不要用 `localhost` 给好友联机。
:::

::: tip WebSocket 1006
多为冷启动或网络中断，重试创建房间；服务端已配置保活与重试。
:::
