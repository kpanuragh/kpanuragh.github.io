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

  it('makes the approved Laravel claim and never a CVE claim', () => {
    expect(html).toContain('v12.48.0');
    expect(html).toContain('1dcf0b38');
    expect(html).not.toMatch(/CVE in Laravel/i);
    expect(html).not.toMatch(/CVE-\d{4}-\d+/);
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

  it('mentions langchain nowhere', () => {
    expect(html.toLowerCase()).not.toContain('langchain');
  });
});
