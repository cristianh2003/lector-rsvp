// La palabra con su letra ORP alineada sobre el eje, más las líneas guía y sus marcas.
import { memo, type CSSProperties } from 'react';
import { splitAtOrp } from '../core/orp';
import { FONT_STACKS, type AxisPosition, type FontChoice } from '../storage/settings';

interface WordDisplayProps {
  text: string;
  axis: AxisPosition;
  font: FontChoice;
  fontSize: number;
  showGuides: boolean;
  guideOpacity: number;
  /** Tamaño relativo al contenedor (para la vista previa pequeña de la biblioteca). */
  compact?: boolean;
}

export const WordDisplay = memo(function WordDisplay({
  text,
  axis,
  font,
  fontSize,
  showGuides,
  guideOpacity,
  compact,
}: WordDisplayProps) {
  const { left, pivot, right } = splitAtOrp(text);
  const style = {
    '--axis-x': `${axis.x}%`,
    '--axis-y': `${axis.y}%`,
    '--word-size': compact ? `${fontSize}px` : `min(${fontSize}px, 14vw)`,
    '--word-font': FONT_STACKS[font],
  } as CSSProperties;

  return (
    <div className="stage" style={style}>
      {showGuides && (
        <div className="guides" style={{ opacity: guideOpacity }} aria-hidden>
          <div className="guide-line guide-top" />
          <div className="guide-line guide-bottom" />
          <div className="guide-tick guide-tick-top" />
          <div className="guide-tick guide-tick-bottom" />
        </div>
      )}
      <div className="word" aria-hidden>
        <span className="word-left">{left}</span>
        <span className="word-pivot">{pivot}</span>
        <span className="word-right">{right}</span>
      </div>
    </div>
  );
});
