import { describe, it, expect, beforeAll } from 'vitest';
import { requireBuild, readOut } from './helpers/buildOutput';

let html = '';
beforeAll(() => {
  requireBuild();
  html = readOut('index.html');
});

describe('homepage build output', () => {
  it('states employer, title, city as literal text', () => {
    expect(html).toContain('Technical Lead');
    expect(html).toContain('Cubet Techno Labs');
    expect(html).toContain('Kochi');
  });

  it('names the Cyberdome credential', () => {
    expect(html).toContain('Kerala Police Cyberdome');
  });

  it('makes the approved Laravel claim and never a CVE claim for it', () => {
    expect(html).toContain('v12.48.0');
    expect(html).toContain('1dcf0b38');
    expect(html).not.toMatch(/CVE in Laravel/i);
    // The site now carries one real, verified CVE (langchain, see below) — the
    // Laravel-specific proximity check lives in tests/banned-copy.test.ts, which
    // isolates each finding's own rendered block via its `data-finding` marker.
    const found = html.match(/CVE-\d{4}-\d+/g) ?? [];
    for (const cve of found) {
      expect(cve).toBe('CVE-2026-26019');
    }
  });

  it('shows CEH as lapsed with its date range', () => {
    expect(html).toContain('2021');
    expect(html).toContain('2024');
    expect(html).toMatch(/lapsed/i);
  });

  it('carries no banned promotional copy', () => {
    expect(html).not.toMatch(/survive contact with production/i);
    expect(html).not.toContain('★');
    expect(html).not.toMatch(/>\s*Work with me\s*</);
  });

  it('embeds ProfilePage JSON-LD', () => {
    expect(html).toContain('"@type":"ProfilePage"');
    expect(html).toContain('"alternateName"');
  });

  it('embeds WebSite JSON-LD with no potentialAction', () => {
    expect(html).toContain('"@type":"WebSite"');
    expect(html).not.toContain('potentialAction');
    expect(html).not.toContain('SearchAction');
  });

  it('mentions langchain only alongside its verified CVE', () => {
    // Verified 2026-02-11: CVE-2026-26019 / GHSA-gf3v-fwqg-4vh7, reporter credit.
    // This was previously "mentions langchain nowhere" while the claim was
    // unverified — see lib/security.ts and CLAUDE.md's "Facts and claim
    // discipline" section for the source of truth.
    expect(html.toLowerCase()).toContain('langchain');
    expect(html).toContain('CVE-2026-26019');
    expect(html).toContain('GHSA-gf3v-fwqg-4vh7');
  });
});
