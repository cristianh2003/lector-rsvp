import { describe, expect, it } from 'vitest';
import { RsvpEngine, type Clock, type WordEvent } from './engine';
import { DEFAULT_TIMING } from './timing';
import { tokenizeText } from './tokenizer';

/** Reloj falso: el tiempo solo avanza cuando la prueba lo pide. */
function fakeClock() {
  let now = 0;
  let timers: { at: number; cb: () => void; id: number }[] = [];
  let nextId = 1;
  const clock: Clock = {
    now: () => now,
    setTimer: (cb, ms) => {
      const id = nextId++;
      timers.push({ at: now + ms, cb, id });
      return id;
    },
    clearTimer: (id) => {
      timers = timers.filter((t) => t.id !== id);
    },
  };
  const advance = (ms: number) => {
    const end = now + ms;
    for (;;) {
      timers.sort((a, b) => a.at - b.at);
      const t = timers[0];
      if (!t || t.at > end) break;
      timers.shift();
      now = t.at;
      t.cb();
    }
    now = end;
  };
  return { clock, advance, now: () => now };
}

const words = (n: number) => Array.from({ length: n }, () => 'casa').join(' ');
const noRamp = { enabled: false, startWpm: 100, words: 0 };

describe('RsvpEngine', () => {
  it('termina el texto y se detiene', () => {
    const { clock, advance } = fakeClock();
    const engine = new RsvpEngine({ wpm: 300, ramp: noRamp }, clock);
    engine.load(tokenizeText(words(100)).tokens);
    engine.play();
    advance(60_000);
    expect(engine.finished).toBe(true);
    expect(engine.playing).toBe(false);
  });

  it('3000 palabras a 300 ppm tardan 10 min ± 2 % (sin rampa)', () => {
    const { clock, advance, now } = fakeClock();
    const engine = new RsvpEngine({ wpm: 300, ramp: noRamp }, clock);
    let endedAt = -1;
    engine.subscribe({ onEnd: () => (endedAt = now()) });
    engine.load(tokenizeText(words(3000)).tokens);
    engine.play();
    advance(20 * 60_000);
    const tenMinutes = 600_000;
    expect(Math.abs(endedAt - tenMinutes) / tenMinutes).toBeLessThan(0.02);
  });

  it('la aceleración empieza lenta y llega a la velocidad elegida', () => {
    const { clock, advance } = fakeClock();
    const engine = new RsvpEngine({ wpm: 600, ramp: { enabled: true, startWpm: 200, words: 50 } }, clock);
    const seen: WordEvent[] = [];
    engine.subscribe({ onWord: (e) => void (e.playing && seen.push(e)) });
    engine.load(tokenizeText(words(200)).tokens);
    engine.play();
    advance(60_000);
    expect(seen[0].wpm).toBe(200);
    expect(seen[25].wpm).toBeGreaterThan(200);
    expect(seen[25].wpm).toBeLessThan(600);
    expect(seen[60].wpm).toBe(600);
    for (let i = 1; i < seen.length; i++) expect(seen[i].wpm).toBeGreaterThanOrEqual(seen[i - 1].wpm);
  });

  it('tras una pausa corta usa el arranque breve; tras una larga, la rampa completa', () => {
    const { clock, advance } = fakeClock();
    const engine = new RsvpEngine({ wpm: 500, ramp: { enabled: true, startWpm: 150, words: 100 } }, clock);
    const seen: WordEvent[] = [];
    engine.subscribe({ onWord: (e) => void (e.playing && seen.push(e)) });
    engine.load(tokenizeText(words(2000)).tokens);
    engine.play();
    advance(10_000);
    engine.pause();
    advance(5_000);
    seen.length = 0;
    engine.play();
    expect(seen[0].wpm).toBeCloseTo(300); // 60 % de 500
    advance(5_000);
    engine.pause();
    advance(3 * 60_000);
    seen.length = 0;
    engine.play();
    expect(seen[0].wpm).toBe(150);
  });

  it('muestra 2 o 3 palabras por destello sin cruzar párrafos', () => {
    const engine = new RsvpEngine({ chunkSize: 3 });
    engine.load(tokenizeText('uno dos tres cuatro\n\ncinco seis').tokens);
    expect(engine.chunkAt(0).map((t) => t.text)).toEqual(['uno', 'dos', 'tres']);
    expect(engine.chunkAt(3).map((t) => t.text)).toEqual(['cuatro']);
  });

  it('navegación: saltar 10 palabras y oración anterior', () => {
    const engine = new RsvpEngine();
    engine.load(
      tokenizeText('Uno dos tres. Cuatro cinco seis. Siete ocho nueve diez once doce trece catorce quince.').tokens,
    );
    engine.seek(8);
    engine.previousSentence();
    expect(engine.index).toBe(3);
    engine.skip(10);
    expect(engine.index).toBe(13);
    engine.skip(-100);
    expect(engine.index).toBe(0);
  });

  it('la velocidad real tiene en cuenta las pausas de puntuación', () => {
    const { clock, advance } = fakeClock();
    const engine = new RsvpEngine({ wpm: 300, ramp: noRamp, timing: DEFAULT_TIMING }, clock);
    engine.load(tokenizeText(Array.from({ length: 200 }, () => 'casa.').join(' ')).tokens);
    engine.play();
    advance(30_000);
    // Cada palabra lleva punto (×2), así que la velocidad real ronda la mitad.
    expect(engine.realWpm()).toBeGreaterThan(140);
    expect(engine.realWpm()).toBeLessThan(160);
  });
});
