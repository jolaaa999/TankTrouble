import { Client, type Room } from 'colyseus.js';

const DEFAULT_URL = import.meta.env.VITE_COLYSEUS_URL ?? 'ws://localhost:27491';

function randomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 4; i++) {
    out += alphabet[(Math.random() * alphabet.length) | 0];
  }
  return out;
}

export function getColyseusUrl(): string {
  return DEFAULT_URL;
}

export async function createBattleRoom(): Promise<Room> {
  const client = new Client(getColyseusUrl());
  const roomCode = randomCode();
  return client.create('battle', { roomCode });
}

export async function joinBattleRoom(roomCode: string): Promise<Room> {
  const client = new Client(getColyseusUrl());
  return client.join('battle', { roomCode: roomCode.toUpperCase() });
}
