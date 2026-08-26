import { createServer } from 'node:http';
import express from 'express';
import cors from 'cors';
import { Server, matchMaker } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { VERSION } from '@tanktrouble/shared';
import { BattleRoom } from './rooms/BattleRoom.js';

const PORT = Number(process.env.PORT ?? 27491);
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? '*')
  .split(',')
  .map((s) => s.trim());

type RoomListEntry = {
  roomCode: string;
  mode: 'classic' | 'mega';
  phase: string;
  playerCount: number;
  rosterSize: number;
  fillWithBots: boolean;
};

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

app.get('/rooms', async (_req, res) => {
  try {
    const rooms = await matchMaker.query({ name: 'battle' });
    const list: RoomListEntry[] = rooms
      .map((r) => {
        const meta = (r.metadata ?? {}) as Partial<RoomListEntry>;
        const playerCount =
          typeof meta.playerCount === 'number' ? meta.playerCount : r.clients;
        const rosterSize =
          typeof meta.rosterSize === 'number' ? meta.rosterSize : r.maxClients;
        return {
          roomCode: String(meta.roomCode ?? ''),
          mode: (meta.mode === 'mega' ? 'mega' : 'classic') as 'classic' | 'mega',
          phase: String(meta.phase ?? 'waiting'),
          playerCount,
          rosterSize,
          fillWithBots: Boolean(meta.fillWithBots),
        } satisfies RoomListEntry;
      })
      .filter((r) => r.roomCode && r.phase === 'waiting')
      .sort((a, b) => a.roomCode.localeCompare(b.roomCode));
    res.json({ rooms: list });
  } catch (err) {
    console.error('[rooms]', err);
    res.status(500).json({ rooms: [], error: 'list failed' });
  }
});

const httpServer = createServer(app);
const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

gameServer.define('battle', BattleRoom).filterBy(['roomCode']);

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`TankTrouble server on 0.0.0.0:${PORT} (v${VERSION})`);
});
