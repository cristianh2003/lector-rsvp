// Panel de ajustes: lectura, pausas, sonido, posición, apariencia, colores, estadísticas y datos.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { AudioMode } from '../core/audio';
import { DEFAULT_TIMING, MAX_WPM, MIN_WPM, WPM_STEP, clampWpm, type TimingConfig } from '../core/timing';
import { recentStats, type DayStats } from '../storage/db';
import { DEFAULT_AXIS, FONT_LABELS, FONT_STACKS, mergeSettings, type FontChoice } from '../storage/settings';
import {
  ACCENT_PALETTE,
  blueComponent,
  contrastRatio,
  CUSTOM_THEME_ID,
  getTheme,
  MIN_CONTRAST,
  THEMES,
  type ThemeColors,
} from '../themes';
import { formatNumber } from './format';
import { CloseIcon } from './icons';
import { useSettings } from './settingsContext';

interface SettingsPanelProps {
  onClose: () => void;
  /** Solo en la pantalla de lectura: activa el arrastre del eje sobre la pantalla. */
  onCalibrate?: () => void;
}

export function SettingsPanel({ onClose, onCalibrate }: SettingsPanelProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  return (
    <div className="sheet-backdrop settings-backdrop" onPointerDown={onClose}>
      <aside
        className="settings"
        role="dialog"
        aria-label="Ajustes"
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <div className="settings-header">
          <h2>Ajustes</h2>
          <button ref={closeRef} className="icon-button" onClick={onClose} aria-label="Cerrar ajustes">
            <CloseIcon />
          </button>
        </div>
        <ReadingSection />
        <AccelerationSection />
        <PausesSection />
        <SoundSection />
        <PositionSection onCalibrate={onCalibrate} />
        <AppearanceSection />
        <ColorsSection />
        <StatsSection />
        <DataSection />
      </aside>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="settings-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function Slider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  format?: (v: number) => string;
  onChange: (v: number) => void;
}) {
  const id = `s-${props.label.replace(/\W+/g, '-')}`;
  return (
    <div className="field">
      <label htmlFor={id}>
        <span>{props.label}</span>
        <output>{props.format ? props.format(props.value) : `${props.value}${props.unit ?? ''}`}</output>
      </label>
      <input
        id={id}
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
        style={{ '--fill': `${((props.value - props.min) / (props.max - props.min || 1)) * 100}%` } as CSSProperties}
      />
    </div>
  );
}

function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        {label}
        {hint && <small>{hint}</small>}
      </span>
    </label>
  );
}

function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="segmented" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={String(o.value)}
            role="radio"
            aria-checked={o.value === value}
            className={o.value === value ? 'selected' : ''}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ReadingSection() {
  const { settings, update } = useSettings();
  return (
    <Section title="Lectura">
      <Slider
        label="Velocidad máxima"
        value={settings.wpm}
        min={MIN_WPM}
        max={MAX_WPM}
        step={WPM_STEP}
        unit=" ppm"
        onChange={(wpm) => update({ wpm: clampWpm(wpm) })}
      />
      <Segmented
        label="Palabras por destello"
        value={settings.chunkSize}
        options={[1, 2, 3].map((n) => ({ value: n, label: String(n) }))}
        onChange={(chunkSize) => update({ chunkSize })}
      />
      <Toggle
        label="Mostrar el párrafo al pausar"
        checked={settings.showContext}
        onChange={(showContext) => update({ showContext })}
      />
      <Toggle
        label="Dividir palabras de más de 13 letras"
        hint="Se aplica a los textos que importes a partir de ahora."
        checked={settings.splitLongWords}
        onChange={(splitLongWords) => update({ splitLongWords })}
      />
    </Section>
  );
}

