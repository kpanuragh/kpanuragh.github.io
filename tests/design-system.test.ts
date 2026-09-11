import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const css = () => fs.readFileSync(path.join(root, 'app/globals.css'), 'utf8');
const layout = () => fs.readFileSync(path.join(root, 'app/layout.tsx'), 'utf8');

describe('dark-only design system', () => {
  it('defines the dark token set', () => {
    const c = css();
    for (const [tok, val] of [
      ['--color-bg', '#0b0d12'],
      ['--color-surf', '#12151c'],
      ['--color-line', '#232834'],
      ['--color-tx', '#d6dae2'],
      ['--color-mut', '#838b9a'],
      ['--color-dim', '#7b8393'],
      ['--color-acc', '#c8965a'],
      ['--color-acc2', '#7aa2c4'],
    ]) {
      expect(c, tok).toContain(`${tok}: ${val}`);
    }
  });

  it('has no light-theme machinery', () => {
    const c = css();
    expect(c).not.toContain('--color-terminal-bg');
    expect(c).not.toContain('@custom-variant dark');
    expect(c).not.toContain('prefers-color-scheme');
  });

  it('has no theme toggle or theme bootstrap script', () => {
    expect(fs.existsSync(path.join(root, 'components/ThemeToggle.tsx'))).toBe(false);
    expect(fs.existsSync(path.join(root, 'components/BootAnimation.tsx'))).toBe(false);
    expect(layout()).not.toContain('localStorage.getItem');
  });

  it('does not load the Inter webfont', () => {
    expect(layout()).not.toContain('fonts.googleapis.com');
    expect(layout()).not.toContain('fonts.gstatic.com');
  });
});

describe('body-text contrast (WCAG AA, 4.5:1)', () => {
  function relativeLuminance(hex: string): number {
    const n = hex.replace('#', '');
    const [r, g, b] = [0, 2, 4].map(i => parseInt(n.slice(i, i + 2), 16) / 255);
    const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  }

  function contrast(a: string, b: string): number {
    const [l1, l2] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
    return (l1 + 0.05) / (l2 + 0.05);
  }

  // --color-dim renders on the page background (footer, meta) and inside .panel /
  // bg-surf cards (tag pills, RoleList dates, FactsPanel keys) — both must clear AA.
  it('--color-dim clears 4.5:1 against both --color-bg and --color-surf', () => {
    expect(contrast('#0b0d12', '#7b8393')).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#12151c', '#7b8393')).toBeGreaterThanOrEqual(4.5);
  });

  // The "lapsed" credential badge (CertGrid) renders inside a .panel (bg-surf) card.
  it('--color-lapsed clears 4.5:1 against --color-surf', () => {
    expect(contrast('#12151c', '#b8894f')).toBeGreaterThanOrEqual(4.5);
  });
});
