import fs from 'fs';
import path from 'path';

const outDir = path.join(process.cwd(), 'out');

export function outExists(relPath: string): boolean {
  return fs.existsSync(path.join(outDir, relPath));
}

export function readOut(relPath: string): string {
  return fs.readFileSync(path.join(outDir, relPath), 'utf8');
}

export function requireBuild(): void {
  if (!fs.existsSync(outDir)) {
    throw new Error('out/ not found — run `npm run build` before build-output tests');
  }
}
