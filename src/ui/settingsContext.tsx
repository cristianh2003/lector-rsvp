// Ajustes compartidos por toda la app: se guardan solos y aplican el tema.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { saveSettings } from '../storage/db';
import type { AxisPosition, Settings } from '../storage/settings';
import { applyThemeColors, CUSTOM_THEME_ID, getTheme, SYSTEM_THEMES, THEMES, type ThemeColors } from '../themes';

type Update = (patch: Partial<Settings> | ((previous: Settings) => Settings)) => void;

interface SettingsContextValue {
  settings: Settings;
  update: Update;
  colors: ThemeColors;
  orientation: 'portrait' | 'landscape';
  axis: AxisPosition;
  setAxis: (axis: AxisPosition) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ initial, children }: { initial: Settings; children: ReactNode }) {
  const [settings, setSettings] = useState(initial);
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)');
  const portrait = useMediaQuery('(orientation: portrait)');
  const orientation = portrait ? 'portrait' : 'landscape';

  const update = useCallback<Update>((patch) => {
    setSettings((previous) => (typeof patch === 'function' ? patch(previous) : { ...previous, ...patch }));
  }, []);

  // Guardado con un pequeño retraso para no escribir en cada movimiento de un deslizador.
  useEffect(() => {
    const timer = setTimeout(() => void saveSettings(settings), 300);
    return () => clearTimeout(timer);
  }, [settings]);

  const colors = useMemo(() => resolveColors(settings, systemDark), [settings, systemDark]);
  useEffect(() => {
    applyThemeColors(colors);
  }, [colors]);

  const axis = settings.axis[orientation];
  const setAxis = useCallback(
    (next: AxisPosition) => update((s) => ({ ...s, axis: { ...s.axis, [orientation]: next } })),
    [orientation, update],
  );

  const value = useMemo(
    () => ({ settings, update, colors, orientation, axis, setAxis }) as SettingsContextValue,
    [settings, update, colors, orientation, axis, setAxis],
  );
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const value = useContext(SettingsContext);
  if (!value) throw new Error('useSettings fuera de SettingsProvider');
  return value;
}

export function resolveColors(settings: Settings, systemDark: boolean): ThemeColors {
  let colors: ThemeColors;
  if (settings.followSystem) colors = getTheme(systemDark ? SYSTEM_THEMES.dark : SYSTEM_THEMES.light)!;
  else if (settings.themeId === CUSTOM_THEME_ID) colors = settings.customColors;
  else colors = getTheme(settings.themeId) ?? THEMES[0];
  const { bg, text, accent, guide } = colors;
  return { bg, text, guide, accent: settings.accent ?? accent };
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const list = window.matchMedia(query);
    const onChange = () => setMatches(list.matches);
    onChange();
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}
