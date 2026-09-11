import { describe, it, expect, beforeAll } from 'vitest';
import { requireBuild, readOut, outExists } from './helpers/buildOutput';

let html = '';
beforeAll(() => {
  requireBuild();
  html = readOut('about/index.html');
});

describe('about page', () => {
  it('mentions the spaced name variant in visible prose', () => {
    expect(html).toContain('Anuragh K P');
  });

  it('lists every employer', () => {
    for (const org of ['Cubet Techno Labs', 'Bramma IT Solutions', 'Acodez', 'Sparrow Solution', 'Tekubez']) {
      expect(html, org).toContain(org);
    }
  });

  it('embeds Person JSON-LD with credentials', () => {
    expect(html).toContain('"@type":"Person"');
    expect(html).toContain('EducationalOccupationalCredential');
  });

  it('builds a contact page', () => {
    expect(outExists('contact/index.html')).toBe(true);
  });
});
