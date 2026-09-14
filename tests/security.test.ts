import { describe, it, expect, beforeAll } from 'vitest';
import { securityFindings } from '@/lib/security';
import { requireBuild, readOut } from './helpers/buildOutput';

describe('security findings data', () => {
  it('has exactly two findings', () => {
    expect(securityFindings.length).toBe(2);
  });

  it('has a langchain finding with the exact verified CVE and GHSA identifiers', () => {
    const langchain = securityFindings.find(f => f.packageName === '@langchain/community');
    expect(langchain).toBeDefined();
    expect(langchain!.cve).toBe('CVE-2026-26019');
    expect(langchain!.ghsaId).toBe('GHSA-gf3v-fwqg-4vh7');
    if (langchain!.cve !== null) {
      expect(langchain!.ghsaUrl).toBe('https://github.com/advisories/GHSA-gf3v-fwqg-4vh7');
      expect(langchain!.severity).toBe('medium');
      expect(langchain!.published).toBe('2026-02-11');
      expect(langchain!.affectedVersions).toBe('<= 1.1.13');
      expect(langchain!.patchedVersion).toBe('1.1.14');
    }
  });

  it('has a Laravel finding with cve explicitly null, never a string', () => {
    const laravel = securityFindings.find(f => f.packageName === 'laravel/framework');
    expect(laravel).toBeDefined();
    expect(laravel!.cve).toBeNull();
    if (laravel!.cve === null) {
      expect(laravel!.ghsaId).toBe('GHSA-9p82-4j4w-5hw8');
      expect(laravel!.ghsaStatus).toBe('closed_unpublished');
      expect(laravel!.commit).toBe('1dcf0b38');
      expect(laravel!.shippedIn).toBe('v12.48.0');
    }
  });

  it('never gives the Laravel finding a CVE-shaped string anywhere in its fields', () => {
    const laravel = securityFindings.find(f => f.packageName === 'laravel/framework')!;
    const text = JSON.stringify(laravel);
    expect(text).not.toMatch(/CVE-\d{4}-\d+/);
  });
});

describe('security findings reach the built pages', () => {
  beforeAll(() => {
    requireBuild();
  });

  it('homepage contains the verified langchain CVE', () => {
    const html = readOut('index.html');
    expect(html).toContain('CVE-2026-26019');
  });

  it('/about/ contains the verified langchain CVE', () => {
    const html = readOut('about/index.html');
    expect(html).toContain('CVE-2026-26019');
  });
});
