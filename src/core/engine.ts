// Reproductor RSVP: avanza por los tokens respetando la duración de cada uno.
import type { Token } from './tokenizer';
import {
  chunkDuration,
  DEFAULT_RAMP,
  DEFAULT_TIMING,
  rampedWpm,
  WARMUP,
  type RampConfig,
  type TimingConfig,
} from './timing';

export interface EngineSettings {
  wpm: number;
  chunkSize: number;
  timing: TimingConfig;
  ramp: RampConfig;
}

export const DEFAULT_ENGINE_SETTINGS: EngineSettings = {
  wpm: 400,
  chunkSize: 1,
  timing: DEFAULT_TIMING,
  ramp: DEFAULT_RAMP,
};

export interface WordEvent {
  index: number;
  chunk: Token[];
  /** Cuánto tiempo estará visible este grupo (ms). 0 si está en pausa. */
  duration: number;
  /** Velocidad efectiva usada para este grupo (tiene en cuenta la rampa). */
  wpm: number;
  playing: boolean;
}

export interface EngineListener {
  onWord?(event: WordEvent): void;
  onState?(playing: boolean): void;
  onEnd?(): void;
}

export interface Clock {
  now(): number;
  setTimer(callback: () => void, ms: number): unknown;
  clearTimer(id: unknown): void;
}

const browserClock: Clock = {
  now: () => performance.now(),
  setTimer: (cb, ms) => setTimeout(cb, ms),
  clearTimer: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
};

/** Una pausa más larga que esto vuelve a aplicar la aceleración completa. */
export const LONG_PAUSE_MS = 2 * 60 * 1000;

/** Si el reloj se atrasa más que esto (pestaña congelada), se resincroniza en vez de correr. */
const MAX_LAG_MS = 500;

export class RsvpEngine {
  tokens: Token[] = [];
  /** Índice del primer token visible. `tokens.length` significa "terminado". */
  index = 0;
  playing = false;
  settings: EngineSettings;

  /** Palabras que llegaron a mostrarse completas mientras se reproducía. */
  wordsRead = 0;
  private playMsClosed = 0;
  private segmentStart = 0;

  private timer: unknown = null;
  private nextAt = 0;
  private rampStart = 0;
  private rampWords = 0;
  private rampCount = 0;
  private lastPauseAt: number | null = null;
  private startedOnce = false;
  private listeners = new Set<EngineListener>();
  private clock: Clock;

  constructor(settings: Partial<EngineSettings> = {}, clock: Clock = browserClock) {
    this.settings = { ...DEFAULT_ENGINE_SETTINGS, ...settings };
    this.clock = clock;
  }

