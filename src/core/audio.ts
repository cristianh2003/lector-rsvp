// Acompañamiento sonoro sincronizado con las palabras, generado con Web Audio (sin archivos).
//
// Modo "música": un piano suave toca una nota por palabra sobre una progresión
// La m – Fa – Do – Sol. Cada acorde dura una oración (o 8 palabras como mucho),
// los finales de oración caen en una nota del acorde y el bajo marca el cambio.
// Modo "tic": un clic corto por palabra, como un metrónomo.
import type { Token } from './tokenizer';

export type AudioMode = 'music' | 'tick' | 'off';

export interface AudioSettings {
  mode: AudioMode;
  volume: number;
}

export const DEFAULT_AUDIO: AudioSettings = { mode: 'music', volume: 0.6 };

interface Chord {
  bass: number;
  triad: number[];
}

// Notas MIDI. 60 = Do central.
const PROGRESSION: Chord[] = [
  { bass: 45, triad: [57, 60, 64] }, // La menor
  { bass: 41, triad: [53, 57, 60] }, // Fa mayor
  { bass: 48, triad: [55, 60, 64] }, // Do mayor
  { bass: 43, triad: [55, 59, 62] }, // Sol mayor
];

// Pentatónica de Do en el registro medio-agudo (Do5 a Mi6), como el piano del video.
const MELODY = [69, 72, 74, 76, 79, 81, 84, 86, 88];
const MAX_WORDS_PER_CHORD = 8;

const midiToHz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/**
 * Elige la siguiente nota de la melodía: pasos cortos, y en los finales de
 * oración se asienta en una nota del acorde. `random` se inyecta para las pruebas.
 */
export function nextMelodyIndex(current: number, chord: Chord, resolve: boolean, random: () => number = Math.random): number {
  if (resolve) {
    const chordPitchClasses = chord.triad.map((n) => n % 12);
    let best = current;
    let bestDistance = Infinity;
    MELODY.forEach((note, i) => {
      const distance = Math.abs(i - current);
      if (chordPitchClasses.includes(note % 12) && distance < bestDistance && distance > 0) {
        best = i;
        bestDistance = distance;
      }
    });
    return best;
  }
  const steps = [-2, -1, -1, 1, 1, 2];
  let step = steps[Math.floor(random() * steps.length)];
  // Tiende a volver al centro del registro para no quedarse en los extremos.
  const center = (MELODY.length - 1) / 2;
  if (Math.abs(current + step - center) > 3.5) step = -step;
  return Math.min(MELODY.length - 1, Math.max(0, current + step));
}

