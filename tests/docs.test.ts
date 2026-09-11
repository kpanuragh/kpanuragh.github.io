import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const claude = () => fs.readFileSync(path.join(process.cwd(), 'CLAUDE.md'), 'utf8');

describe('CLAUDE.md', () => {
  it('no longer documents the removed automation', () => {
    const c = claude();
    for (const stale of [
      'auto-blog-generation.yml',
      'blog-config.json',
      'batch-generate-blog',
      'Topic rotation',
      'RECENT_POSTS',
    ]) {
      expect(c, stale).not.toContain(stale);
    }
  });

  it('describes the site as a personal site, not 0x55aa the blog', () => {
    expect(claude()).not.toContain('Static personal blog ("0x55aa")');
  });

  it('documents the test suite that now exists', () => {
    const c = claude();
    expect(c).toContain('npm test');
    expect(c).not.toContain('There is no test suite');
  });

  it('records the claim-discipline rule', () => {
    expect(claude()).toMatch(/never.*CVE/i);
  });
});
