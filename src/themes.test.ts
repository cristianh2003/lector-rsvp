import { describe, expect, it } from 'vitest';
import { blueComponent, contrastRatio, MIN_CONTRAST, THEMES } from './themes';

describe('temas', () => {
  it('los temas ámbar tienen el azul en cero en todos sus colores', () => {
    const amber = THEMES.filter((t) => t.amber);
    expect(amber.map((t) => t.id)).toEqual(['true-ambar', 'ambar-nocturno']);
    for (const theme of amber) {
      for (const color of [theme.bg, theme.text, theme.accent, theme.guide]) {
        expect(blueComponent(color), `${theme.name} ${color}`).toBe(0);
      }
    }
  });

  it('todos los temas cumplen contraste 4.5:1 entre texto y fondo', () => {
    for (const theme of THEMES) {
      expect(contrastRatio(theme.text, theme.bg), theme.name).toBeGreaterThanOrEqual(MIN_CONTRAST);
    }
  });

  it('contraste conocido: blanco sobre negro = 21', () => {
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21);
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1);
  });
});
