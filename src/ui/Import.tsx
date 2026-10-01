// Importar: archivo (PDF, DOCX, EPUB, TXT, MD) o texto pegado.
import { useRef, useState, type DragEvent } from 'react';
import { tokenizeBlocks, type Block } from '../core/tokenizer';
import { ACCEPTED_FILES, ImportError, importFile, titleFromText } from '../importers';
import { importPlainText } from '../importers/plain';
import { addDocument, type DocumentKind } from '../storage/db';
import { useSettings } from './settingsContext';

/** Tokeniza y guarda un documento importado; devuelve su id. */
export async function saveImported(title: string, kind: DocumentKind, blocks: Block[], splitLongWords: boolean): Promise<number> {
  const doc = tokenizeBlocks(blocks, { splitLongWords });
  if (doc.tokens.length === 0) throw new ImportError('No se encontró texto para leer.');
  return addDocument(title, kind, doc);
}

const SAMPLE_TEXT = `Leer una palabra a la vez cambia la forma en que el ojo trabaja. En una página normal, la mirada salta de un punto a otro a lo largo de cada línea, y cada salto cuesta tiempo.

Aquí las palabras llegan siempre al mismo lugar. La letra roja marca el punto donde el ojo reconoce la palabra más rápido, y queda quieta en el mismo sitio, justo debajo de la marca de las guías.

La lectura empieza despacio y acelera poco a poco hasta la velocidad que elijas. Las comas, los puntos y los finales de párrafo reciben una pausa un poco más larga, como cuando lees en voz alta.

Si te pierdes, pausa: verás el párrafo completo y podrás tocar cualquier palabra para seguir desde ahí.`;

export function Import({ onCreated }: { onCreated: (id: number) => void }) {
  const { settings } = useSettings();
  const [pasted, setPasted] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setError(null);
    setBusy(`Importando ${file.name}…`);
    try {
      const result = await importFile(file, (fraction) =>
        setBusy(`Leyendo ${file.name}: ${Math.round(fraction * 100)} %`),
      );
      const id = await saveImported(result.title, result.kind, result.blocks, settings.splitLongWords);
      onCreated(id);
    } catch (e) {
      setError(e instanceof ImportError ? e.message : 'No se pudo importar el archivo. Comprueba que no esté dañado.');
      console.error(e);
    } finally {
      setBusy(null);
    }
  };

  const handleText = async (text: string, title = titleFromText(text)) => {
    setError(null);
    try {
      const id = await saveImported(title, 'texto', importPlainText(text), settings.splitLongWords);
      onCreated(id);
    } catch (e) {
      setError(e instanceof ImportError ? e.message : 'No se pudo guardar el texto.');
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) void handleFile(file);
  };

  return (
    <section className="import" aria-label="Añadir texto">
      <div
        className={`dropzone ${dragging ? 'dragging' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <button className="button primary" onClick={() => fileInput.current?.click()} disabled={busy !== null}>
          Importar archivo
        </button>
        <p className="muted">PDF, Word (.docx), EPUB, TXT o Markdown. También puedes soltarlo aquí.</p>
        <input
          ref={fileInput}
          type="file"
          accept={ACCEPTED_FILES}
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
            e.target.value = '';
          }}
        />
      </div>

      {busy && (
        <p className="status" role="status">
          {busy}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <div className="paste">
        <label htmlFor="paste-text">O pega un texto</label>
        <textarea
          id="paste-text"
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          placeholder="Pega aquí un artículo, un correo o un capítulo…"
          rows={5}
        />
        <div className="button-row">
          <button className="button" disabled={!pasted.trim()} onClick={() => void handleText(pasted)}>
            Leer este texto
          </button>
          <button className="text-button" onClick={() => void handleText(SAMPLE_TEXT, 'Cómo funciona este lector')}>
            Probar con un texto de ejemplo
          </button>
        </div>
      </div>
    </section>
  );
}
