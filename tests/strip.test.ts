import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { getAllPosts } from '@/lib/posts';

const root = process.cwd();

describe('content farm removal', () => {
  // Deliberately not an absolute count — Task 14 publishes the first real post.
  // The invariant is that nothing predating the redesign survives.
  it('has no machine-generated posts left', () => {
    const stale = getAllPosts().filter(p => p.date < '2026-09-11');
    expect(stale.map(p => p.slug)).toEqual([]);
  });

  it('has no auto-blog workflow', () => {
    expect(fs.existsSync(path.join(root, '.github/workflows/auto-blog-generation.yml'))).toBe(false);
  });

  it('has no legacy generator scripts', () => {
    for (const f of [
      'scripts/generate-blog.js',
      'scripts/batch-generate-blog.js',
      'scripts/fetch-trends.js',
      'scripts/fetch-topic-trends.js',
      'blog-config.json',
    ]) {
      expect(fs.existsSync(path.join(root, f)), f).toBe(false);
    }
  });

  it('has no Jekyll-era leftovers', () => {
    for (const f of ['_config.yml', 'index.html', 'styles.css', 'scripts.js', 'images']) {
      expect(fs.existsSync(path.join(root, f)), f).toBe(false);
    }
  });

  it('keeps the files the custom domain needs', () => {
    expect(fs.existsSync(path.join(root, 'CNAME'))).toBe(true);
    expect(fs.existsSync(path.join(root, '.nojekyll'))).toBe(true);
  });

  it('no longer exposes tag routes', () => {
    expect(fs.existsSync(path.join(root, 'app/blog/tags'))).toBe(false);
  });
});
