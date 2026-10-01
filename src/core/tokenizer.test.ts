import { describe, expect, it } from 'vitest';
import { splitLongWord, splitParagraphs, tokenizeBlocks, tokenizeText } from './tokenizer';

describe('tokenizeText', () => {
  it('normaliza espacios y marca fin de párrafo', () => {
    const { tokens } = tokenizeText('Hola   mundo.\n\nSegundo   párrafo');
    expect(tokens.map((t) => t.text)).toEqual(['Hola', 'mundo.', 'Segundo', 'párrafo']);
    expect(tokens[1].paragraphEnd).toBe(true);
    expect(tokens[3].paragraphEnd).toBe(true);
    expect(tokens[0].paragraphEnd).toBeUndefined();
    expect(tokens.map((t) => t.paragraphIndex)).toEqual([0, 0, 1, 1]);
  });

  it('guarda índices de oración', () => {
    const { tokens } = tokenizeText('Una frase. ¿Otra? Sí, claro.');
    expect(tokens.map((t) => t.sentenceIndex)).toEqual([0, 0, 1, 2, 2]);
    expect(tokens[1].sentenceEnd).toBe(true);
    expect(tokens[1].punctuation).toBe('.');
    expect(tokens[2].lead).toBe('¿');
    expect(tokens[3].punctuation).toBe(',');
  });

  it('las abreviaturas no cierran la oración', () => {
    const { tokens } = tokenizeText('El Sr. Pérez llegó. Luego J. Smith.');
    expect(tokens.map((t) => t.sentenceIndex)).toEqual([0, 0, 0, 0, 1, 1, 1]);
  });

  it('mantiene juntos números, URLs y palabras compuestas', () => {
    const { tokens } = tokenizeText('Cuesta 1,250.50 en https://ejemplo.com/una-ruta-muy-larga y es franco-alemán.');
    const texts = tokens.map((t) => t.text);
    expect(texts).toContain('1,250.50');
    expect(texts).toContain('https://ejemplo.com/una-ruta-muy-larga');
    expect(texts).toContain('franco-alemán.');
    expect(tokens.find((t) => t.text === '1,250.50')?.isNumber).toBe(true);
  });

  it('divide palabras de más de 13 caracteres con guion', () => {
    const { tokens } = tokenizeText('la internacionalización.');
    expect(tokens.map((t) => t.text)).toEqual(['la', 'internacio-', 'nalización.']);
    expect(tokens[1].split).toBe(true);
    expect(tokens[2].sentenceEnd).toBe(true);
    expect(tokens[1].sentenceIndex).toBe(tokens[2].sentenceIndex);
  });

  it('la división se puede desactivar', () => {
    const { tokens } = tokenizeText('internacionalización', { splitLongWords: false });
    expect(tokens.map((t) => t.text)).toEqual(['internacionalización']);
  });

  it('une la puntuación suelta a la palabra anterior', () => {
    const { tokens } = tokenizeText('dijo — y se fue …');
    expect(tokens.map((t) => t.text)).toEqual(['dijo —', 'y', 'se', 'fue …']);
  });

  it('párrafos por saltos simples si no hay líneas en blanco', () => {
    expect(splitParagraphs('uno\ndos\ntres')).toHaveLength(3);
    expect(splitParagraphs('uno\ndos\n\ntres')).toHaveLength(2);
  });
});

describe('tokenizeBlocks', () => {
  it('registra capítulos y páginas', () => {
    const doc = tokenizeBlocks([
      { text: 'Primer capítulo.', chapter: 'Uno', page: 1 },
      { text: 'Sigue.', page: 1 },
      { text: 'Segundo.', chapter: 'Dos', page: 2 },
    ]);
    expect(doc.chapters).toEqual([{ title: 'Uno', start: 0 }, { title: 'Dos', start: 3 }]);
    expect(doc.pages).toEqual([{ page: 1, start: 0 }, { page: 2, start: 3 }]);
    expect(doc.tokens.map((t) => t.chapterIndex)).toEqual([0, 0, 0, 1]);
  });

  it('los índices son consecutivos', () => {
    const { tokens } = tokenizeText('a b c.\n\nd e');
    tokens.forEach((t, i) => expect(t.index).toBe(i));
  });
});

describe('splitLongWord', () => {
  it('ninguna parte supera 13 caracteres', () => {
    for (const w of ['electroencefalografista', 'anticonstitucionalmente', 'otorrinolaringólogo']) {
      const parts = splitLongWord(w);
      expect(parts.join('')).toBe(w);
      parts.forEach((p) => expect(p.length).toBeLessThanOrEqual(13));
    }
  });
});
