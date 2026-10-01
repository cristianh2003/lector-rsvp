import { describe, expect, it } from 'vitest';
import { linesToBlocks, removeRepeatedLines, type PdfLine, type PdfPage } from './pdf';
import { importMarkdown } from './plain';

const line = (text: string, y: number, x = 72, width = 450): PdfLine => ({ text, x, y, width, height: 12 });

/** Página A4 (842 de alto) con encabezado, cuerpo y número de página. */
function page(n: number, body: PdfLine[]): PdfPage {
  return {
    bottom: 0,
    top: 842,
    lines: [line('Manual de lectura rápida', 802), ...body, line(`Página ${n} de 5`, 30, 280, 60)],
  };
}

describe('PDF', () => {
  it('quita encabezados y números de página repetidos, pero no el cuerpo repetido', () => {
    const pages = [1, 2, 3, 4, 5].map((n) => page(n, [line('Texto igual en todas las páginas.', 700, 72, 200)]));
    const cleaned = removeRepeatedLines(pages);
    for (const lines of cleaned) expect(lines.map((l) => l.text)).toEqual(['Texto igual en todas las páginas.']);
  });

  it('une palabras cortadas con guion y separa párrafos por el espacio vertical', () => {
    const blocks = linesToBlocks([
      [
        line('El texto sigue en la línea si-', 700),
        line('guiente y termina aquí con un punto final.', 686, 72, 300),
        line('Otro párrafo después de un espacio mayor.', 650, 72, 300),
      ],
    ]);
    expect(blocks.map((b) => b.text)).toEqual([
      'El texto sigue en la línea siguiente y termina aquí con un punto final.',
      'Otro párrafo después de un espacio mayor.',
    ]);
  });

  it('un párrafo que cruza de página empieza en la primera', () => {
    const blocks = linesToBlocks([
      [line('Primera línea de un párrafo que', 700), line('continúa en la siguiente página', 686)],
      [line('y aquí termina.', 700, 72, 120)],
    ]);
    expect(blocks).toEqual([
      { text: 'Primera línea de un párrafo que continúa en la siguiente página y aquí termina.', page: 1 },
    ]);
  });
});

describe('Markdown', () => {
  it('quita la sintaxis y convierte encabezados en capítulos', () => {
    const blocks = importMarkdown('# Notas\n\nUn **párrafo** con [enlace](http://x.com) y `código`.\n\n## Parte\n\n- uno\n- dos\n');
    expect(blocks).toEqual([
      { text: 'Notas', chapter: 'Notas' },
      { text: 'Un párrafo con enlace y código.' },
      { text: 'Parte', chapter: 'Parte' },
      { text: 'uno' },
      { text: 'dos' },
    ]);
  });
});
