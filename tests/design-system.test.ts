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
      ['--color-dim', '#5d6575'],
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
