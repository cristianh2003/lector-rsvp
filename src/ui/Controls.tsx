// Barra inferior de la pantalla de lectura: progreso, navegación y velocidad.
import type { CSSProperties, Ref } from 'react';
import { MAX_WPM, MIN_WPM, WPM_STEP } from '../core/timing';
import { formatDuration, formatPercent } from './format';
import { BackIcon, ForwardIcon, MinusIcon, PauseIcon, PlayIcon, PlusIcon, SentenceIcon } from './icons';

interface ControlsProps {
  playing: boolean;
  index: number;
  total: number;
  remainingMs: number;
  wpm: number;
  currentWpm: number;
  realWpm: number;
  onToggle: () => void;
  onSkip: (words: number) => void;
  onPreviousSentence: () => void;
  onSeek: (index: number) => void;
  onWpm: (wpm: number) => void;
  containerRef?: Ref<HTMLDivElement>;
}

export function Controls(props: ControlsProps) {
  const { playing, index, total, remainingMs, wpm, currentWpm, realWpm } = props;
  const fraction = total > 0 ? index / total : 0;
  const accelerating = playing && currentWpm < wpm - 1;

  return (
    <div className="controls" ref={props.containerRef} onPointerDown={(e) => e.stopPropagation()}>
      <div className="progress">
        <input
          type="range"
          className="progress-range"
          min={0}
          max={Math.max(total - 1, 0)}
          step={1}
          value={Math.min(index, Math.max(total - 1, 0))}
          onChange={(e) => props.onSeek(Number(e.target.value))}
          aria-label="Posición en el texto"
          style={{ '--fill': `${fraction * 100}%` } as CSSProperties}
        />
        <div className="progress-labels">
          <span>{formatPercent(fraction)}</span>
          <span>Quedan {formatDuration(remainingMs)}</span>
        </div>
      </div>

      <div className="transport">
        <button className="icon-button" onClick={props.onPreviousSentence} title="Oración anterior (S)" aria-label="Oración anterior">
          <SentenceIcon />
        </button>
        <button className="icon-button" onClick={() => props.onSkip(-10)} title="Retroceder 10 palabras (←)" aria-label="Retroceder 10 palabras">
          <BackIcon />
        </button>
        <button
          className="play-button"
          onClick={props.onToggle}
          title={playing ? 'Pausar (espacio)' : 'Leer (espacio)'}
          aria-label={playing ? 'Pausar' : 'Leer'}
        >
          {playing ? <PauseIcon /> : <PlayIcon />}
        </button>
        <button className="icon-button" onClick={() => props.onSkip(10)} title="Avanzar 10 palabras (→)" aria-label="Avanzar 10 palabras">
          <ForwardIcon />
        </button>
      </div>

      <div className="speed">
        <button className="icon-button small" onClick={() => props.onWpm(wpm - WPM_STEP)} aria-label="Más lento" title="Más lento (↓)">
          <MinusIcon />
        </button>
        <input
          type="range"
          min={MIN_WPM}
          max={MAX_WPM}
          step={WPM_STEP}
          value={wpm}
          onChange={(e) => props.onWpm(Number(e.target.value))}
          aria-label="Velocidad máxima en palabras por minuto"
          style={{ '--fill': `${((wpm - MIN_WPM) / (MAX_WPM - MIN_WPM)) * 100}%` } as CSSProperties}
        />
        <button className="icon-button small" onClick={() => props.onWpm(wpm + WPM_STEP)} aria-label="Más rápido" title="Más rápido (↑)">
          <PlusIcon />
        </button>
        <div className="speed-readout">
          <strong>{wpm} ppm</strong>
          <span className="muted">
            {accelerating ? `acelerando: ${Math.round(currentWpm)}` : realWpm > 0 ? `real: ${Math.round(realWpm)}` : 'velocidad'}
          </span>
        </div>
      </div>
    </div>
  );
}
