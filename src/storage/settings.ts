// Modelo de ajustes con sus valores por defecto y validación al importar.
import { DEFAULT_AUDIO, type AudioSettings } from '../core/audio';
import { DEFAULT_RAMP, DEFAULT_TIMING, type RampConfig, type TimingConfig } from '../core/timing';
import type { ThemeColors } from '../themes';

export type FontChoice = 'serif' | 'sans' | 'mono' | 'atkinson';

export interface AxisPosition {
  /** Porcentaje del ancho (20–80). */
  x: number;
  /** Porcentaje del alto (20–80). */
  y: number;
}

export interface Settings {
  wpm: number;
  chunkSize: number;
  timing: TimingConfig;
  ramp: RampConfig;
  splitLongWords: boolean;
  showContext: boolean;

  themeId: string;
  followSystem: boolean;
  customColors: ThemeColors;
  /** Acento elegido aparte del tema; null usa el del tema. */
  accent: string | null;

  font: FontChoice;
  fontSize: number;
  showGuides: boolean;
  guideOpacity: number;

  axis: { portrait: AxisPosition; landscape: AxisPosition };
  audio: AudioSettings;
}

export const DEFAULT_AXIS: AxisPosition = { x: 37, y: 45 };

export const DEFAULT_SETTINGS: Settings = {
  wpm: 400,
  chunkSize: 1,
  timing: DEFAULT_TIMING,
  ramp: DEFAULT_RAMP,
  splitLongWords: true,
  showContext: true,

  themeId: 'referencia',
  followSystem: false,
  customColors: { bg: '#101820', text: '#F2F2F2', accent: '#E8384F', guide: '#26303A' },
  accent: null,

  font: 'serif',
  fontSize: 60,
  showGuides: true,
  guideOpacity: 1,

  axis: { portrait: DEFAULT_AXIS, landscape: DEFAULT_AXIS },
  audio: DEFAULT_AUDIO,
};

export const FONT_STACKS: Record<FontChoice, string> = {
  serif: "'Times New Roman', Tinos, 'Liberation Serif', 'Noto Serif', Times, serif",
  sans: "system-ui, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  mono: "ui-monospace, 'Cascadia Mono', Consolas, 'Roboto Mono', Menlo, monospace",
  atkinson: "'Atkinson Hyperlegible', system-ui, sans-serif",
};

export const FONT_LABELS: Record<FontChoice, string> = {
  serif: 'Serif',
  sans: 'Sans serif',
  mono: 'Monoespaciada',
  atkinson: 'Atkinson Hyperlegible',
};

/** Mezcla un objeto parcial (por ejemplo, un JSON importado) con los valores por defecto. */
export function mergeSettings(input: unknown): Settings {
  const src = (input && typeof input === 'object' ? input : {}) as Partial<Settings>;
  const d = DEFAULT_SETTINGS;
  return {
    ...d,
    ...pick(src, d),
    timing: { ...d.timing, ...pick(src.timing, d.timing) },
    ramp: { ...d.ramp, ...pick(src.ramp, d.ramp) },
    customColors: { ...d.customColors, ...pick(src.customColors, d.customColors) },
    axis: {
      portrait: { ...d.axis.portrait, ...pick(src.axis?.portrait, d.axis.portrait) },
      landscape: { ...d.axis.landscape, ...pick(src.axis?.landscape, d.axis.landscape) },
    },
    audio: { ...d.audio, ...pick(src.audio, d.audio) },
  };
}

/** Copia solo las claves conocidas cuyo tipo coincide con el valor por defecto. */
function pick<T extends object>(src: unknown, reference: T): Partial<T> {
  const out: Partial<T> = {};
  if (!src || typeof src !== 'object') return out;
  for (const key of Object.keys(reference) as (keyof T)[]) {
    const value = (src as T)[key];
    const ref = reference[key];
    if (value === undefined) continue;
    if (ref === null ? value === null || typeof value === 'string' : typeof value === typeof ref && typeof ref !== 'object') {
      out[key] = value;
    }
  }
  return out;
}