function AccelerationSection() {
  const { settings, update } = useSettings();
  const { ramp, wpm } = settings;
  const setRamp = (patch: Partial<typeof ramp>) => update((s) => ({ ...s, ramp: { ...s.ramp, ...patch } }));
  return (
    <Section title="Aceleración gradual">
      <Toggle
        label="Empezar despacio e ir acelerando"
        hint="Al empezar a leer, o tras una pausa de más de 2 minutos. Tras pausas cortas, el arranque dura solo 8 palabras."
        checked={ramp.enabled}
        onChange={(enabled) => setRamp({ enabled })}
      />
      {ramp.enabled && (
        <>
          <Slider
            label="Velocidad inicial"
            value={Math.min(ramp.startWpm, wpm)}
            min={MIN_WPM}
            max={Math.max(MIN_WPM, wpm)}
            step={WPM_STEP}
            unit=" ppm"
            onChange={(startWpm) => setRamp({ startWpm })}
          />
          <Slider
            label="Palabras hasta la velocidad máxima"
            value={ramp.words}
            min={20}
            max={1500}
            step={10}
            format={(v) => `${v} palabras`}
            onChange={(words) => setRamp({ words })}
          />
          <p className="note">
            Aproximadamente {rampMinutes(ramp.startWpm, wpm, ramp.words)} de lectura para llegar a {wpm} ppm.
          </p>
        </>
      )}
    </Section>
  );
}

/** Tiempo aproximado de la rampa (velocidad media entre inicial y final). */
function rampMinutes(start: number, target: number, words: number): string {
  const average = (Math.min(start, target) + target) / 2;
  const seconds = Math.round((words / average) * 60);
  return seconds >= 90 ? `${Math.round(seconds / 60)} min` : `${seconds} s`;
}

function PausesSection() {
  const { settings, update } = useSettings();
  const t = settings.timing;
  const set = (key: keyof TimingConfig) => (value: number) =>
    update((s) => ({ ...s, timing: { ...s.timing, [key]: value } }));
  const fmt = (v: number) => `×${v.toFixed(1)}`;
  return (
    <Section title="Pausas">
      <Slider label="Coma, punto y coma, dos puntos" value={t.comma} min={1} max={4} step={0.1} format={fmt} onChange={set('comma')} />
      <Slider label="Punto, interrogación, exclamación" value={t.period} min={1} max={4} step={0.1} format={fmt} onChange={set('period')} />
      <Slider label="Fin de párrafo" value={t.paragraph} min={1} max={5} step={0.1} format={fmt} onChange={set('paragraph')} />
      <Slider label="Palabras de más de 8 letras" value={t.longWord} min={1} max={2} step={0.1} format={fmt} onChange={set('longWord')} />
      <Slider label="Números" value={t.number} min={1} max={2.5} step={0.1} format={fmt} onChange={set('number')} />
      <button className="text-button" onClick={() => update({ timing: DEFAULT_TIMING })}>
        Restablecer pausas
      </button>
    </Section>
  );
}

function SoundSection() {
  const { settings, update } = useSettings();
  const setAudio = (patch: Partial<typeof settings.audio>) => update((s) => ({ ...s, audio: { ...s.audio, ...patch } }));
  return (
    <Section title="Sonido">
      <Segmented<AudioMode>
        label="Acompañamiento"
        value={settings.audio.mode}
        options={[
          { value: 'music', label: 'Piano' },
          { value: 'tick', label: 'Tic' },
          { value: 'off', label: 'Silencio' },
        ]}
        onChange={(mode) => setAudio({ mode })}
      />
      <p className="note">
        {settings.audio.mode === 'music'
          ? 'Una nota por palabra, al ritmo de la lectura. El acorde cambia con cada oración.'
          : settings.audio.mode === 'tick'
            ? 'Un clic suave por palabra, más grave al final de cada oración.'
            : 'Lectura sin sonido.'}
      </p>
      {settings.audio.mode !== 'off' && (
        <Slider
          label="Volumen"
          value={Math.round(settings.audio.volume * 100)}
          min={0}
          max={100}
          step={5}
          unit=" %"
          onChange={(v) => setAudio({ volume: v / 100 })}
        />
      )}
    </Section>
  );
}

