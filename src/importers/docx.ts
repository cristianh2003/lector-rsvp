// Word (.docx): texto crudo con mammoth.
import { splitParagraphs, type Block } from '../core/tokenizer';
import { ImportError } from './errors';

export async function importDocx(buffer: ArrayBuffer): Promise<Block[]> {
  const mammoth = await import('mammoth');
  let value: string;
  try {
    ({ value } = await mammoth.extractRawText({ arrayBuffer: buffer }));
  } catch {
    throw new ImportError('No se pudo leer el .docx. Puede estar dañado o protegido con contraseña.');
  }
  // mammoth separa los párrafos con una línea en blanco.
  const blocks = splitParagraphs(value);
  if (blocks.length === 0) throw new ImportError('El documento de Word no contiene texto.');
  return blocks;
}
