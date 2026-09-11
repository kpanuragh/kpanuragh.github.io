import { describe, it, expect } from 'vitest';
import { roles, certifications, yearsWorking } from '@/lib/cv';

describe('cv data', () => {
  it('lists six roles, newest first', () => {
    expect(roles.length).toBe(6);
    expect(roles[0].org).toBe('Kerala Police Cyberdome');
    expect(roles[roles.length - 1].org).toBe('Tekubez');
  });

  it('marks current roles with a null end date', () => {
    const current = roles.filter(r => r.end === null).map(r => r.org);
    expect(current).toEqual(['Kerala Police Cyberdome', 'Cubet Techno Labs']);
  });

  it('records Cubet as Technical Lead from Jan 2021', () => {
    const cubet = roles.find(r => r.org === 'Cubet Techno Labs')!;
    expect(cubet.title).toBe('Technical Lead');
    expect(cubet.start).toBe('2021-01');
    expect(cubet.end).toBeNull();
  });

  it('lists four certifications with CEH lapsed', () => {
    expect(certifications.length).toBe(4);
    const ceh = certifications.find(c => c.name.includes('Certified Ethical Hacker'))!;
    expect(ceh.lapsed).toBe(true);
    expect(ceh.issued).toBe('2021-09');
    expect(ceh.expires).toBe('2024-09');
    expect(ceh.credentialId).toBe('ECC5162079483');
  });

  it('has no lapsed Linux Foundation certificates', () => {
    const lf = certifications.filter(c => c.issuer === 'The Linux Foundation');
    expect(lf.length).toBe(3);
    expect(lf.every(c => c.lapsed === false)).toBe(true);
  });

  it('computes years working from May 2017', () => {
    expect(yearsWorking(new Date('2026-09-11'))).toBe(9);
  });
});
