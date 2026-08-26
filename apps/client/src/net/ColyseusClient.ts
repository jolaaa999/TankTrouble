import { Client, type Room } from 'colyseus.js';

const STORAGE_KEY = 'tanktrouble_colyseus_url';

function normalizeWsUrl(raw: string): string {
  let url = raw.trim().replace(/\/$/, '');
  if (url.startsWith('https://')) url = `wss://${url.slice('https://'.length)}`;
  if (url.startsWith('http://')) url = `ws://${url.slice('http://'.length)}`;
  return url;
}

/** Runtime override: ?ws=wss://host  or localStorage, then build-time env. */
export function getColyseusUrl(): string {
  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get('ws') ?? params.get('server');
  if (fromQuery) {
    const url = normalizeWsUrl(fromQuery);
    localStorage.setItem(STORAGE_KEY, url);
    return url;
  }
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) return normalizeWsUrl(saved);
  return normalizeWsUrl(import.meta.env.VITE_COLYSEUS_URL ?? 'ws://localhost:27491');
}

export function setColyseusUrl(url: string): void {
  localStorage.setItem(STORAGE_KEY, normalizeWsUrl(url));
}

export function formatNetError(err: unknown): string {
  if (err == null) return '未知错误';
  if (typeof err === 'string') return err;
  if (err instanceof Error && err.message) {
    const msg = err.message;
    if (/1006|abnormal|closed unexpectedly/i.test(msg)) {
      return `WebSocket 断开 (1006)。当前地址：${getColyseusUrl()}\n请刷新后重试；多人时让房主重新开房。`;
    }
    return msg;
  }
  const anyErr = err as { message?: string; code?: number; type?: string; target?: unknown };
  if (typeof ProgressEvent !== 'undefined' && err instanceof ProgressEvent) {
    return `无法连接游戏服务器（网络中断）。当前地址：${getColyseusUrl()}`;
  }
  if (anyErr?.code === 1006) {
    return `WebSocket 断开 (1006)。当前地址：${getColyseusUrl()}\n请刷新后重试；多人时让房主重新开房。`;
  }
  if (anyErr?.type === 'error' || anyErr?.target) {
    return `无法连接游戏服务器。当前地址：${getColyseusUrl()}\nVercel 只托管网页，需要公网 wss 游戏服（Fly.io / 隧道）。`;
  }
  if (anyErr.message) return anyErr.message;
  try {
    return JSON.stringify(err);
  } catch {
    return '连接失败';
  }
}

export function wsToHttp(ws: string): string {
  return ws.replace(/^ws/i, 'http');
}

export type BattleRoomInfo = {
  roomCode: string;
  mode: 'classic' | 'mega';
  phase: string;
  playerCount: number;
  rosterSize: number;
  fillWithBots: boolean;
};

let pendingLobbyRoom: Room | null = null;

export function stashLobbyRoom(room: Room): void {
  pendingLobbyRoom = room;
}

export function takeLobbyRoom(): Room | null {
  const room = pendingLobbyRoom;
  pendingLobbyRoom = null;
  return room;
}

export async function listBattleRooms(): Promise<BattleRoomInfo[]> {
  const http = wsToHttp(getColyseusUrl());
  const res = await fetch(`${http}/rooms`, { method: 'GET' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as { rooms?: BattleRoomInfo[] };
  return data.rooms ?? [];
}

function randomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 4; i++) {
    out += alphabet[(Math.random() * alphabet.length) | 0];
  }
  return out;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isRetryableNetError(err: unknown): boolean {
  const msg = formatNetError(err);
  return /1006|abnormal|closed unexpectedly|network|failed to fetch|ProgressEvent|无法连接/i.test(
    msg,
  ) || (err as { code?: number })?.code === 1006;
}

async function withRetry<T>(label: string, fn: () => Promise<T>, attempts = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      if (i === attempts - 1 || !isRetryableNetError(err)) throw err;
      await sleep(400 * (i + 1));
      console.warn(`[net] ${label} retry ${i + 1}`, err);
    }
  }
  throw last;
}

export async function createBattleRoom(opts?: {
  fillWithBots?: boolean;
  mode?: 'classic' | 'mega';
  rosterSize?: number;
}): Promise<Room> {
  const endpoint = getColyseusUrl();
  return withRetry('create', async () => {
    const client = new Client(endpoint);
    const roomCode = randomCode();
    return client.create('battle', {
      roomCode,
      fillWithBots: opts?.fillWithBots ?? false,
      mode: opts?.mode ?? 'classic',
      rosterSize: opts?.rosterSize ?? 4,
    });
  });
}

export async function joinBattleRoom(roomCode: string): Promise<Room> {
  const endpoint = getColyseusUrl();
  const code = roomCode.toUpperCase();
  return withRetry('join', async () => {
    const client = new Client(endpoint);
    return client.join('battle', { roomCode: code });
  });
}

export async function pingServer(): Promise<{ ok: boolean; detail: string }> {
  const ws = getColyseusUrl();
  const http = wsToHttp(ws);
  try {
    const res = await fetch(`${http}/health`, { method: 'GET' });
    if (!res.ok) return { ok: false, detail: `HTTP ${res.status} @ ${http}` };
    const data = (await res.json()) as { version?: string };
    return { ok: true, detail: `已连接 ${ws} (v${data.version ?? '?'})` };
  } catch {
    return {
      ok: false,
      detail: `连不上 ${ws}\n请部署游戏服或用隧道，并设置 ?ws=wss://你的地址`,
    };
  }
}
