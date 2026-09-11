import { describe, it, expect } from 'vitest';
import { GET } from '@/app/feed.xml/route';
import { siteConfig } from '@/lib/seo-config';

describe('feed.xml', () => {
  it('emits trailing-slash post URLs, matching sitemap.xml and canonical links', async () => {
    const res = await GET();
    const xml = await res.text();

    // Every /blog/<slug> URL — inside <link> and <guid> — must end in a slash.
    const blogUrls = xml.match(new RegExp(`${siteConfig.url}/blog/[^<\\s]*`, 'g')) ?? [];
    expect(blogUrls.length).toBeGreaterThan(0);
    for (const url of blogUrls) {
      expect(url.endsWith('/')).toBe(true);
    }
  });
});
