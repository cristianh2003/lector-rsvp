// Pantalla de lectura.
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { ReaderAudio } from '../core/audio';
import { RsvpEngine, type WordEvent } from '../core/engine';
import { clampWpm, remainingMs, weightPrefix, WPM_STEP } from '../core/timing';
import type { Token } from '../core/tokenizer';
import {
  addReadingStats,
  loadDocument,
  savePosition,
  setOpenDocument,
  type DocumentMeta,
} from '../storage/db';
import { Controls } from './Controls';
import { FullscreenIcon, LibraryIcon, ListIcon, SettingsIcon } from './icons';
import { SettingsPanel } from './Settings';
import { useSettings } from './settingsContext';
import { WordDisplay } from './WordDisplay';
import { FONT_STACKS } from '../storage/settings';

interface ReaderProps {
  docId: number;
  onExit: () => void;
}

type Panel = 'none' | 'settings' | 'goto';

const SWIPE_PX = 50;
const DOUBLE_TAP_MS = 300;
const HIDE_CHROME_MS = 1500;

export function Reader({ docId, onExit }: ReaderProps) {
  const { settings, update, axis, setAxis } = useSettings();
  const engine = useMemo(() => new RsvpEngine(), []);
  const audio = useMemo(() => new ReaderAudio(), []);

  const [doc, setDoc] = useState<{ meta: DocumentMeta; tokens: Token[] } | null>(null);
  const [missing, setMissing] = useState(false);
  const [event, setEvent] = useState<WordEvent | null>(null);
  const [playing, setPlaying] = useState(false);
  const [panel, setPanel] = useState<Panel>('none');
  const [calibrating, setCalibrating] = useState(false);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [activity, setActivity] = useState(0);
  const [, setTick] = useState(0);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const [controlsHeight, setControlsHeight] = useState(200);

  // La vista de contexto ocupa el hueco entre la palabra y la barra de controles.
  useEffect(() => {
    const el = controlsRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setControlsHeight(el.getBoundingClientRect().height));
    observer.observe(el);
    return () => observer.disconnect();
  }, [calibrating]);

  // Carga del documento en la posición guardada.
  useEffect(() => {
    let cancelled = false;
    void loadDocument(docId).then((loaded) => {
      if (cancelled) return;
      if (!loaded) {
        setMissing(true);
        void setOpenDocument(null);
        return;
      }
      engine.load(loaded.tokens, loaded.meta.position);
      setDoc(loaded);
      void setOpenDocument(docId);
    });
    return () => {
      cancelled = true;
    };
  }, [docId, engine]);

  const { wpm, chunkSize, timing, ramp } = settings;
  useEffect(() => {
    engine.updateSettings({ wpm, chunkSize, timing, ramp });
  }, [engine, wpm, chunkSize, timing, ramp]);
  useEffect(() => {
    audio.setSettings(settings.audio);
  }, [audio, settings.audio]);

  // Guarda la posición y suma a las estadísticas lo leído desde el último guardado.
  const saved = useRef({ words: 0, ms: 0 });
  const persist = useCallback(() => {
    if (engine.tokens.length === 0) return;
    void savePosition(docId, engine.index);
    const words = engine.wordsRead - saved.current.words;
    const ms = engine.playMs() - saved.current.ms;
    saved.current = { words: engine.wordsRead, ms: engine.playMs() };
    void addReadingStats(words, ms);
  }, [docId, engine]);

  useEffect(
    () =>
      engine.subscribe({
        onWord: (e) => {
          setEvent(e);
          if (e.playing) audio.onWord(e.chunk, e.duration);
        },
        onState: (isPlaying) => {
          setPlaying(isPlaying);
          if (isPlaying) audio.start();
          else {
            audio.stop();
            persist();
          }
        },
      }),
    [engine, audio, persist],
  );

  // Mientras se lee: refresco de la velocidad real cada segundo y guardado cada 5 s.
  useEffect(() => {
    if (!playing) return;
    const refresh = setInterval(() => setTick((t) => t + 1), 1000);
    const autosave = setInterval(persist, 5000);
    return () => {
      clearInterval(refresh);
      clearInterval(autosave);
    };
  }, [playing, persist]);

  // Pausa al ocultar la app; guarda al cerrar.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') {
        engine.pause();
        persist();
      }
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', persist);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', persist);
      engine.pause();
      persist();
      engine.destroy();
      audio.destroy();
    };
  }, [engine, audio, persist]);

  // Pantalla siempre encendida mientras se lee.
  useEffect(() => {
    if (!playing || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let active = true;
    navigator.wakeLock
      .request('screen')
      .then((l) => {
        lock = l;
        if (!active) void l.release();
      })
      .catch(() => undefined);
    return () => {
      active = false;
      void lock?.release();
    };
  }, [playing]);

  // Los controles se ocultan poco después de empezar a leer y vuelven con el ratón o al pausar.
  useEffect(() => {
    if (!playing) {
      setChromeVisible(true);
      return;
    }
    const timer = setTimeout(() => setChromeVisible(false), HIDE_CHROME_MS);
    return () => clearTimeout(timer);
  }, [playing, activity]);

  const lastActivity = useRef(0);
  const bumpActivity = useCallback(() => {
    const now = performance.now();
    if (now - lastActivity.current < 250) return;
    lastActivity.current = now;
    setChromeVisible(true);
    setActivity((a) => a + 1);
  }, []);

  const toggle = useCallback(() => {
    if (!engine.playing) void audio.resume();
    engine.toggle();
  }, [engine, audio]);

  const setWpm = useCallback((value: number) => update({ wpm: clampWpm(value) }), [update]);
  const changeWpm = useCallback(
    (delta: number) => update((s) => ({ ...s, wpm: clampWpm(s.wpm + delta) })),
    [update],
  );

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  }, []);

  // Teclado.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement;
      const tag = target.tagName;
      const typing =
        tag === 'TEXTAREA' || tag === 'SELECT' || (tag === 'INPUT' && (target as HTMLInputElement).type !== 'range');
      if (typing) return;
      if (e.key === 'Escape') {
        if (panel !== 'none') setPanel('none');
        else if (calibrating) setCalibrating(false);
        return;
      }
      if (panel !== 'none' || calibrating) return;
      // Las flechas sobre un deslizador enfocado mueven ese deslizador.
      if (tag === 'INPUT' && e.key.startsWith('Arrow')) return;

      const actions: Record<string, () => void> = {
        ' ': toggle,
        ArrowLeft: () => engine.skip(-10),
        ArrowRight: () => engine.skip(10),
        ArrowUp: () => changeWpm(WPM_STEP),
        ArrowDown: () => changeWpm(-WPM_STEP),
        s: () => engine.previousSentence(),
        f: toggleFullscreen,
      };
      const action = actions[e.key.length === 1 ? e.key.toLowerCase() : e.key];
      if (!action) return;
      e.preventDefault();
      // Evita que Espacio también "pulse" el botón que tenga el foco.
      if (tag === 'BUTTON') target.blur();
      action();
      if (e.key !== ' ') bumpActivity();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [engine, toggle, changeWpm, toggleFullscreen, panel, calibrating, bumpActivity]);

  // Gestos táctiles y calibración del eje sobre la superficie de lectura.
  const pointer = useRef<{ x: number; y: number; t: number } | null>(null);
  const lastTap = useRef(0);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const axisFromPointer = (e: ReactPointerEvent) => {
    const rect = surfaceRef.current!.getBoundingClientRect();
    const clamp = (v: number) => Math.round(Math.min(80, Math.max(20, v)) * 10) / 10;
    return {
      x: clamp(((e.clientX - rect.left) / rect.width) * 100),
      y: clamp(((e.clientY - rect.top) / rect.height) * 100),
    };
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    pointer.current = { x: e.clientX, y: e.clientY, t: performance.now() };
    if (calibrating) {
      e.currentTarget.setPointerCapture(e.pointerId);
      setAxis(axisFromPointer(e));
    }
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    if (calibrating) {
      if (pointer.current) setAxis(axisFromPointer(e));
      return;
    }
    if (e.pointerType === 'mouse') bumpActivity();
  };

  const onPointerUp = (e: ReactPointerEvent) => {
    const start = pointer.current;
    pointer.current = null;
    if (!start) return;
    if (calibrating) {
      // Se guarda al soltar (los ajustes se escriben solos) y se sale del modo calibración.
      setAxis(axisFromPointer(e));
      setCalibrating(false);
      return;
    }
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy)) {
      engine.skip(dx > 0 ? -10 : 10);
      return;
    }
    if (Math.abs(dy) > SWIPE_PX) {
      changeWpm(dy < 0 ? WPM_STEP : -WPM_STEP);
      bumpActivity();
      return;
    }
    if (Math.abs(dx) > 12 || Math.abs(dy) > 12) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const leftThird = e.clientX - rect.left < rect.width / 3;
    if (!leftThird) {
      toggle();
      return;
    }
    // Tercio izquierdo: doble toque = oración anterior; un toque = leer/pausar (tras esperar el segundo).
    const now = performance.now();
    if (now - lastTap.current < DOUBLE_TAP_MS && tapTimer.current) {
      clearTimeout(tapTimer.current);
      tapTimer.current = null;
      lastTap.current = 0;
      engine.previousSentence();
      return;
    }
    lastTap.current = now;
    tapTimer.current = setTimeout(() => {
      tapTimer.current = null;
      toggle();
    }, DOUBLE_TAP_MS);
  };

  const prefix = useMemo(() => weightPrefix(doc?.tokens ?? [], timing), [doc, timing]);

  if (missing) {
    return (
      <div className="reader-missing">
        <p>Este documento ya no está en la biblioteca.</p>
        <button className="button" onClick={onExit}>
          Volver a la biblioteca
        </button>
      </div>
    );
  }

  const total = doc?.tokens.length ?? 0;
  const index = event ? event.index : 0;
  const chunk = event?.chunk ?? [];
  const text = chunk.map((t) => t.text).join(' ');
  const finished = total > 0 && index >= total;
  const hasGoto = (doc?.meta.chapters.length ?? 0) > 1 || (doc?.meta.pages.length ?? 0) > 1;
  const showContext = settings.showContext && !playing && !calibrating && panel === 'none' && doc && !finished;

  const readerStyle = {
    '--axis-y': `${axis.y}%`,
    '--word-size': `min(${settings.fontSize}px, 14vw)`,
    '--word-font': FONT_STACKS[settings.font],
    '--controls-h': `${controlsHeight}px`,
  } as CSSProperties;

  return (
    <div className={`reader ${chromeVisible ? '' : 'chrome-hidden'}`} style={readerStyle}>
      <div
        ref={surfaceRef}
        className={`surface ${calibrating ? 'calibrating' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (pointer.current = null)}
      >
        <WordDisplay
          text={text}
          axis={axis}
          font={settings.font}
          fontSize={settings.fontSize}
          showGuides={settings.showGuides || calibrating}
          guideOpacity={calibrating ? 1 : settings.guideOpacity}
        />
        {calibrating && (
          <div className="calibration-hint">
            Arrastra para mover el eje. Al soltar se guarda para la orientación{' '}
            {window.matchMedia('(orientation: portrait)').matches ? 'vertical' : 'horizontal'}.
          </div>
        )}
        {finished && !playing && <div className="end-note">Fin del texto. Pulsa leer para empezar de nuevo.</div>}
      </div>

      <header className="reader-top" onPointerDown={(e) => e.stopPropagation()}>
        <button className="text-button" onClick={onExit}>
          <LibraryIcon />
          <span>Biblioteca</span>
        </button>
        <h1 className="reader-title">{doc?.meta.title}</h1>
        <div className="reader-top-actions">
          {hasGoto && (
            <button className="icon-button" onClick={() => setPanel('goto')} aria-label="Ir a capítulo o página" title="Ir a">
              <ListIcon />
            </button>
          )}
          <button className="icon-button" onClick={toggleFullscreen} aria-label="Pantalla completa" title="Pantalla completa (F)">
            <FullscreenIcon />
          </button>
          <button
            className="icon-button"
            onClick={() => {
              engine.pause();
              setPanel('settings');
            }}
            aria-label="Ajustes"
            title="Ajustes"
          >
            <SettingsIcon />
          </button>
        </div>
      </header>

      {showContext && <ContextView tokens={doc.tokens} index={index} chunkLength={chunk.length} onPick={(i) => {
        engine.seek(i);
        toggle();
      }} />}

      {!calibrating && (
        <Controls
          playing={playing}
          index={index}
          total={total}
          remainingMs={remainingMs(prefix, index, wpm)}
          wpm={wpm}
          currentWpm={engine.currentWpm()}
          realWpm={engine.realWpm()}
          onToggle={toggle}
          onSkip={(n) => engine.skip(n)}
          onPreviousSentence={() => engine.previousSentence()}
          onSeek={(i) => engine.seek(i)}
          onWpm={setWpm}
          containerRef={controlsRef}
        />
      )}

      {panel === 'goto' && doc && (
        <GotoPanel
          meta={doc.meta}
          index={index}
          onGo={(i) => {
            engine.seek(i);
            setPanel('none');
          }}
          onClose={() => setPanel('none')}
        />
      )}

      {panel === 'settings' && (
        <SettingsPanel
          onClose={() => setPanel('none')}
          onCalibrate={() => {
            setPanel('none');
            setCalibrating(true);
          }}
        />
      )}
    </div>
  );
}

/** Párrafo actual con la palabra resaltada; tocar una palabra reanuda desde ahí. */
function ContextView({
  tokens,
  index,
  chunkLength,
  onPick,
}: {
  tokens: Token[];
  index: number;
  chunkLength: number;
  onPick: (index: number) => void;
}) {
  const current = tokens[Math.min(index, tokens.length - 1)];
  let start = current.index;
  while (start > 0 && tokens[start - 1].paragraphIndex === current.paragraphIndex) start--;
  let end = current.index;
  while (end < tokens.length - 1 && tokens[end + 1].paragraphIndex === current.paragraphIndex) end++;

  const activeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  const words = tokens.slice(start, end + 1);
  return (
    <div className="context" onPointerDown={(e) => e.stopPropagation()}>
      <p lang="es">
        {words.map((t) => {
          const active = t.index >= index && t.index < index + Math.max(chunkLength, 1);
          return (
            <span key={t.index}>
              <button
                ref={t.index === index ? activeRef : undefined}
                className={`context-word ${active ? 'active' : ''}`}
                onClick={() => onPick(t.index)}
              >
                {t.text}
              </button>
              {t.split ? '' : ' '}
            </span>
          );
        })}
      </p>
      <p className="context-hint">Toca una palabra para seguir leyendo desde ahí.</p>
    </div>
  );
}

function GotoPanel({
  meta,
  index,
  onGo,
  onClose,
}: {
  meta: DocumentMeta;
  index: number;
  onGo: (index: number) => void;
  onClose: () => void;
}) {
  const [page, setPage] = useState('');
  const currentChapter = meta.chapters.reduce((found, c, i) => (c.start <= index ? i : found), 0);
  const lastPage = meta.pages[meta.pages.length - 1]?.page ?? 0;

  const goToPage = () => {
    const n = Number(page);
    if (!Number.isFinite(n) || meta.pages.length === 0) return;
    // La primera marca en esa página o, si no hay texto en ella, la siguiente con texto.
    const mark = meta.pages.find((p) => p.page >= n) ?? meta.pages[meta.pages.length - 1];
    onGo(mark.start);
  };

  return (
    <div className="sheet-backdrop" onPointerDown={onClose}>
      <div className="sheet" role="dialog" aria-label="Ir a" onPointerDown={(e) => e.stopPropagation()}>
        <div className="sheet-header">
          <h2>Ir a</h2>
          <button className="text-button" onClick={onClose}>
            Cerrar
          </button>
        </div>
        {meta.pages.length > 1 && (
          <form
            className="goto-page"
            onSubmit={(e) => {
              e.preventDefault();
              goToPage();
            }}
          >
            <label htmlFor="goto-page">Página (1 a {lastPage})</label>
            <input
              id="goto-page"
              type="number"
              inputMode="numeric"
              min={1}
              max={lastPage}
              value={page}
              onChange={(e) => setPage(e.target.value)}
            />
            <button className="button" type="submit">
              Ir a la página
            </button>
          </form>
        )}
        {meta.chapters.length > 1 && (
          <ol className="chapter-list">
            {meta.chapters.map((c, i) => (
              <li key={c.start}>
                <button className={i === currentChapter ? 'current' : ''} onClick={() => onGo(c.start)}>
                  {c.title}
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
