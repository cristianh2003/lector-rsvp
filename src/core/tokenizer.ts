// Convierte texto en una lista de tokens (palabras o fragmentos) listos para mostrar.

export interface Token {
  /** Texto tal como se muestra, con su puntuación. */
  text: string;
  index: number;
  sentenceIndex: number;
  paragraphIndex: number;
  chapterIndex: number;
  /** Puntuación inicial (comillas, ¿, ¡, paréntesis...). */
  lead: string;
  /** Puntuación final (coma, punto, comillas de cierre...). */
  punctuation: string;
  paragraphEnd?: boolean;
  sentenceEnd?: boolean;
  isNumber?: boolean;
  /** Primera mitad de una palabra larga dividida con guion. */
  split?: boolean;
}

/** Un párrafo de entrada. Los importadores producen una lista de bloques. */
export interface Block {
  text: string;
  /** Si está presente, este bloque abre un capítulo con ese título. */
  chapter?: string;
  /** Página (PDF) en la que empieza el bloque. */
  page?: number;
}

export interface Chapter {
  title: string;
  start: number;
}

export interface PageMark {
  page: number;
  start: number;
}

export interface TokenizedDocument {
  tokens: Token[];
  chapters: Chapter[];
  pages: PageMark[];
}

export interface TokenizerOptions {
  /** Dividir palabras de más de 13 caracteres en dos tokens con guion. */
  splitLongWords: boolean;
}

export const DEFAULT_TOKENIZER_OPTIONS: TokenizerOptions = { splitLongWords: true };

export const LONG_WORD_LIMIT = 13;

