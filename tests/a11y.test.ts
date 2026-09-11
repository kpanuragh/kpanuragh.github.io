import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { requireBuild, readOut } from './helpers/buildOutput';

const root = process.cwd();
const css = () => fs.readFileSync(path.join(root, 'app/globals.css'), 'utf8');

let html = '';
beforeAll(() => {
  requireBuild();
  html = readOut('index.html');
});

describe('accessibility: source', () => {
  it('globals.css defines a :focus-visible rule', () => {
    expect(css()).toMatch(/:focus-visible\s*\{/);
  });

  it('globals.css handles prefers-reduced-motion', () => {
    expect(css()).toMatch(/@media \(prefers-reduced-motion:\s*reduce\)/);
  });
});

describe('accessibility: built output', () => {
  it('ships a skip link targeting #main-content, and a matching main id', () => {
    expect(html).toMatch(/<a[^>]*href="#main-content"[^>]*>/);
    expect(html).toContain('<main id="main-content"');
  });

  it('gives both <nav> landmarks distinct accessible names', () => {
    const navs = [...html.matchAll(/<nav\b[^>]*>/g)].map(m => m[0]);
    expect(navs.length).toBeGreaterThanOrEqual(2);
    for (const nav of navs) {
      expect(nav).toMatch(/aria-label="[^"]+"/);
    }
    const labels = navs.map(n => n.match(/aria-label="([^"]+)"/)?.[1]);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('links the security section to the Laravel write-up', () => {
    expect(html).toMatch(/href="\/blog\/[^"]*injection-vector[^"]*\/?"/);
    expect(html).toContain('no CVE was issued');
  });

  it('ships the shipped CSS bundle with focus-visible and reduced-motion rules', () => {
    const cssDir = path.join(root, 'out/_next/static/chunks');
    const cssFile = fs.readdirSync(cssDir).find(f => f.endsWith('.css'));
    expect(cssFile).toBeTruthy();
    const bundled = fs.readFileSync(path.join(cssDir, cssFile as string), 'utf8');
    expect(bundled).toContain(':focus-visible');
    expect(bundled).toContain('prefers-reduced-motion');
  });
});
