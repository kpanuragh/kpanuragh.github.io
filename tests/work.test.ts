import { describe, it, expect, beforeAll } from 'vitest';
import { requireBuild, readOut, outExists } from './helpers/buildOutput';
import { projects } from '@/lib/projects';

beforeAll(() => requireBuild());

describe('work section', () => {
  it('builds an index page', () => {
    expect(outExists('work/index.html')).toBe(true);
  });

  it('builds a page for every project', () => {
    for (const p of projects) {
      expect(outExists(`work/${p.slug}/index.html`), p.slug).toBe(true);
    }
  });

  it('renders project prose server-side', () => {
    const html = readOut('work/zstd-js/index.html');
    expect(html).toContain('Hermes');
    expect(html).toContain('github.com/kpanuragh/zstd-js');
  });

  it('quotes no star counts', () => {
    expect(readOut('work/index.html')).not.toContain('★');
  });
});
