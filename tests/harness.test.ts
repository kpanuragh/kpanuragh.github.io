import { describe, it, expect } from 'vitest';
import { outExists } from './helpers/buildOutput';

describe('harness', () => {
  it('resolves the @/ path alias', async () => {
    const { siteConfig } = await import('@/lib/seo-config');
    expect(siteConfig.url).toBe('https://iamanuragh.in');
  });

  it('exposes a build-output helper', () => {
    expect(typeof outExists).toBe('function');
  });
});
