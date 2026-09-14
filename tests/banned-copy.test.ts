import { describe, it, expect, beforeAll } from 'vitest';
import { requireBuild, readOut } from './helpers/buildOutput';

// Regression guard for the site's primary failure mode: a false/overstated claim, or
// AI-generated-marketing tone, reaching the public site. These strings must never
// appear in the rendered HTML of the main pages.
const pages: Record<string, string> = {};

// The only CVE this site is allowed to claim, anywhere, for any project.
const ONLY_PERMITTED_CVE = 'CVE-2026-26019';

const CVE_RE = /CVE-\d{4}-\d+/g;

/**
 * Pages that render `lib/security.ts` findings wrap each finding's markup in an
 * element carrying `data-finding="<finding id>"`, with findings appearing as
 * document-order siblings and no `data-finding` markers nested inside another
 * finding's block. That lets us cut out exactly the Laravel finding's own
 * rendered HTML — precise and immune to how far apart the panels happen to sit
 * visually, unlike a character/word-distance heuristic (which produced false
 * positives here: the langchain and Laravel panels sit right next to each other
 * by design, so a proximity window either false-positives on that legitimate
 * adjacency or is too loose to catch a real mix-up elsewhere).
 *
 * Next embeds a second, JSON-ish copy of the whole page's content in a trailing
 * `<script>` tag (the RSC flight payload used for hydration) — every finding's
 * text appears again in there, `data-finding` included but not `=`-quoted the
 * same way. Stripping `<script>` tags before slicing keeps this to exactly one
 * copy of each finding's markup, so slicing to the next marker (or end of the
 * script-stripped document) reliably lands on that finding's own content.
 */
function findingBlock(html: string, id: string): string | null {
  const noScripts = html.replace(/<script[\s\S]*?<\/script>/gi, ' ');
  const marker = `data-finding="${id}"`;
  const start = noScripts.indexOf(marker);
  if (start === -1) return null;
  const nextMarker = noScripts.indexOf('data-finding="', start + marker.length);
  return nextMarker === -1 ? noScripts.slice(start) : noScripts.slice(start, nextMarker);
}

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

      it('contains no CVE identifier other than the verified langchain one', () => {
        const html = pages[path];
        const found = html.match(CVE_RE) ?? [];
        for (const cve of found) {
          expect(cve).toBe(ONLY_PERMITTED_CVE);
        }
      });

      it('never states the old (wrong) location', () => {
        const html = pages[path];
        expect(html).not.toContain('Vatakara');
      });
    });
  }

  // /work/, /blog/, and /contact/ don't render any security finding at all, so the
  // simplest reliable guard for them is: no CVE identifier whatsoever.
  for (const path of ['/work/', '/blog/', '/contact/']) {
    it(`${path} mentions no CVE at all (no security findings render here)`, () => {
      expect(pages[path]).not.toMatch(CVE_RE);
    });
  }

  // / and /about/ render both findings side by side. Isolate the Laravel finding's
  // own block via its `data-finding` marker and assert it carries no CVE identifier
  // — the langchain CVE sitting in the adjacent block is fine and expected.
  for (const path of ['/', '/about/']) {
    it(`${path} never states or implies a CVE was assigned for the Laravel work`, () => {
      const block = findingBlock(pages[path], 'laravel-query-builder-index-hint-injection');
      expect(block, `expected a data-finding="laravel-query-builder-index-hint-injection" block on ${path}`).not.toBeNull();
      expect(block).not.toMatch(CVE_RE);
    });

    it(`${path} carries the verified langchain finding's CVE in its own block`, () => {
      const block = findingBlock(pages[path], 'langchain-recursiveurlloader-ssrf');
      expect(block, `expected a data-finding="langchain-recursiveurlloader-ssrf" block on ${path}`).not.toBeNull();
      expect(block).toContain(ONLY_PERMITTED_CVE);
    });
  }
});
