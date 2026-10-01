// EPUB: lee container.xml → content.opf y recorre el spine en orden con JSZip + DOMParser.
import type JSZip from 'jszip';
import type { Block } from '../core/tokenizer';
import { ImportError } from './errors';

export interface EpubResult {
  title: string | null;
  blocks: Block[];
}

// Algoritmos de ofuscación de fuentes: no son DRM y no impiden leer el texto.
const FONT_OBFUSCATION = ['http://www.idpf.org/2008/embedding', 'http://ns.adobe.com/pdf/enc#RC'];

const BLOCK_TAGS = new Set([
  'p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'pre', 'section', 'article',
  'header', 'footer', 'aside', 'figcaption', 'dt', 'dd', 'tr', 'td', 'th', 'table', 'ul', 'ol', 'hr', 'br',
]);
const SKIP_TAGS = new Set(['script', 'style', 'head', 'title', 'svg', 'math', 'rt', 'rp']);

export async function importEpub(buffer: ArrayBuffer): Promise<EpubResult> {
  const { default: JSZipCtor } = await import('jszip');
  let zip: JSZip;
  try {
    zip = await JSZipCtor.loadAsync(buffer);
  } catch {
    throw new ImportError('No se pudo abrir el EPUB: el archivo no es un ZIP válido o está dañado.');
  }

  await assertNoDrm(zip);

  const container = await readXml(zip, 'META-INF/container.xml');
  const opfPath = container?.querySelector('rootfile')?.getAttribute('full-path');
  if (!opfPath) throw new ImportError('El EPUB no tiene un content.opf válido.');
  const opf = await readXml(zip, opfPath);
  if (!opf) throw new ImportError('No se pudo leer el content.opf del EPUB.');
  const baseDir = dirname(opfPath);

  const title = opf.getElementsByTagNameNS('*', 'title')[0]?.textContent?.trim() || null;

  const manifest = new Map<string, { href: string; type: string; properties: string }>();
  for (const item of Array.from(opf.getElementsByTagNameNS('*', 'item'))) {
    manifest.set(item.getAttribute('id') ?? '', {
      href: resolvePath(baseDir, item.getAttribute('href') ?? ''),
      type: item.getAttribute('media-type') ?? '',
      properties: item.getAttribute('properties') ?? '',
    });
  }

  const spineEl = opf.getElementsByTagNameNS('*', 'spine')[0];
  const spine = Array.from(opf.getElementsByTagNameNS('*', 'itemref'))
    .filter((ref) => ref.getAttribute('linear') !== 'no')
    .map((ref) => manifest.get(ref.getAttribute('idref') ?? ''))
    .filter((item): item is { href: string; type: string; properties: string } => Boolean(item));

  const toc = await readToc(zip, manifest, spineEl?.getAttribute('toc') ?? null);

  const blocks: Block[] = [];
  for (const item of spine) {
    const doc = await readXml(zip, item.href, 'application/xhtml+xml');
    if (!doc) continue;
    const paragraphs = extractParagraphs(doc.body ?? doc.documentElement);
    if (paragraphs.length === 0) continue;
    const heading = doc.querySelector('h1, h2, h3')?.textContent?.replace(/\s+/g, ' ').trim();
    const chapterTitle = toc.get(item.href) ?? heading;
    paragraphs.forEach((text, i) => {
      blocks.push(i === 0 && chapterTitle ? { text, chapter: chapterTitle } : { text });
    });
  }

  if (blocks.length === 0) throw new ImportError('El EPUB no contiene texto legible.');
  return { title, blocks };
}

async function assertNoDrm(zip: JSZip): Promise<void> {
  const drmMessage = 'Este EPUB tiene DRM (protección anticopia) y no es compatible. Usa una versión sin DRM.';
  if (zip.file('META-INF/rights.xml')) throw new ImportError(drmMessage);
  const encryption = await readXml(zip, 'META-INF/encryption.xml');
  if (!encryption) return;
  const methods = Array.from(encryption.getElementsByTagNameNS('*', 'EncryptionMethod')).map(
    (m) => m.getAttribute('Algorithm') ?? '',
  );
  if (methods.some((algorithm) => !FONT_OBFUSCATION.includes(algorithm))) throw new ImportError(drmMessage);
}