export class ReaderAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private bus: GainNode | null = null;
  private reverbSend: GainNode | null = null;

  private settings: AudioSettings = DEFAULT_AUDIO;
  private chordIndex = 0;
  private wordsInChord = 0;
  private melodyIndex = 4;
  private wordCounter = 0;
  private chordPending = true;

  setSettings(settings: AudioSettings): void {
    this.settings = settings;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.volumeGain(), this.ctx.currentTime, 0.05);
    }
  }

  /** Debe llamarse desde un gesto del usuario (clic, tecla) para que el navegador permita sonar. */
  async resume(): Promise<void> {
    if (this.settings.mode === 'off') return;
    if (!this.ctx) this.build();
    if (this.ctx && this.ctx.state !== 'running') {
      try {
        await this.ctx.resume();
      } catch {
        // Si el navegador no lo permite, la lectura sigue en silencio.
      }
    }
  }

  /** Al reanudar la lectura: bus nuevo y el acorde vuelve a sonar. */
  start(): void {
    if (!this.ctx || !this.master) return;
    this.bus = this.ctx.createGain();
    this.bus.gain.value = 1;
    this.bus.connect(this.master);
    this.bus.connect(this.reverbSend!);
    this.chordPending = true;
  }

  /** Al pausar: las notas que siguen sonando se apagan suavemente. */
  stop(): void {
    if (!this.ctx || !this.bus) return;
    const bus = this.bus;
    const now = this.ctx.currentTime;
    bus.gain.cancelScheduledValues(now);
    bus.gain.setValueAtTime(bus.gain.value, now);
    bus.gain.linearRampToValueAtTime(0, now + 0.35);
    setTimeout(() => bus.disconnect(), 600);
    this.bus = null;
  }

  onWord(chunk: Token[], durationMs: number): void {
    if (this.settings.mode === 'off' || !this.ctx || !this.bus || this.ctx.state !== 'running') return;
    const last = chunk[chunk.length - 1];
    if (!last) return;
    if (this.settings.mode === 'tick') this.tick(last);
    else this.music(chunk, last, durationMs);
  }

  destroy(): void {
    void this.ctx?.close();
    this.ctx = null;
  }

  private volumeGain(): number {
    // Curva perceptual: el control se siente lineal al oído.
    return this.settings.volume ** 2 * 0.9;
  }

  private build(): void {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx({ latencyHint: 'interactive' });
    const master = ctx.createGain();
    master.gain.value = this.volumeGain();
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.ratio.value = 3;
    master.connect(compressor).connect(ctx.destination);

    const reverb = ctx.createConvolver();
    reverb.buffer = impulseResponse(ctx, 2.8);
    const reverbSend = ctx.createGain();
    reverbSend.gain.value = 0.35;
    reverbSend.connect(reverb).connect(master);

    this.ctx = ctx;
    this.master = master;
    this.reverbSend = reverbSend;
  }

  private music(chunk: Token[], last: Token, durationMs: number): void {
    const t = this.ctx!.currentTime + 0.005;
    const seconds = durationMs / 1000;

    if (this.chordPending) {
      this.chordPending = false;
      this.wordsInChord = 0;
      this.playChord(PROGRESSION[this.chordIndex], t);
    }
    this.wordsInChord += chunk.length;
    this.wordCounter++;

    const chord = PROGRESSION[this.chordIndex];
    const resolves = Boolean(last.sentenceEnd || last.paragraphEnd);
    // A velocidades muy altas se toca una nota cada dos o tres palabras para no saturar.
    const every = seconds < 0.075 ? 3 : seconds < 0.13 ? 2 : 1;
    if (resolves || this.wordCounter % every === 0) {
      this.melodyIndex = nextMelodyIndex(this.melodyIndex, chord, resolves);
      const velocity = (resolves ? 0.34 : 0.24) + Math.random() * 0.06;
      const decay = Math.min(2.2, Math.max(0.5, seconds * (resolves ? 6 : 4)));
      this.pianoNote(MELODY[this.melodyIndex], t, velocity, decay);
    }

    // El acorde cambia al terminar una oración (si ya sonó unas palabras) o cada 8 palabras.
    if ((resolves && this.wordsInChord >= 3) || this.wordsInChord >= MAX_WORDS_PER_CHORD) {
      this.chordIndex = (this.chordIndex + 1) % PROGRESSION.length;
      this.chordPending = true;
    }
  }

  private playChord(chord: Chord, t: number): void {
    this.pianoNote(chord.bass, t, 0.3, 3.5);
    chord.triad.forEach((note, i) => this.pianoNote(note, t + i * 0.012, 0.1, 3));
  }

  /** Nota de piano suave: fundamental + armónicos que se apagan antes, con filtro que se oscurece. */
  private pianoNote(midi: number, t: number, velocity: number, decay: number): void {
    const ctx = this.ctx!;
    const f = midiToHz(midi);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(velocity, t + 0.006);
    env.gain.exponentialRampToValueAtTime(velocity * 0.45, t + 0.12);
    env.gain.exponentialRampToValueAtTime(0.0001, t + decay);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.min(12000, f * 8), t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(200, f * 1.5), t + decay);
    filter.Q.value = 0.3;

    const partials: [number, OscillatorType, number][] = [
      [1, 'triangle', 0.7],
      [1.0015, 'sine', 0.45],
      [2, 'sine', 0.18],
      [3, 'sine', 0.06],
    ];
    for (const [ratio, type, gain] of partials) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = f * ratio;
      const g = ctx.createGain();
      g.gain.value = gain;
      osc.connect(g).connect(filter);
      osc.start(t);
      osc.stop(t + decay + 0.05);
    }
    filter.connect(env).connect(this.bus!);
  }

  private tick(last: Token): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + 0.003;
    const strong = last.sentenceEnd || last.paragraphEnd;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(strong ? 1100 : 1700, t);
    osc.frequency.exponentialRampToValueAtTime(strong ? 700 : 1200, t + 0.04);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(strong ? 0.28 : 0.16, t + 0.002);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    osc.connect(env).connect(this.bus!);
    osc.start(t);
    osc.stop(t + 0.07);
  }
}

/** Respuesta de impulso sintética: ruido que decae, para simular una sala. */
function impulseResponse(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
  }
  return buffer;
}
