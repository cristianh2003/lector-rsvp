// Elige el importador según el tipo de archivo.
import type { Block } from '../core/tokenizer';
import type { DocumentKind } from '../storage/db';
import { importDocx } from './docx';
import { importEpub } from './epub';
import { ImportError } from './errors';
import { importPdf } from './pdf';
import { importMarkdown, importPlainText } from './plain';

export { ImportError } from './errors';

export interface ImportResult {
  title: string;
  kind: DocumentKind;
  blocks: Block[];
}

export const ACCEPTED_FILES = '.pdf,.docx,.epub,.txt,.md,.markdown,.text,.doc';

const OLE_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0];

export async function importFile(file: File, onProgress?: (fraction: number) => void): Promise<ImportResult> {
  const name = file.name;
  const extension = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
  const title = name.replace(/\.[^.]+$/, '');
  const buffer = await file.arrayBuffer();
  const head = new Uint8Array(buffer.slice(0, 4));

  if (extension === 'doc' || OLE_SIGNATURE.every((b, i) => head[i] === b)) {
    throw new ImportError(
      'Los archivos .doc antiguos no son compatibles. Ábrelo en Word o LibreOffice, guárdalo como .docx y vuelve a importarlo.',
    );
  }

  switch (extension) {
    case 'pdf':
      return { title, kind: 'pdf', blocks: await importPdf(buffer, onProgress) };
    case 'docx':
      return { title, kind: 'docx', blocks: await importDocx(buffer) };
    case 'epub': {
      const result = await importEpub(buffer);
      return { title: result.title ?? title, kind: 'epub', blocks: result.blocks };
    }
    case 'md':
    case 'markdown':
      return { title, kind: 'md', blocks: nonEmpty(importMarkdown(decode(buffer))) };
    case 'txt':
    case 'text':
    case '':
      return { title, kind: 'txt', blocks: nonEmpty(importPlainText(decode(buffer))) };
    default:
      throw new ImportError(`El formato .${extension} no es compatible. Usa PDF, DOCX, EPUB, TXT o MD.`);
  }
}

/** Decodifica como UTF-8; si hay caracteres inválidos, prueba Windows-1252 (texto antiguo en español). */
function decode(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('windows-1252').decode(buffer);
  }
}

function nonEmpty(blocks: Block[]): Block[] {
  if (blocks.length === 0) throw new ImportError('El archivo está vacío.');
  return blocks;
}

/** Título a partir de las primeras palabras de un texto pegado. */
export function titleFromText(text: string): string {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').slice(0, 7).join(' ');
  return words.length > 48 ? words.slice(0, 47) + '…' : words || 'Texto sin título';
}
