// Paletas de colores. Cada tema define cuatro variables: fondo, texto, acento (letra ORP) y guías.

export interface ThemeColors {
  bg: string;
  text: string;
  accent: string;
  guide: string;
}

export interface Theme extends ThemeColors {
  id: string;
  name: string;
  /** Tema ámbar: todos sus colores deben tener el componente azul en cero. */
  amber?: boolean;
  /** Fondo claro (se usa al seguir el tema del sistema). */
  light?: boolean;
}

export const THEMES: Theme[] = [
  { id: 'referencia', name: 'Referencia (video)', bg: '#05081A', text: '#F2F2F2', accent: '#E8384F', guide: '#1C2238' },
  { id: 'true-ambar', name: 'True Ámbar', bg: '#FFB000', text: '#1A0E00', accent: '#8A2B00', guide: '#C98A00', amber: true, light: true },
  { id: 'ambar-nocturno', name: 'Ámbar nocturno', bg: '#000000', text: '#FFB000', accent: '#FF5A00', guide: '#3A2800', amber: true },
  { id: 'oled', name: 'Negro OLED', bg: '#000000', text: '#E6E6E6', accent: '#FF3B30', guide: '#1A1A1A' },
  { id: 'papel', name: 'Papel', bg: '#F4EFE6', text: '#1E1E1E', accent: '#C0392B', guide: '#D8D0C0', light: true },
];

export const CUSTOM_THEME_ID = 'personalizado';

/** Temas usados con "seguir el tema del sistema". */
export const SYSTEM_THEMES = { light: 'papel', dark: 'referencia' } as const;

/** Paleta de acentos rápida (independiente del tema). */
export const ACCENT_PALETTE = [
  '#E8384F', '#FF3B30', '#FF5A00', '#FFB000', '#8A2B00', '#2FBF71', '#3D8BFF', '#B06CFF',
];

export function getTheme(id: string): Theme | undefined {
  return THEMES.find((t) => t.id === id);
}

export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.trim().replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function blueComponent(hex: string): number {
  return hexToRgb(hex)[2];
}

/** Luminancia relativa según WCAG 2.x. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contraste WCAG entre dos colores (1 a 21). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export const MIN_CONTRAST = 4.5;

/** Escribe los colores como variables CSS en la raíz del documento. */
export function applyThemeColors(colors: ThemeColors, root: HTMLElement = document.documentElement): void {
  root.style.setProperty('--bg', colors.bg);
  root.style.setProperty('--text', colors.text);
  root.style.setProperty('--accent', colors.accent);
  root.style.setProperty('--guide', colors.guide);
  const light = relativeLuminance(colors.bg) > 0.4;
  root.style.colorScheme = light ? 'light' : 'dark';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', colors.bg);
}
