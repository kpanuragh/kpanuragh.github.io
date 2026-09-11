import { describe, it, expect, beforeAll } from 'vitest';
import { requireBuild, readOut } from './helpers/buildOutput';

// Regression guard for the site's primary failure mode: a false/overstated claim, or
// AI-generated-marketing tone, reaching the public site. These strings must never
// appear in the rendered HTML of the main pages.
const pages: Record<string, string> = {};

beforeAll(() => {
  requireBuild();
  pages['/'] = readOut('index.html');
  pages['/about/'] = readOut('about/index.html');
  pages['/work/'] = readOut('work/index.html');
  pages['/blog/'] = readOut('blog/index.html');
  pages['/contact/'] = readOut('contact/index.html');
});

describe('banned copy never reaches the public pages', () => {
  for (const path of ['/', '/about/', '/work/', '/blog/', '/contact/']) {
    describe(path, () => {
      it('has no star-rating symbol', () => {
        const html = pages[path];
        expect(html).not.toContain('★');
      });

      it('never states or implies a CVE was assigned for the Laravel work', () => {
        const html = pages[path];
        expect(html).not.toMatch(/CVE-\d+/);
      });

      it('never claims a langchain CVE', () => {
        const html = pages[path];
        expect(html.toLowerCase()).not.toContain('langchain');
      });

      it('never states the old (wrong) location', () => {
        const html = pages[path];
        expect(html).not.toContain('Vatakara');
      });
    });
  }
});
