import { describe, expect, it } from 'vitest';
import { tokenizeText } from './tokenizer';
import {
  baseInterval,
  chunkDuration,
  clampWpm,
  DEFAULT_TIMING,
  rampedWpm,
  remainingMs,
  tokenMultiplier,
  weightPrefix,
} from './timing';

const tok = (text: string) => tokenizeText(text, { splitLongWords: false }).tokens;

describe('multiplicadores', () => {
  it('palabra corta sin puntuación = 1', () => {
    expect(tokenMultiplier(tok('hola mundo')[0])).toBe(1);
  });
  it('coma, punto y coma, dos puntos ×1.5', () => {
    for (const p of [',', ';', ':']) expect(tokenMultiplier(tok(`hola${p} mundo`)[0])).toBe(1.5);
  });
  it('punto, ? y ! ×2', () => {
    for (const p of ['.', '?', '!']) expect(tokenMultiplier(tok(`hola${p} mundo`)[0])).toBe(2);
  });
  it('fin de párrafo ×2.5 (no se multiplica con el punto)', () => {
    const t = tok('Fin.\n\nOtro');
    expect(t[0].paragraphEnd).toBe(true);
    expect(tokenMultiplier(t[0])).toBe(2.5);
  });
  it('palabra de más de 8 caracteres ×1.2', () => {
    expect(tokenMultiplier(tok('abcdefgh x')[0])).toBe(1);
    expect(tokenMultiplier(tok('abcdefghi x')[0])).toBeCloseTo(1.2);
  });
  it('números ×1.3', () => {
    expect(tokenMultiplier(tok('1,250.50 x')[0])).toBeCloseTo(1.3);
  });
  it('se combinan puntuación y longitud', () => {
    expect(tokenMultiplier(tok('extraordinario, x')[0])).toBeCloseTo(1.5 * 1.2);
  });
  it('respeta una configuración personalizada', () => {
    expect(tokenMultiplier(tok('hola. x')[0], { ...DEFAULT_TIMING, period: 3 })).toBe(3);
  });
});

describe('duración', () => {
  it('intervalo base = 60000 / wpm', () => {
    expect(baseInterval(300)).toBe(200);
    expect(baseInterval(600)).toBe(100);
  });

  it('criterio de aceptación: 3000 palabras a 300 ppm = 10 min ± 2 %', () => {
    const text = Array.from({ length: 3000 }, (_, i) => ['uno', 'dos', 'tres', 'casa', 'perro'][i % 5]).join(' ');
    const tokens = tok(text);
    expect(tokens).toHaveLength(3000);
    const total = tokens.reduce((ms, t) => ms + chunkDuration([t], 300), 0);
    const tenMinutes = 10 * 60 * 1000;
    expect(Math.abs(total - tenMinutes) / tenMinutes).toBeLessThan(0.02);
  });

  it('un grupo dura lo mismo que sus palabras por separado', () => {
    const t = tok('uno dos, tres');
    const separate = t.reduce((s, x) => s + chunkDuration([x], 400), 0);
    expect(chunkDuration(t, 400)).toBeCloseTo(separate);
  });

  it('tiempo restante', () => {
    const t = tok('a b c d');
    const prefix = weightPrefix(t);
    // a, b, c = 1 cada una; d cierra párrafo = 2.5
    expect(remainingMs(prefix, 0, 300)).toBeCloseTo(5.5 * 200);
    expect(remainingMs(prefix, 3, 300)).toBeCloseTo(2.5 * 200);
    expect(remainingMs(prefix, 4, 300)).toBe(0);
  });
});

describe('aceleración', () => {
  it('empieza en la velocidad inicial y termina en la elegida', () => {
    expect(rampedWpm(600, 0, 200, 100)).toBe(200);
    expect(rampedWpm(600, 100, 200, 100)).toBe(600);
    expect(rampedWpm(600, 500, 200, 100)).toBe(600);
  });
  it('sube de forma monótona', () => {
    let prev = 0;
    for (let w = 0; w <= 100; w += 5) {
      const v = rampedWpm(600, w, 200, 100);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
    expect(rampedWpm(600, 50, 200, 100)).toBeCloseTo(400);
  });
  it('sin rampa si la velocidad inicial ya es mayor', () => {
    expect(rampedWpm(150, 0, 200, 100)).toBe(150);
    expect(rampedWpm(600, 0, 200, 0)).toBe(600);
  });
  it('clampWpm redondea a pasos de 25 entre 100 y 1000', () => {
    expect(clampWpm(40)).toBe(100);
    expect(clampWpm(312)).toBe(300);
    expect(clampWpm(5000)).toBe(1000);
  });
});