function PositionSection({ onCalibrate }: { onCalibrate?: () => void }) {
  const { axis, setAxis, orientation } = useSettings();
  return (
    <Section title="Posición de la palabra">
      <p className="note">
        Guardada para la orientación {orientation === 'portrait' ? 'vertical' : 'horizontal'}. La otra orientación tiene su
        propia posición.
      </p>
      <Slider label="Eje horizontal" value={axis.x} min={20} max={80} step={0.5} unit=" %" onChange={(x) => setAxis({ ...axis, x })} />
      <Slider label="Eje vertical" value={axis.y} min={20} max={80} step={0.5} unit=" %" onChange={(y) => setAxis({ ...axis, y })} />
      <div className="button-row">
        {onCalibrate ? (
          <button className="button" onClick={onCalibrate}>
            Ajustar arrastrando en pantalla
          </button>
        ) : (
          <p className="note">Abre un documento para ajustar el eje arrastrándolo en pantalla.</p>
        )}
        <button className="text-button" onClick={() => setAxis(DEFAULT_AXIS)}>
          Restablecer (37 %, 45 %)
        </button>
      </div>
    </Section>
  );
}

function AppearanceSection() {
  const { settings, update } = useSettings();
  return (
    <Section title="Apariencia">
      <Slider label="Tamaño de la palabra" value={settings.fontSize} min={24} max={140} step={2} unit=" px" onChange={(fontSize) => update({ fontSize })} />
      <div className="field">
        <span className="field-label">Fuente</span>
        <div className="font-options" role="radiogroup" aria-label="Fuente">
          {(Object.keys(FONT_LABELS) as FontChoice[]).map((font) => (
            <button
              key={font}
              role="radio"
              aria-checked={settings.font === font}
              className={settings.font === font ? 'selected' : ''}
              onClick={() => update({ font })}
            >
              <span className="font-sample" style={{ fontFamily: FONT_STACKS[font] }}>
                le<span className="accent-letter">c</span>tura
              </span>
              <small>{FONT_LABELS[font]}</small>
            </button>
          ))}
        </div>
      </div>
      <Toggle label="Mostrar líneas guía y marcas del eje" checked={settings.showGuides} onChange={(showGuides) => update({ showGuides })} />
      {settings.showGuides && (
        <Slider
          label="Opacidad de las guías"
          value={Math.round(settings.guideOpacity * 100)}
          min={10}
          max={100}
          step={5}
          unit=" %"
          onChange={(v) => update({ guideOpacity: v / 100 })}
        />
      )}
    </Section>
  );
}

