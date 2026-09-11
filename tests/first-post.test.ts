import { describe, it, expect } from 'vitest';
import { getAllPosts, getPostBySlug } from '@/lib/posts';

const SLUG = '2026-09-11-an-injection-vector-in-laravels-index-hints';

describe('first post', () => {
  it('is the only published post', () => {
    expect(getAllPosts().length).toBe(1);
  });

  it('has complete frontmatter', () => {
    const p = getPostBySlug(SLUG);
    expect(p.title.length).toBeGreaterThan(0);
    expect(p.excerpt.length).toBeGreaterThan(0);
    expect(p.tags.length).toBeGreaterThan(0);
    expect(p.date).toBe('2026-09-11');
  });

  it('never claims a CVE', () => {
    const c = getPostBySlug(SLUG).content;
    expect(c).not.toMatch(/CVE-\d{4}-\d+/);
    expect(c).not.toMatch(/I found a CVE/i);
  });

  it('cites the verifiable facts', () => {
    const c = getPostBySlug(SLUG).content;
    expect(c).toContain('v12.48.0');
    expect(c).toContain('1dcf0b38');
    expect(c).toContain('forceIndex');
  });
});
