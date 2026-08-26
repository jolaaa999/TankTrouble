import { cpSync, rmSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'apps/docs/.vitepress/dist');
const dest = join(root, 'apps/client/public/docs');

if (!existsSync(src)) {
  console.error('Docs build output missing. Run: pnpm --filter @tanktrouble/docs build');
  process.exit(1);
}

if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
mkdirSync(dirname(dest), { recursive: true });
cpSync(src, dest, { recursive: true });
console.log(`Copied docs → ${dest}`);