/** Títulos de capítulo por archivo, desde el nav de EPUB 3 o el toc.ncx de EPUB 2. */
async function readToc(
  zip: JSZip,
  manifest: Map<string, { href: string; type: string; properties: string }>,
  ncxId: string | null,
): Promise<Map<string, string>> {
  const titles = new Map<string, string>();
  const add = (base: string, href: string | null, label: string | null | undefined) => {
    const clean = label?.replace(/\s+/g, ' ').trim();
    if (!href || !clean) return;
    const path = resolvePath(base, href.split('#')[0]);
    if (!titles.has(path)) titles.set(path, clean);
  };

  const nav = [...manifest.values()].find((item) => item.properties.split(/\s+/).includes('nav'));
  if (nav) {
    const doc = await readXml(zip, nav.href, 'application/xhtml+xml');
    const tocNav =
      Array.from(doc?.getElementsByTagName('nav') ?? []).find((n) => n.getAttribute('epub:type')?.includes('toc')) ??
      doc?.getElementsByTagName('nav')[0];
    for (const a of Array.from(tocNav?.getElementsByTagName('a') ?? [])) add(dirname(nav.href), a.getAttribute('href'), a.textContent);
  }

  const ncx = (ncxId && manifest.get(ncxId)) || [...manifest.values()].find((i) => i.type === 'application/x-dtbncx+xml');
  if (ncx && titles.size === 0) {
    const doc = await readXml(zip, ncx.href);
    for (const point of Array.from(doc?.getElementsByTagNameNS('*', 'navPoint') ?? [])) {
      const label = point.getElementsByTagNameNS('*', 'text')[0]?.textContent;
      const src = point.getElementsByTagNameNS('*', 'content')[0]?.getAttribute('src') ?? null;
      add(dirname(ncx.href), src, label);
    }
  }
  return titles;
}

/** Recorre el HTML y devuelve un texto por cada bloque (párrafo, título, elemento de lista...). */
export function extractParagraphs(root: Element): string[] {
  const paragraphs: string[] = [];
  let current = '';
  const flush = () => {
    const text = current.replace(/\s+/g, ' ').trim();
    if (text) paragraphs.push(text);
    current = '';
  };
  const walk = (node: Node) => {
    if (node.nodeType === 3) {
      current += node.textContent ?? '';
      return;
    }
    if (node.nodeType !== 1) return;
    const tag = (node as Element).localName.toLowerCase();
    if (SKIP_TAGS.has(tag)) return;
    const isBlock = BLOCK_TAGS.has(tag);
    if (isBlock) flush();
    node.childNodes.forEach(walk);
    if (isBlock) flush();
  };
  walk(root);
  flush();
  return paragraphs;
}

async function readXml(zip: JSZip, path: string, type: DOMParserSupportedType = 'application/xml'): Promise<Document | null> {
  const file = zip.file(path) ?? zip.file(decodeURIComponent(path));
  if (!file) return null;
  const text = await file.async('string');
  const parser = new DOMParser();
  let doc = parser.parseFromString(text, type);
  if (doc.getElementsByTagName('parsererror').length > 0 && type !== 'text/html') {
    // Muchos EPUB traen XHTML mal formado; el analizador HTML es más tolerante.
    doc = parser.parseFromString(text, 'text/html');
  }
  return doc;
}

function dirname(path: string): string {
  const i = path.lastIndexOf('/');
  return i === -1 ? '' : path.slice(0, i + 1);
}

function resolvePath(base: string, href: string): string {
  const parts = (base + decodeURIComponent(href)).split('/');
  const out: string[] = [];
  for (const part of parts) {
    if (part === '..') out.pop();
    else if (part !== '.' && part !== '') out.push(part);
  }
  return out.join('/');
}
