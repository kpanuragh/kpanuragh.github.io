import { describe, it, expect } from 'vitest';
import sitemap from '@/app/sitemap';

describe('sitemap', () => {
  const entries = sitemap();

  it('ends every URL with a trailing slash', () => {
    for (const e of entries) {
      expect(e.url, e.url).toMatch(/\/$/);
    }
  });

  it('uses https everywhere', () => {
    for (const e of entries) {
      expect(e.url.startsWith('https://iamanuragh.in/'), e.url).toBe(true);
    }
  });

  it('lists no tag pages', () => {
    expect(entries.some(e => e.url.includes('/tags/'))).toBe(false);
  });

  it('includes the new sections', () => {
    const urls = entries.map(e => e.url);
    expect(urls).toContain('https://iamanuragh.in/');
    expect(urls).toContain('https://iamanuragh.in/work/');
    expect(urls).toContain('https://iamanuragh.in/about/');
    expect(urls).toContain('https://iamanuragh.in/contact/');
  });

  it('includes a page per project', () => {
    const urls = entries.map(e => e.url);
    expect(urls).toContain('https://iamanuragh.in/work/zstd-js/');
  });
});
