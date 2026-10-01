// Punto óptimo de reconocimiento (ORP): la letra donde el ojo reconoce la palabra más rápido.

const LEADING_NON_WORD = /^[^\p{L}\p{N}]+/u;
const TRAILING_NON_WORD = /[^\p{L}\p{N}]+$/u;

/** Índice ORP (base 0) según la longitud de la palabra sin puntuación. */
export function orpForLength(length: number): number {
  if (length <= 1) return 0;
  if (length <= 5) return 1;
  if (length <= 9) return 2;
  if (length <= 13) return 3;
  return 4;
}

/**
 * Índice ORP dentro del texto mostrado, contando la puntuación inicial.
 * Sirve también para grupos de 2 o 3 palabras ("de la casa").
 */
export function orpIndex(text: string): number {
  if (text.length === 0) return 0;
  const lead = (text.match(LEADING_NON_WORD) ?? [''])[0].length;
  if (lead === text.length) return 0;
  const trail = (text.match(TRAILING_NON_WORD) ?? [''])[0].length;
  const coreLength = text.length - lead - trail;
  let index = lead + orpForLength(coreLength);
  // En grupos de palabras el índice puede caer en un espacio: se usa la letra siguiente.
  while (index < text.length - 1 && text[index] === ' ') index++;
  return Math.min(index, text.length - 1);
}

export interface OrpParts {
  left: string;
  pivot: string;
  right: string;
}

/** Divide el texto en izquierda, letra pivote y derecha. */
export function splitAtOrp(text: string): OrpParts {
  const chars = Array.from(text);
  // Array.from separa por puntos de código, así una letra con tilde compuesta no se corta.
  const index = orpIndex(chars.join(''));
  const safe = Math.min(index, Math.max(chars.length - 1, 0));
  return {
    left: chars.slice(0, safe).join(''),
    pivot: chars[safe] ?? '',
    right: chars.slice(safe + 1).join(''),
  };
}
