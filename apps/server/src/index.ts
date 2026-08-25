import { createServer } from 'node:http';
import express from 'express';
import cors from 'cors';
import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { VERSION } from '@tanktrouble/shared';
import { BattleRoom } from './rooms/BattleRoom.js';

const PORT = Number(process.env.PORT ?? 27491);
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? '*')
  .split(',')
  .map((s) => s.trim());

const app = express();
app.use(
  cors({
    origin: ALLOWED_ORIGINS.includes('*') ? true : ALLOWED_ORIGINS,
    credentials: true,
  }),
);
app.options('*', cors());
app.get('/health', (_req, res) => {
  res.json({ ok: true, version: VERSION });
});

const httpServer = createServer(app);
const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

gameServer.define('battle', BattleRoom).filterBy(['roomCode']);

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`TankTrouble server on 0.0.0.0:${PORT} (v${VERSION})`);
});
