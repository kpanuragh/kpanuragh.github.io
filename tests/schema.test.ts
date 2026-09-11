import { describe, it, expect } from 'vitest';
import {
  getPersonSchema,
  getWebSiteSchema,
  getProfilePageSchema,
  getBlogSchema,
  getBlogPostingSchema,
  getBreadcrumbSchema,
  getWorkCollectionSchema,
  getContactPageSchema,
} from '@/lib/schema';
import { siteConfig } from '@/lib/seo-config';
import { roles } from '@/lib/cv';
import { projects } from '@/lib/projects';
import type { Post } from '@/lib/posts';

describe('person schema', () => {
  const p = getPersonSchema();

  it('uses Anuragh KP as the canonical name', () => {
    expect(p.name).toBe('Anuragh KP');
  });

  it('carries every spelling variant as alternateName', () => {
    expect(p.alternateName).toEqual([
      'Anuragh K P',
      'Anuragh K.P',
      'Anuragh K. P.',
      'K P Anuragh',
    ]);
  });

  it('places him in Kochi', () => {
    expect(p.address.addressLocality).toBe('Kochi');
    expect(p.address.addressRegion).toBe('Kerala');
    expect(p.address.addressCountry).toBe('IN');
  });

  it('links every profile in sameAs', () => {
    const s: string[] = p.sameAs;
    expect(s).toContain('https://github.com/kpanuragh');
    expect(s).toContain('https://www.linkedin.com/in/anuraghkp');
    expect(s).toContain('https://www.npmjs.com/~kpanuragh');
    expect(s).toContain('https://stackoverflow.com/users/9456940/anuragh-kp');
    expect(s.length).toBeGreaterThanOrEqual(6);
  });

  it('publishes all four certifications as credentials', () => {
    expect(p.hasCredential.length).toBe(4);
    const ceh = p.hasCredential.find((c: { name: string }) =>
      c.name.includes('Certified Ethical Hacker'));
    expect(ceh.validFrom).toBe('2021-09');
    expect(ceh.validUntil).toBe('2024-09');
  });

  it('uses a real contact address, not noreply', () => {
    expect(siteConfig.author.email).toBe('kpanuragh@gmail.com');
    expect(JSON.stringify(p)).not.toContain('noreply');
  });

  it('derives jobTitle and worksFor from the current Cubet role in lib/cv.ts, not a hardcoded value', () => {
    const cubet = roles.find(r => r.end === null && r.org === 'Cubet Techno Labs')!;
    expect(p.jobTitle).toBe(cubet.title);
    expect(p.worksFor).toEqual({ '@type': 'Organization', name: cubet.org });
  });
});

describe('site identity', () => {
  it('names the site after the person, not 0x55aa', () => {
    expect(siteConfig.name).toBe('Anuragh KP');
    expect(getWebSiteSchema().name).toBe('Anuragh KP');
  });

  it('exposes a ProfilePage whose mainEntity is the Person', () => {
    const pp = getProfilePageSchema();
    expect(pp['@type']).toBe('ProfilePage');
    expect(pp.mainEntity.name).toBe('Anuragh KP');
  });
});

describe('work collection schema', () => {
  const w = getWorkCollectionSchema();

  it('is a CollectionPage', () => {
    expect(w['@type']).toBe('CollectionPage');
  });

  it('wraps an ItemList in mainEntity', () => {
    expect(w.mainEntity['@type']).toBe('ItemList');
  });

  it('has one ListItem per project, in order, with a trailing-slash url', () => {
    const items = w.mainEntity.itemListElement;
    expect(items.length).toBe(projects.length);
    items.forEach((item: { position: number; name: string; description: string; url: string }, i: number) => {
      expect(item.position).toBe(i + 1);
      expect(item.name).toBe(projects[i].name);
      expect(item.description).toBe(projects[i].blurb);
      expect(item.url).toBe(`${siteConfig.url}/work/${projects[i].slug}/`);
    });
  });
});

describe('contact page schema', () => {
  const c = getContactPageSchema();

  it('is a ContactPage', () => {
    expect(c['@type']).toBe('ContactPage');
  });

  it('emits a trailing-slash url', () => {
    expect(c.url).toBe(`${siteConfig.url}/contact/`);
  });
});

describe('trailing-slash consistency', () => {
  // `next.config.ts` sets `trailingSlash: true` — every page route on this site resolves
  // with a trailing slash, and canonical links / sitemap.xml already reflect that. Any
  // same-origin *page* URL emitted by lib/schema.ts must agree, or mainEntityOfPage.@id
  // disagrees with the page's own <link rel="canonical">.

  const fakePost: Post = {
    slug: 'an-injection-vector-in-laravels-index-hints',
    title: 'A post',
    date: '2026-09-11',
    excerpt: 'excerpt',
    tags: ['security'],
    readingTime: '5 min read',
    content: 'word '.repeat(10),
  };

  // Collects every string value reachable from a JSON-LD object.
  function collectStrings(value: unknown, out: string[] = []): string[] {
    if (typeof value === 'string') {
      out.push(value);
    } else if (Array.isArray(value)) {
      value.forEach(v => collectStrings(v, out));
    } else if (value && typeof value === 'object') {
      Object.values(value).forEach(v => collectStrings(v, out));
    }
    return out;
  }

  // Same-origin URLs that point at a page (not a file asset like an image, and not a
  // mailto: link) must end in `/`, ignoring any query string.
  function pageUrls(strings: string[]): string[] {
    return strings.filter(s =>
      s.startsWith(siteConfig.url) &&
      !/\.(png|jpg|jpeg|svg|ico|webp|xml)(\?|$)/.test(s)
    );
  }

  function pathEndsInSlash(url: string): boolean {
    const withoutQuery = url.split('?')[0];
    return withoutQuery.endsWith('/');
  }

  it('getBlogSchema emits a trailing-slash blog index URL', () => {
    expect(getBlogSchema().url).toBe(`${siteConfig.url}/blog/`);
  });

  it('getBlogPostingSchema emits trailing-slash post URLs', () => {
    const posting = getBlogPostingSchema(fakePost);
    expect(posting.url).toBe(`${siteConfig.url}/blog/${fakePost.slug}/`);
    expect(posting.mainEntityOfPage['@id']).toBe(`${siteConfig.url}/blog/${fakePost.slug}/`);
  });

  it('getBreadcrumbSchema normalizes item URLs to a trailing slash, even for /work/<slug>', () => {
    const bc = getBreadcrumbSchema([
      { name: 'Home', url: '/' },
      { name: 'Work', url: '/work' },
      { name: 'zstd-js', url: '/work/zstd-js' },
    ]);
    const items: { item: string }[] = bc.itemListElement;
    expect(items.map(i => i.item)).toEqual([
      `${siteConfig.url}/`,
      `${siteConfig.url}/work/`,
      `${siteConfig.url}/work/zstd-js/`,
    ]);
  });

  it('no same-origin page URL emitted by lib/schema.ts lacks a trailing slash', () => {
    const all = [
      getWebSiteSchema(),
      getPersonSchema(),
      getProfilePageSchema(),
      getBlogSchema(),
      getBlogPostingSchema(fakePost),
      getWorkCollectionSchema(),
      getContactPageSchema(),
      getBreadcrumbSchema([
        { name: 'Home', url: '/' },
        { name: 'Blog', url: '/blog' },
        { name: fakePost.title, url: `/blog/${fakePost.slug}` },
      ]),
    ];
    const urls = pageUrls(all.flatMap(schema => collectStrings(schema)));
    const offenders = urls.filter(u => !pathEndsInSlash(u));
    expect(offenders).toEqual([]);
  });
});
