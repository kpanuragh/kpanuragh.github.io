import { describe, it, expect } from 'vitest';
import { getPersonSchema, getWebSiteSchema, getProfilePageSchema } from '@/lib/schema';
import { siteConfig } from '@/lib/seo-config';

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
