import { describe, expect, it } from 'vitest';
import {
  addMinutes,
  buildOfferWhatsappUrl,
  getOfferWindowMinutes,
  rangesOverlap,
} from '../src/services/waitlist.policy';

const HOUR = 60 * 60_000;
const now = new Date('2026-11-02T12:00:00Z');
const startsIn = (ms: number) => new Date(now.getTime() + ms);

describe('getOfferWindowMinutes (SPEC-002 AC-4, AC-8)', () => {
  it('da 30 minutos cuando faltan más de 12 horas', () => {
    expect(getOfferWindowMinutes(startsIn(13 * HOUR), now)).toBe(30);
  });

  it('da 10 minutos cuando faltan 12 horas o menos', () => {
    expect(getOfferWindowMinutes(startsIn(12 * HOUR), now)).toBe(10);
    expect(getOfferWindowMinutes(startsIn(2 * HOUR), now)).toBe(10);
    expect(getOfferWindowMinutes(startsIn(60 * 60_000), now)).toBe(10);
  });

  it('no ofrece cuando faltan menos de 60 minutos', () => {
    expect(getOfferWindowMinutes(startsIn(59 * 60_000), now)).toBeNull();
    expect(getOfferWindowMinutes(startsIn(-5 * 60_000), now)).toBeNull();
  });
});

describe('rangesOverlap (AC-3)', () => {
  const start = new Date('2026-11-02T18:00:00Z');
  const end = addMinutes(start, 75);

  it('detecta solapamiento parcial', () => {
    expect(rangesOverlap(start, end, addMinutes(start, 60), addMinutes(start, 135))).toBe(true);
  });

  it('no considera solapadas clases consecutivas', () => {
    expect(rangesOverlap(start, end, end, addMinutes(end, 75))).toBe(false);
  });
});

describe('buildOfferWhatsappUrl (AC-12)', () => {
  it('arma un enlace wa.me con el mensaje codificado y solo dígitos en el teléfono', () => {
    const url = buildOfferWhatsappUrl({
      phone: '+54 9 387 555-1234',
      studentName: 'María Pérez',
      className: 'Hatha Flow',
      startsAt: new Date('2026-11-03T22:00:00Z'),
      offerExpiresAt: new Date('2026-11-02T12:30:00Z'),
    });

    expect(url.startsWith('https://wa.me/5493875551234?text=')).toBe(true);
    const text = decodeURIComponent(url.split('?text=')[1]);
    expect(text).toContain('Hola María!');
    expect(text).toContain('Hatha Flow');
    expect(text).toContain('Respondé "SÍ"');
  });
});
