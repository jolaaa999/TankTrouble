import type { CustomMazeLayout } from '@tanktrouble/shared';
import { parseCustomMazeLayout, serializeCustomMazeLayout } from '@tanktrouble/shared';

const STORAGE_KEY = 'tanktrouble-custom-maze-v1';

export function loadStoredMaze(): CustomMazeLayout | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return parseCustomMazeLayout(raw);
  } catch {
    return null;
  }
}

export function saveStoredMaze(layout: CustomMazeLayout): void {
  localStorage.setItem(STORAGE_KEY, serializeCustomMazeLayout(layout));
}

export async function copyMazeJson(layout: CustomMazeLayout): Promise<void> {
  await navigator.clipboard.writeText(serializeCustomMazeLayout(layout));
}

export function importMazeJson(json: string): CustomMazeLayout {
  return parseCustomMazeLayout(json);
}