function ColorsSection() {
  const { settings, update, colors } = useSettings();
  const custom = settings.themeId === CUSTOM_THEME_ID && !settings.followSystem;
  const activeTheme = settings.followSystem ? null : getTheme(settings.themeId);
  const contrast = contrastRatio(colors.text, colors.bg);
  const setCustom = (key: keyof ThemeColors, value: string) =>
    update((s) => ({ ...s, customColors: { ...s.customColors, [key]: value } }));

  return (
    <Section title="Colores">
      <Toggle
        label="Seguir el tema del sistema"
        hint="Papel con el modo claro, Referencia con el modo oscuro."
        checked={settings.followSystem}
        onChange={(followSystem) => update({ followSystem })}
      />
      {!settings.followSystem && (
        <div className="theme-grid" role="radiogroup" aria-label="Tema">
          {THEMES.map((theme) => (
            <button
              key={theme.id}
              role="radio"
              aria-checked={settings.themeId === theme.id}
              className={`theme-swatch ${settings.themeId === theme.id ? 'selected' : ''}`}
              style={{ background: theme.bg, color: theme.text, borderColor: theme.guide }}
              onClick={() => update({ themeId: theme.id })}
            >
              <span className="theme-word">
                pa<span style={{ color: settings.accent ?? theme.accent }}>l</span>abra
              </span>
              <small>{theme.name}</small>
            </button>
          ))}
          <button
            role="radio"
            aria-checked={custom}
            className={`theme-swatch ${custom ? 'selected' : ''}`}
            style={{ background: settings.customColors.bg, color: settings.customColors.text, borderColor: settings.customColors.guide }}
            onClick={() => update({ themeId: CUSTOM_THEME_ID })}
          >
            <span className="theme-word">
              pa<span style={{ color: settings.accent ?? settings.customColors.accent }}>l</span>abra
            </span>
            <small>Personalizado</small>
          </button>
        </div>
      )}

      {custom && (
        <div className="custom-colors">
          {(
            [
              ['bg', 'Fondo'],
              ['text', 'Texto'],
              ['accent', 'Letra ORP'],
              ['guide', 'Guías'],
            ] as [keyof ThemeColors, string][]
          ).map(([key, label]) => (
            <label key={key} className="color-field">
              <input type="color" value={settings.customColors[key]} onChange={(e) => setCustom(key, e.target.value)} />
              <span>{label}</span>
            </label>
          ))}
        </div>
      )}

      <div className="field">
        <span className="field-label">Color de la letra ORP</span>
        <div className="accent-row">
          <button className={`accent-chip theme-accent ${settings.accent === null ? 'selected' : ''}`} onClick={() => update({ accent: null })}>
            Del tema
          </button>
          {ACCENT_PALETTE.map((c) => (
            <button
              key={c}
              className={`accent-chip ${settings.accent?.toLowerCase() === c.toLowerCase() ? 'selected' : ''}`}
              style={{ background: c }}
              onClick={() => update({ accent: c })}
              aria-label={`Acento ${c}`}
            />
          ))}
          <label className="accent-chip accent-free" title="Elegir cualquier color">
            <input type="color" value={settings.accent ?? colors.accent} onChange={(e) => update({ accent: e.target.value })} />
            <span aria-hidden>+</span>
          </label>
        </div>
      </div>

      <p className={`contrast ${contrast < MIN_CONTRAST ? 'warning' : ''}`}>
        Contraste texto/fondo: {contrast.toFixed(1)}:1.{' '}
        {contrast < MIN_CONTRAST ? `Por debajo del mínimo recomendado (${MIN_CONTRAST}:1): puede costar leer.` : 'Cumple el mínimo de 4.5:1.'}
      </p>
      {activeTheme?.amber && blueComponent(colors.accent) > 0 && (
        <p className="contrast warning">
          El acento elegido tiene componente azul; los temas ámbar lo dejan en cero para no emitir luz azul.
        </p>
      )}
    </Section>
  );
}

function StatsSection() {
  const [days, setDays] = useState<DayStats[] | null>(null);
  useEffect(() => {
    void recentStats(14).then(setDays);
  }, []);
  if (!days) return null;
  const totalWords = days.reduce((s, d) => s + d.words, 0);
  const totalMs = days.reduce((s, d) => s + d.ms, 0);
  const max = Math.max(1, ...days.map((d) => d.words));
  return (
    <Section title="Estadísticas (14 días)">
      {days.length === 0 ? (
        <p className="note">Todavía no hay lecturas registradas.</p>
      ) : (
        <>
          <p className="stats-summary">
            {formatNumber(totalWords)} palabras leídas. Velocidad real media:{' '}
            {totalMs > 0 ? `${formatNumber((totalWords / totalMs) * 60000)} ppm` : 'sin datos'}.
          </p>
          <ul className="stats-bars">
            {days.map((d) => (
              <li key={d.date}>
                <span className="stats-date">
                  {new Date(`${d.date}T12:00:00`).toLocaleDateString('es', { weekday: 'short', day: 'numeric' })}
                </span>
                <span className="stats-bar" style={{ width: `${(d.words / max) * 100}%` }} />
                <span className="stats-value">{formatNumber(d.words)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Section>
  );
}

function DataSection() {
  const { settings, update } = useSettings();
  const [message, setMessage] = useState<string | null>(null);

  const exportSettings = () => {
    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'lector-rsvp-ajustes.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const importSettings = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text());
      update(mergeSettings(parsed));
      setMessage('Ajustes importados.');
    } catch {
      setMessage('El archivo no es un JSON de ajustes válido.');
    }
  };

  return (
    <Section title="Ajustes en archivo">
      <div className="button-row">
        <button className="button" onClick={exportSettings}>
          Exportar ajustes
        </button>
        <label className="button">
          Importar ajustes
          <input
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void importSettings(file);
              e.target.value = '';
            }}
          />
        </label>
      </div>
      {message && <p className="note">{message}</p>}
    </Section>
  );
}
