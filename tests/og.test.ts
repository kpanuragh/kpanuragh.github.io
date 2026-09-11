import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const src = () => fs.readFileSync(path.join(process.cwd(), 'scripts/generate-og-images.ts'), 'utf8');

describe('og image generator', () => {
  it('uses the dark palette, not terminal green', () => {
    const s = src();
    expect(s).toContain('#0b0d12');
    expect(s).not.toContain('#00ff00');
    expect(s).not.toContain('#0a0e27');
  });

  it('leads the card with the name', () => {
    expect(src()).toContain('Anuragh KP');
  });

  it('emits a default card', () => {
    expect(fs.existsSync(path.join(process.cwd(), 'public/og/og-default.png'))).toBe(true);
  });
});
