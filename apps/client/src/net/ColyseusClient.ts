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
  if (err instanceof Error && err.message) return err.message;
  const anyErr = err as { message?: string; code?: number; type?: string; target?: unknown };
  if (typeof ProgressEvent !== 'undefined' && err instanceof ProgressEvent) {
    return `无法连接游戏服务器（网络中断）。当前地址：${getColyseusUrl()}`;
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

function randomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 4; i++) {
    out += alphabet[(Math.random() * alphabet.length) | 0];
  }
  return out;
}

export async function createBattleRoom(opts?: {
  fillWithBots?: boolean;
}): Promise<Room> {
  const endpoint = getColyseusUrl();
  const client = new Client(endpoint);
  const roomCode = randomCode();
  return client.create('battle', {
    roomCode,
    fillWithBots: opts?.fillWithBots ?? true,
  });
}

export async function joinBattleRoom(roomCode: string): Promise<Room> {
  const endpoint = getColyseusUrl();
  const client = new Client(endpoint);
  return client.join('battle', { roomCode: roomCode.toUpperCase() });
}

export async function pingServer(): Promise<{ ok: boolean; detail: string }> {
  const ws = getColyseusUrl();
  const http = ws.replace(/^ws/i, 'http');
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
