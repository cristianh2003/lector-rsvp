// PDF: extrae el texto con pdfjs, reconstruye párrafos y quita encabezados y números de página.
import type { Block } from '../core/tokenizer';
import { ImportError } from './errors';

export interface PdfPage {
  lines: PdfLine[];
  /** Coordenadas verticales del borde inferior y superior de la página (unidades PDF). */
  bottom: number;
  top: number;
}

export interface PdfLine {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface TextItemLike {
  str: string;
  transform: number[];
  width: number;
  height: number;
  hasEOL?: boolean;
}

export async function importPdf(buffer: ArrayBuffer, onProgress?: (fraction: number) => void): Promise<Block[]> {
  const pdfjs = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const task = pdfjs.getDocument({ data: new Uint8Array(buffer) });
  let pdf;
  try {
    pdf = await task.promise;
  } catch (error) {
    if ((error as Error)?.name === 'PasswordException') {
      throw new ImportError('El PDF está protegido con contraseña. Quita la protección y vuelve a importarlo.');
    }
    throw new ImportError('No se pudo abrir el PDF. Puede estar dañado.');
  }

  const pages: PdfPage[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const content = await page.getTextContent();
    const [, bottom, , top] = page.view;
    pages.push({
      lines: groupLines(content.items.filter((item) => 'str' in item) as TextItemLike[]),
      bottom,
      top,
    });
    page.cleanup();
    onProgress?.(n / pdf.numPages);
  }
  await task.destroy();

  const totalChars = pages.reduce((sum, page) => sum + page.lines.reduce((s, l) => s + l.text.length, 0), 0);
  if (totalChars < Math.max(40, pages.length * 15)) {
    throw new ImportError(
      'Este PDF no tiene texto seleccionable: parece escaneado (son imágenes). Esta versión no incluye reconocimiento de texto (OCR).',
    );
  }

  return linesToBlocks(removeRepeatedLines(pages));
}

/** Agrupa los fragmentos de texto de una página en líneas, según su posición vertical. */
export function groupLines(items: TextItemLike[]): PdfLine[] {
  const lines: PdfLine[] = [];
  let current: PdfLine | null = null;
  let lastEnd = 0;

  for (const item of items) {
    const x = item.transform[4];
    const y = item.transform[5];
    const height = item.height || Math.abs(item.transform[3]) || 10;
    const str = item.str;

    const sameLine = current !== null && Math.abs(current.y - y) < height * 0.5;
    if (!sameLine) {
      if (current && current.text.trim()) lines.push(current);
      current = { text: '', x, y, width: 0, height };
      lastEnd = x;
    }
    const line = current!;
    // Espacio entre fragmentos separados horizontalmente que no lo traen.
    if (line.text && x - lastEnd > height * 0.15 && !line.text.endsWith(' ') && !str.startsWith(' ')) line.text += ' ';
    line.text += str;
    line.height = Math.max(line.height, height);
    lastEnd = x + item.width;
    line.width = Math.max(line.width, lastEnd - line.x);
    if (item.hasEOL) {
      if (line.text.trim()) lines.push(line);
      current = null;
    }
  }
  if (current && current.text.trim()) lines.push(current);
  return lines.map((l) => ({ ...l, text: l.text.replace(/\s+/g, ' ').trim() }));
}

const normalizeForRepeat = (text: string) => text.replace(/\d+/g, '#').replace(/\s+/g, ' ').trim().toLowerCase();
const PAGE_NUMBER_RE = /^(p[áa]g(ina)?\.?\s*)?[-–—]?\s*\d{1,4}\s*[-–—]?(\s*(de|of|\/)\s*\d{1,4})?$/i;

/** Fracción de la altura de la página, arriba y abajo, donde se buscan encabezados y pies. */
const MARGIN_ZONE = 0.1;

/**
 * Quita encabezados y pies: líneas en la franja superior o inferior de la página que
 * se repiten (ignorando números) en muchas páginas, y los números de página sueltos.
 */
export function removeRepeatedLines(pages: PdfPage[]): PdfLine[][] {
  const inMargin = (line: PdfLine, page: PdfPage) => {
    const zone = (page.top - page.bottom) * MARGIN_ZONE;
    return line.y > page.top - zone || line.y < page.bottom + zone;
  };

  const counts = new Map<string, number>();
  for (const page of pages) {
    const keys = new Set(page.lines.filter((l) => inMargin(l, page)).map((l) => normalizeForRepeat(l.text)));
    for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const threshold = Math.max(3, Math.ceil(pages.length * 0.3));

  return pages.map((page) =>
    page.lines.filter((line) => {
      if (!inMargin(line, page)) return true;
      if (PAGE_NUMBER_RE.test(line.text)) return false;
      return (counts.get(normalizeForRepeat(line.text)) ?? 0) < threshold;
    }),
  );
}

const SENTENCE_END_RE = /[.!?…:»"”)]$/;

/** Une líneas en párrafos: un salto grande o una línea corta con punto final cierran párrafo. */
export function linesToBlocks(pages: PdfLine[][]): Block[] {
  const blocks: Block[] = [];
  let text = '';
  let startPage = 1;

  const flush = () => {
    const t = text.replace(/\s+/g, ' ').trim();
    if (t) blocks.push({ text: t, page: startPage });
    text = '';
  };

  const append = (lineText: string, page: number) => {
    if (!text) {
      startPage = page;
      text = lineText;
    } else if (/[a-záéíóúñü]-$/i.test(text) && /^[a-záéíóúñü]/.test(lineText)) {
      // Palabra cortada al final de la línea: "pala-" + "bra".
      text = text.slice(0, -1) + lineText;
    } else {
      text += ' ' + lineText;
    }
  };

  pages.forEach((lines, pageIndex) => {
    const page = pageIndex + 1;
    const gaps: number[] = [];
    for (let i = 1; i < lines.length; i++) {
      const gap = lines[i - 1].y - lines[i].y;
      if (gap > 0) gaps.push(gap);
    }
    const typicalGap = median(gaps) || 14;
    const maxWidth = Math.max(0, ...lines.map((l) => l.width));
    const minX = Math.min(...lines.map((l) => l.x));

    lines.forEach((line, i) => {
      if (i > 0) {
        const prev = lines[i - 1];
        const gap = prev.y - line.y;
        const bigGap = gap > typicalGap * 1.45 || gap < 0;
        const shortEnding = SENTENCE_END_RE.test(prev.text) && prev.width < maxWidth * 0.8;
        const indented = line.x - minX > line.height * 1.2 && SENTENCE_END_RE.test(prev.text);
        if (bigGap || shortEnding || indented) flush();
      }
      append(line.text, page);
    });
    // Un párrafo continúa en la página siguiente salvo que la página termine en punto.
    const last = lines[lines.length - 1];
    if (last && /[.!?…]["»”)]?$/.test(last.text) && last.width < maxWidth * 0.8) flush();
  });
  flush();
  return blocks;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  // Mediana inferior: en páginas con pocas líneas, el hueco grande no debe pasar por normal.
  return sorted[Math.floor((sorted.length - 1) / 2)];
}
