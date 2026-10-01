// Biblioteca: documentos guardados, importación y ajustes.
import { useEffect, useState } from 'react';
import { deleteDocument, listDocuments, type DocumentMeta } from '../storage/db';
import { formatNumber, formatPercent, formatRelativeDate } from './format';
import { SettingsIcon, TrashIcon } from './icons';
import { Import } from './Import';
import { SettingsPanel } from './Settings';
import { useMediaQuery, useSettings } from './settingsContext';
import { WordDisplay } from './WordDisplay';

const KIND_LABELS: Record<DocumentMeta['kind'], string> = {
  texto: 'Texto pegado',
  txt: 'TXT',
  md: 'Markdown',
  pdf: 'PDF',
  docx: 'Word',
  epub: 'EPUB',
};

export function Library({ onOpen }: { onOpen: (id: number) => void }) {
  const [documents, setDocuments] = useState<DocumentMeta[] | null>(null);
  const [confirming, setConfirming] = useState<number | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const refresh = () => {
    void listDocuments().then(setDocuments);
  };
  useEffect(() => {
    refresh();
  }, []);

  return (
    <div className="library">
      <header className="library-header">
        <DemoWord />
        <button className="icon-button library-settings" onClick={() => setSettingsOpen(true)} aria-label="Ajustes" title="Ajustes">
          <SettingsIcon />
        </button>
      </header>

      <main className="library-main">
        <h1 className="library-title">Lector RSVP</h1>
        <Import onCreated={onOpen} />

        <section className="documents" aria-labelledby="documents-title">
          <h2 id="documents-title">Tus documentos</h2>
          {documents && documents.length === 0 && (
            <p className="muted">Aún no hay documentos. Importa un archivo o pega un texto para empezar.</p>
          )}
          <ul className="document-list">
            {documents?.map((doc) => {
              const progress = doc.wordCount > 0 ? doc.position / doc.wordCount : 0;
              return (
                <li key={doc.id} className="document">
                  <button className="document-open" onClick={() => onOpen(doc.id!)}>
                    <span className="document-title">{doc.title}</span>
                    <span className="document-meta">
                      <span>{KIND_LABELS[doc.kind]}</span>
                      <span>{formatNumber(doc.wordCount)} palabras</span>
                      <span>Leído {formatRelativeDate(doc.lastReadAt)}</span>
                    </span>
                    <span className="document-progress" aria-label={`Leído ${formatPercent(progress)}`}>
                      <span className="document-progress-bar">
                        <span style={{ width: `${progress * 100}%` }} />
                      </span>
                      <span className="document-percent">{formatPercent(progress)}</span>
                    </span>
                  </button>
                  {confirming === doc.id ? (
                    <span className="confirm-delete">
                      <span>¿Eliminar?</span>
                      <button
                        className="text-button danger"
                        onClick={async () => {
                          await deleteDocument(doc.id!);
                          setConfirming(null);
                          refresh();
                        }}
                      >
                        Eliminar
                      </button>
                      <button className="text-button" onClick={() => setConfirming(null)}>
                        Cancelar
                      </button>
                    </span>
                  ) : (
                    <button className="icon-button" onClick={() => setConfirming(doc.id!)} aria-label={`Eliminar ${doc.title}`} title="Eliminar">
                      <TrashIcon />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      </main>

      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}

const DEMO_WORDS = 'Lee una palabra a la vez, sin mover los ojos.'.split(' ');

/** Muestra de lectura en bucle en la cabecera, con los colores y la fuente elegidos. */
function DemoWord() {
  const { settings } = useSettings();
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [i, setI] = useState(0);

  useEffect(() => {
    if (reduceMotion) return;
    const word = DEMO_WORDS[i];
    const pause = /[.,]$/.test(word) ? (word.endsWith('.') ? 1400 : 360) : 240;
    const timer = setTimeout(() => setI((n) => (n + 1) % DEMO_WORDS.length), pause);
    return () => clearTimeout(timer);
  }, [i, reduceMotion]);

  return (
    <div className="demo" aria-hidden>
      <WordDisplay
        text={reduceMotion ? 'palabra' : DEMO_WORDS[i]}
        axis={{ x: 37, y: 50 }}
        font={settings.font}
        fontSize={40}
        showGuides
        guideOpacity={1}
        compact
      />
    </div>
  );
}
