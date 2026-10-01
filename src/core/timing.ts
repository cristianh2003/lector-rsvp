// Duración de cada token y curva de aceleración.
import type { Token } from './tokenizer';

export interface TimingConfig {
  /** Coma, punto y coma, dos puntos, raya. */
  comma: number;
  /** Punto, ?, !, … */
  period: number;
  paragraph: number;
  longWord: number;
  /** Longitud a partir de la cual una palabra es "larga" (más de N caracteres). */
  longWordLength: number;
  number: number;
}

export const DEFAULT_TIMING: TimingConfig = {
  comma: 1.5,
  period: 2.0,
  paragraph: 2.5,
  longWord: 1.2,
  longWordLength: 8,
  number: 1.3,
};

/**
 * Aceleración gradual: la lectura empieza a `startWpm` y sube hasta la velocidad
 * elegida a lo largo de `words` palabras.
 */
export interface RampConfig {
  enabled: boolean;
  startWpm: number;
  words: number;
}

export const DEFAULT_RAMP: RampConfig = { enabled: true, startWpm: 180, words: 250 };

/** Arranque corto al reanudar tras una pausa breve: 8 palabras del 60 % al 100 %. */
export const WARMUP: { fraction: number; words: number } = { fraction: 0.6, words: 8 };

export const MIN_WPM = 100;
export const MAX_WPM = 1000;
export const WPM_STEP = 25;

export function clampWpm(wpm: number): number {
  return Math.min(MAX_WPM, Math.max(MIN_WPM, Math.round(wpm / WPM_STEP) * WPM_STEP));
}

/** Intervalo base en milisegundos para una velocidad dada. */
export function baseInterval(wpm: number): number {
  return 60000 / wpm;
}

const CLAUSE_RE = /[,;:—–]/;

function coreLength(token: Token): number {
  return token.text.length - token.lead.length - token.punctuation.length - (token.split ? 1 : 0);
}

/** Multiplicador de duración de un token (1 = intervalo base). */
export function tokenMultiplier(token: Token, config: TimingConfig = DEFAULT_TIMING): number {
  let pause = 1;
  if (token.paragraphEnd) pause = config.paragraph;
  else if (token.sentenceEnd) pause = config.period;
  else if (CLAUSE_RE.test(token.punctuation)) pause = config.comma;

  let multiplier = pause;
  if (token.isNumber) multiplier *= config.number;
  else if (coreLength(token) > config.longWordLength) multiplier *= config.longWord;
  return multiplier;
}

/** Duración en ms de un grupo de tokens mostrados juntos. */
export function chunkDuration(chunk: Token[], wpm: number, config: TimingConfig = DEFAULT_TIMING): number {
  const base = baseInterval(wpm);
  return chunk.reduce((sum, token) => sum + base * tokenMultiplier(token, config), 0);
}

const smoothstep = (t: number) => t * t * (3 - 2 * t);

/**
 * Velocidad efectiva tras `wordsSinceStart` palabras de una rampa que va de
 * `startWpm` a `targetWpm` en `rampWords` palabras. Curva suave en ambos extremos.
 */
export function rampedWpm(targetWpm: number, wordsSinceStart: number, startWpm: number, rampWords: number): number {
  if (rampWords <= 0 || startWpm >= targetWpm) return targetWpm;
  const t = Math.min(1, Math.max(0, wordsSinceStart / rampWords));
  return startWpm + (targetWpm - startWpm) * smoothstep(t);
}

/**
 * Suma acumulada de multiplicadores: prefix[i] es el peso de los tokens 0..i-1.
 * Permite estimar el tiempo restante en O(1).
 */
export function weightPrefix(tokens: Token[], config: TimingConfig = DEFAULT_TIMING): Float64Array {
  const prefix = new Float64Array(tokens.length + 1);
  for (let i = 0; i < tokens.length; i++) prefix[i + 1] = prefix[i] + tokenMultiplier(tokens[i], config);
  return prefix;
}

/** Tiempo restante estimado (ms) desde `index` hasta el final, a velocidad constante. */
export function remainingMs(prefix: Float64Array, index: number, wpm: number): number {
  const total = prefix[prefix.length - 1];
  const done = prefix[Math.min(Math.max(index, 0), prefix.length - 1)];
  return (total - done) * baseInterval(wpm);
}