  subscribe(listener: EngineListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  load(tokens: Token[], index = 0): void {
    this.stopTimer();
    this.playing = false;
    this.tokens = tokens;
    this.index = clamp(index, 0, Math.max(tokens.length - 1, 0));
    this.startedOnce = false;
    this.lastPauseAt = null;
    this.emitState();
    this.emitDisplay();
  }

  updateSettings(partial: Partial<EngineSettings>): void {
    this.settings = { ...this.settings, ...partial };
    if (!this.playing) this.emitDisplay();
  }

  /** Grupo de tokens que empieza en `index`, sin cruzar un fin de párrafo. */
  chunkAt(index: number): Token[] {
    const chunk: Token[] = [];
    const size = Math.max(1, Math.min(3, Math.round(this.settings.chunkSize)));
    for (let i = index; i < this.tokens.length && chunk.length < size; i++) {
      chunk.push(this.tokens[i]);
      if (this.tokens[i].paragraphEnd) break;
    }
    return chunk;
  }

  /** Velocidad efectiva en este momento (con la rampa aplicada). */
  currentWpm(): number {
    if (!this.playing) return this.settings.wpm;
    return rampedWpm(this.settings.wpm, this.rampCount, this.rampStart, this.rampWords);
  }

  /** Velocidad real medida: palabras mostradas entre tiempo de reproducción, pausas incluidas. */
  realWpm(): number {
    const ms = this.playMs();
    return ms > 1000 ? (this.wordsRead / ms) * 60000 : 0;
  }

  playMs(): number {
    return this.playMsClosed + (this.playing ? this.clock.now() - this.segmentStart : 0);
  }

  get finished(): boolean {
    return this.tokens.length > 0 && this.index >= this.tokens.length;
  }

  play(): void {
    if (this.playing || this.tokens.length === 0) return;
    if (this.finished) this.index = 0;
    const now = this.clock.now();

    const { ramp, wpm } = this.settings;
    const longPause = this.lastPauseAt === null || now - this.lastPauseAt > LONG_PAUSE_MS;
    if (ramp.enabled && (!this.startedOnce || longPause)) {
      this.rampStart = ramp.startWpm;
      this.rampWords = ramp.words;
    } else {
      this.rampStart = wpm * WARMUP.fraction;
      this.rampWords = WARMUP.words;
    }
    this.rampCount = 0;
    this.startedOnce = true;

    this.playing = true;
    this.segmentStart = now;
    this.nextAt = now;
    this.emitState();
    this.showAndSchedule();
  }

  pause(): void {
    if (!this.playing) return;
    this.stopTimer();
    const now = this.clock.now();
    this.playMsClosed += now - this.segmentStart;
    this.playing = false;
    this.lastPauseAt = now;
    this.emitState();
    this.emitDisplay();
  }

  toggle(): void {
    if (this.playing) this.pause();
    else this.play();
  }

  /** Salta a un token. Si está reproduciendo, sigue desde ahí sin perder la velocidad alcanzada. */
  seek(index: number): void {
    if (this.tokens.length === 0) return;
    this.index = clamp(Math.round(index), 0, this.tokens.length - 1);
    if (this.playing) {
      this.stopTimer();
      this.nextAt = this.clock.now();
      this.showAndSchedule();
    } else {
      this.emitDisplay();
    }
  }

  skip(words: number): void {
    const from = Math.min(this.index, this.tokens.length - 1);
    this.seek(from + words);
  }

  /** Inicio de la oración anterior a la actual. */
  previousSentence(): void {
    if (this.tokens.length === 0) return;
    const current = this.tokens[Math.min(this.index, this.tokens.length - 1)];
    const target = Math.max(0, current.sentenceIndex - 1);
    let i = current.index;
    while (i > 0 && this.tokens[i - 1].sentenceIndex >= target) i--;
    this.seek(i);
  }

  destroy(): void {
    this.stopTimer();
    this.listeners.clear();
  }

  private showAndSchedule(): void {
    const chunk = this.chunkAt(this.index);
    const wpm = this.currentWpm();
    const duration = chunkDuration(chunk, wpm, this.settings.timing);
    this.emit((l) => l.onWord?.({ index: this.index, chunk, duration, wpm, playing: true }));

    const now = this.clock.now();
    this.nextAt += duration;
    // Se programa contra la hora absoluta de la próxima palabra para no acumular retraso.
    if (this.nextAt < now - MAX_LAG_MS) this.nextAt = now + duration;
    this.timer = this.clock.setTimer(() => this.advance(chunk.length), Math.max(0, this.nextAt - now));
  }

  private advance(shown: number): void {
    this.timer = null;
    this.wordsRead += shown;
    this.rampCount += shown;
    this.index += shown;
    if (this.index >= this.tokens.length) {
      this.index = this.tokens.length;
      this.pause();
      this.emit((l) => l.onEnd?.());
      return;
    }
    this.showAndSchedule();
  }

  private stopTimer(): void {
    if (this.timer !== null) this.clock.clearTimer(this.timer);
    this.timer = null;
  }

  private emitDisplay(): void {
    const start = Math.min(this.index, Math.max(this.tokens.length - 1, 0));
    const chunk = this.chunkAt(start);
    this.emit((l) => l.onWord?.({ index: this.index, chunk, duration: 0, wpm: this.settings.wpm, playing: false }));
  }

  private emitState(): void {
    this.emit((l) => l.onState?.(this.playing));
  }

  private emit(fn: (l: EngineListener) => void): void {
    for (const l of this.listeners) fn(l);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
