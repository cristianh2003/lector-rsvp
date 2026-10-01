// Texto plano y Markdown.
import { splitParagraphs, type Block } from '../core/tokenizer';

export function importPlainText(text: string): Block[] {
  return splitParagraphs(text);
}

/**
 * Markdown a bloques: quita la sintaxis y convierte los encabezados en capítulos.
 * Los bloques de código se conservan como texto.
 */
export function importMarkdown(source: string): Block[] {
  const blocks: Block[] = [];
  const text = source.replace(/\r\n?/g, '\n');
  let paragraph: string[] = [];
  let inFence = false;

  const flush = () => {
    const joined = paragraph.join(' ').replace(/\s+/g, ' ').trim();
    paragraph = [];
    if (joined) blocks.push({ text: joined });
  };

  for (const rawLine of text.split('\n')) {
    if (/^\s*(```|~~~)/.test(rawLine)) {
      flush();
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      paragraph.push(rawLine);
      continue;
    }
    const line = rawLine.trim();
    if (line === '' || /^([-*_]\s*){3,}$/.test(line)) {
      flush();
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.*?)\s*#*$/);
    if (heading) {
      flush();
      const title = inlineMarkdown(heading[2]);
      // Los encabezados de nivel 1 y 2 abren capítulo; el título también se lee.
      blocks.push(heading[1].length <= 2 ? { text: title, chapter: title } : { text: title });
      continue;
    }
    // Cada elemento de lista es su propio párrafo.
    const listItem = line.match(/^([-*+]|\d+[.)])\s+(.*)$/);
    if (listItem) {
      flush();
      paragraph.push(inlineMarkdown(listItem[2]));
      continue;
    }
    paragraph.push(inlineMarkdown(line.replace(/^>\s?/, '')));
  }
  flush();
  return blocks;
}

function inlineMarkdown(s: string): string {
  return s
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1') // imágenes: texto alternativo
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // enlaces: solo el texto
    .replace(/<[^>]+>/g, '') // HTML en línea
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(\*|_)(.+?)\1/g, '$2')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/`([^`]+)`/g, '$1');
}
