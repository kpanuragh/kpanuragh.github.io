import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { requireBuild, readOut } from './helpers/buildOutput';

beforeAll(() => requireBuild());

describe('blog index', () => {
  it('no longer ships a client-side list', () => {
    expect(fs.existsSync(path.join(process.cwd(), 'components/BlogListClient.tsx'))).toBe(false);
    expect(readOut('blog/index.html')).not.toContain('BlogListClient');
  });

  it('handles an empty post list without crashing', () => {
    const html = readOut('blog/index.html');
    expect(html).toContain('Writing');
  });

  it('drops the 0x55aa framing from blog metadata', () => {
    expect(readOut('blog/index.html')).not.toContain('Blog - 0x55aa');
  });

  it('emits an og:image meta tag', () => {
    expect(readOut('blog/index.html')).toMatch(/<meta property="og:image" content="[^"]+"/);
  });
});

describe('blog post styling', () => {
  const css = () => fs.readFileSync(path.join(process.cwd(), 'app/globals.css'), 'utf8');

  it('defines a .prose rule set for post bodies', () => {
    expect(css()).toMatch(/\.prose\s*\{|\.prose\s*>|\.prose\s+[a-z]/);
  });

  it('defines at least 20 distinct .hljs- class selectors', () => {
    const matches = css().match(/\.hljs-[a-z_-]+/g) || [];
    const distinct = new Set(matches);
    expect(distinct.size).toBeGreaterThanOrEqual(20);
  });

  it('renders tags as plain text, not dead /blog/tags/ links', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'app/blog/[slug]/page.tsx'),
      'utf8'
    );
    expect(source).not.toContain('/blog/tags/');
  });
});

describe('components carry no light-theme palette', () => {
  const componentsDir = path.join(process.cwd(), 'components');
  const files = fs.readdirSync(componentsDir).filter(f => f.endsWith('.tsx'));
  const banned = [/dark:/, /text-terminal-/, /bg-white/, /text-gray-\d+/];

  it.each(files)('%s has no dark: / text-terminal- / bg-white / text-gray-N classes', (file) => {
    const source = fs.readFileSync(path.join(componentsDir, file), 'utf8');
    for (const pattern of banned) {
      expect(source, `${file} matched ${pattern}`).not.toMatch(pattern);
    }
  });
});
