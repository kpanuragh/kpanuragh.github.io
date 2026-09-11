import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

describe('site chrome', () => {
  it('leads the header with the name, wordmark secondary', () => {
    const h = read('components/Header.tsx');
    expect(h).toContain('Anuragh KP');
    expect(h.indexOf('Anuragh KP')).toBeLessThan(h.indexOf('0x55aa'));
  });

  // Links are rendered from a nav array as href={n.href}, so assert the
  // declared paths, not a literal href="..." attribute in the source.
  it('declares all four sections', () => {
    const h = read('components/Header.tsx');
    for (const href of ['/work', '/blog', '/about', '/contact']) {
      expect(h, href).toContain(`'${href}'`);
    }
  });

  it('has no theme toggle', () => {
    expect(read('components/Header.tsx')).not.toContain('ThemeToggle');
  });

  it('footer links more than LinkedIn and GitHub', () => {
    const f = read('components/Footer.tsx');
    for (const s of ['github.com', 'linkedin.com', 'npmjs.com']) {
      expect(f, s).toContain(s);
    }
  });

  it('uses no dark: variants anywhere in chrome', () => {
    expect(read('components/Header.tsx')).not.toContain('dark:');
    expect(read('components/Footer.tsx')).not.toContain('dark:');
  });
});