const LEAD_RE = /^[¿¡"'«“‘„(\[{—–]+/;
const TRAIL_RE = /[.,;:!?…"'»”’)\]}—–]+$/;
const SENTENCE_END_RE = /[.!?…]/;
const NUMBER_RE = /^[+\-−]?[$€£]?\d[\d.,:/]*%?$/;
const URL_RE = /(:\/\/|^www\.|@|\/)/i;

// Abreviaturas que terminan en punto sin cerrar la oración.
const ABBREVIATIONS = new Set([
  'sr', 'sra', 'srta', 'dr', 'dra', 'ud', 'uds', 'vd', 'vds', 'lic', 'ing', 'prof', 'pág', 'págs',
  'núm', 'art', 'cap', 'fig', 'vol', 'ej', 'p', 'pp', 'aprox', 'av', 'avda', 'cía', 'dpto',
  'mr', 'mrs', 'ms', 'st', 'vs', 'e.g', 'i.e',
]);

/** Divide un texto plano en bloques de párrafo. */
export function splitParagraphs(text: string): Block[] {
  const normalized = text.replace(/\r\n?/g, '\n').replace(/ /g, ' ');
  // Si hay líneas en blanco, son ellas las que separan párrafos; si no, cada salto de línea.
  const separator = /\n[ \t]*\n/.test(normalized) ? /\n[ \t]*\n+/ : /\n+/;
  return normalized
    .split(separator)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter((p) => p.length > 0)
    .map((p) => ({ text: p }));
}

export function tokenizeText(text: string, options?: Partial<TokenizerOptions>): TokenizedDocument {
  return tokenizeBlocks(splitParagraphs(text), options);
}

export function tokenizeBlocks(blocks: Block[], options?: Partial<TokenizerOptions>): TokenizedDocument {
  const opts = { ...DEFAULT_TOKENIZER_OPTIONS, ...options };
  const tokens: Token[] = [];
  const chapters: Chapter[] = [];
  const pages: PageMark[] = [];

  let sentenceIndex = 0;
  let paragraphIndex = 0;
  let chapterIndex = 0;

  for (const block of blocks) {
    const words = block.text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
    if (words.length === 0) continue;

    if (block.chapter !== undefined) {
      if (chapters.length > 0) chapterIndex++;
      chapters.push({ title: block.chapter, start: tokens.length });
    }
    if (block.page !== undefined && (pages.length === 0 || pages[pages.length - 1].page !== block.page)) {
      pages.push({ page: block.page, start: tokens.length });
    }

    const paragraphStart = tokens.length;
    let pendingLead = '';

    for (const raw of words) {
      const lead = (raw.match(LEAD_RE) ?? [''])[0];
      const rest = raw.slice(lead.length);
      const punctuation = (rest.match(TRAIL_RE) ?? [''])[0];
      const core = rest.slice(0, rest.length - punctuation.length);

      // Puntuación suelta ("—", "...", "»"): se une a la palabra vecina.
      if (core.length === 0) {
        const prev = tokens.length > paragraphStart ? tokens[tokens.length - 1] : undefined;
        if (prev && !/^[¿¡«“‘„(\[{]/.test(raw)) {
          prev.text += ' ' + raw;
          prev.punctuation += raw;
          if (SENTENCE_END_RE.test(raw)) prev.sentenceEnd = true;
        } else {
          pendingLead += raw + ' ';
        }
        continue;
      }

      const fullLead = pendingLead + lead;
      pendingLead = '';
      const isNumber = NUMBER_RE.test(core);
      const sentenceEnd = isSentenceEnd(core, punctuation);

      const base = { sentenceIndex, paragraphIndex, chapterIndex };
      const parts =
        opts.splitLongWords && !isNumber && !URL_RE.test(core) ? splitLongWord(core) : [core];

      parts.forEach((part, i) => {
        const first = i === 0;
        const last = i === parts.length - 1;
        tokens.push({
          text: (first ? fullLead : '') + part + (last ? punctuation : '-'),
          index: tokens.length,
          ...base,
          lead: first ? fullLead : '',
          punctuation: last ? punctuation : '',
          ...(isNumber ? { isNumber: true } : {}),
          ...(!last ? { split: true } : {}),
          ...(last && sentenceEnd ? { sentenceEnd: true } : {}),
        });
      });

      if (sentenceEnd) sentenceIndex++;
    }

    if (tokens.length > paragraphStart) {
      const lastToken = tokens[tokens.length - 1];
      lastToken.paragraphEnd = true;
      // Un párrafo siempre cierra la oración, aunque no termine en punto.
      if (!lastToken.sentenceEnd) sentenceIndex++;
      paragraphIndex++;
    }
  }

  return { tokens, chapters, pages };
}

function isSentenceEnd(core: string, punctuation: string): boolean {
  if (!SENTENCE_END_RE.test(punctuation)) return false;
  // "Sr." o "J." no cierran oración; "¿Sr.?" sí porque trae otro signo.
  if (/^[.]["'»”’)\]]*$/.test(punctuation)) {
    const lower = core.toLowerCase();
    if (ABBREVIATIONS.has(lower)) return false;
    if (/^\p{Lu}$/u.test(core)) return false;
  }
  return true;
}

const VOWELS = new Set('aeiouáéíóúüAEIOUÁÉÍÓÚÜ');
const INSEPARABLE = new Set(['bl', 'br', 'cl', 'cr', 'dr', 'fl', 'fr', 'gl', 'gr', 'pl', 'pr', 'tr', 'ch', 'll', 'rr', 'qu', 'gu']);

const isVowel = (c: string) => VOWELS.has(c);
const isLetter = (c: string) => /\p{L}/u.test(c);

/**
 * Divide una palabra larga en partes de hasta LONG_WORD_LIMIT caracteres,
 * buscando un corte silábico cerca del centro.
 */
export function splitLongWord(word: string): string[] {
  if (word.length <= LONG_WORD_LIMIT) return [word];

  // Palabras compuestas con guion: cortar en el guion más cercano al centro.
  const hyphenPositions = [...word.matchAll(/-/g)].map((m) => m.index!).filter((p) => p > 0 && p < word.length - 1);
  if (hyphenPositions.length > 0) {
    const mid = word.length / 2;
    const cut = hyphenPositions.reduce((a, b) => (Math.abs(b - mid) < Math.abs(a - mid) ? b : a));
    // El guion se quita aquí; el tokenizador lo vuelve a poner al final de la primera parte.
    const left = word.slice(0, cut);
    const right = word.slice(cut + 1);
    return [...splitLongWord(left), ...splitLongWord(right)];
  }

  const cut = findSyllableCut(word);
  return [...splitLongWord(word.slice(0, cut)), ...splitLongWord(word.slice(cut))];
}

function findSyllableCut(word: string): number {
  const n = word.length;
  const mid = Math.round(n / 2);
  const min = 4;
  const max = n - 4;
  for (let d = 0; d <= n; d++) {
    for (const p of [mid + d, mid - d]) {
      if (p < min || p > max) continue;
      const a = word[p - 1];
      const b = word[p];
      const c = word[p + 1] ?? '';
      if (!isLetter(a) || !isLetter(b)) continue;
      // Vocal | consonante + vocal  (ci-o-na → cio-na)
      if (isVowel(a) && !isVowel(b) && isVowel(c)) return p;
      // consonante | consonante + vocal, si el par no es inseparable (in-ter)
      if (!isVowel(a) && !isVowel(b) && isVowel(c) && !INSEPARABLE.has((a + b).toLowerCase())) return p;
    }
  }
  return mid;
}
