import { describe, it, expect } from 'vitest';
import { projects, getProject, featuredProjects } from '@/lib/projects';

describe('projects data', () => {
  it('has unique slugs', () => {
    const slugs = projects.map(p => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('looks a project up by slug', () => {
    expect(getProject('zstd-js')?.name).toBe('zstd-js');
    expect(getProject('nope')).toBeUndefined();
  });

  it('returns only featured projects, and at least two', () => {
    const f = featuredProjects();
    expect(f.length).toBeGreaterThanOrEqual(2);
    expect(f.every(p => p.featured)).toBe(true);
  });

  it('gives every project a repo URL and prose body', () => {
    for (const p of projects) {
      expect(p.repo, p.slug).toMatch(/^https:\/\/github\.com\//);
      expect(p.body.length, p.slug).toBeGreaterThan(0);
    }
  });

  it('never quotes star counts', () => {
    const text = JSON.stringify(projects);
    expect(text).not.toMatch(/★/);
    expect(text).not.toMatch(/\bstars?\b/i);
  });
});
