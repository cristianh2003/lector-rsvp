import { describe, expect, it } from 'vitest';
import { orpForLength, orpIndex, splitAtOrp } from './orp';

describe('orpForLength', () => {
  it.each([
    [1, 0], [2, 1], [5, 1], [6, 2], [9, 2], [10, 3], [13, 3], [14, 4], [30, 4],
  ])('longitud %i → índice %i', (length, expected) => {
    expect(orpForLength(length)).toBe(expected);
  });
});

describe('orpIndex', () => {
  it('ignora la puntuación final', () => {
    expect(orpIndex('casa.')).toBe(1);
    expect(orpIndex('exercise.')).toBe(2); // 8 letras → 2, como en el video
  });

  it('suma la puntuación inicial', () => {
    expect(orpIndex('¿Qué')).toBe(2);
    expect(orpIndex('«hola»')).toBe(2);
    expect(orpIndex('¡¿Dónde?!')).toBe(3);
  });

  it('coincide con los ejemplos del video', () => {
    expect(splitAtOrp('Let’s').pivot).toBe('e');
    expect(splitAtOrp('things').pivot).toBe('i');
    expect(splitAtOrp('250').pivot).toBe('5');
    expect(splitAtOrp('minute').pivot).toBe('n');
    expect(splitAtOrp('a').pivot).toBe('a');
  });

  it('no cae en un espacio en grupos de palabras', () => {
    const text = 'de la casa';
    const i = orpIndex(text);
    expect(text[i]).not.toBe(' ');
  });

  it('texto vacío o solo puntuación', () => {
    expect(orpIndex('')).toBe(0);
    expect(orpIndex('—')).toBe(0);
  });
});

describe('splitAtOrp', () => {
  it('reconstruye el texto completo', () => {
    for (const w of ['internacionalización', '¿Por', 'qué?', '1,250.50', 'x']) {
      const { left, pivot, right } = splitAtOrp(w);
      expect(left + pivot + right).toBe(w);
    }
  });
});
