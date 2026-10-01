// Raíz: carga ajustes, recibe textos compartidos y alterna entre biblioteca y lectura.
import { useEffect, useState } from 'react';
import { titleFromText } from '../importers';
import { importPlainText } from '../importers/plain';
import { getOpenDocument, loadSettings, setOpenDocument } from '../storage/db';
import type { Settings } from '../storage/settings';
import { saveImported } from './Import';
import { Library } from './Library';
import { Reader } from './Reader';
import { SettingsProvider } from './settingsContext';

type View = { name: 'library' } | { name: 'reader'; docId: number };

export function App() {
  const [boot, setBoot] = useState<{ settings: Settings; view: View } | null>(null);

  useEffect(() => {
    void (async () => {
      const settings = await loadSettings();
      const shared = await receiveSharedText(settings);
      const openId = shared ?? (await getOpenDocument());
      setBoot({ settings, view: openId !== null ? { name: 'reader', docId: openId } : { name: 'library' } });
    })();
  }, []);

  if (!boot) return null;
  return (
    <SettingsProvider initial={boot.settings}>
      <Views initial={boot.view} />
    </SettingsProvider>
  );
}

function Views({ initial }: { initial: View }) {
  const [view, setView] = useState<View>(initial);

  if (view.name === 'reader') {
    return (
      <Reader
        key={view.docId}
        docId={view.docId}
        onExit={() => {
          void setOpenDocument(null);
          setView({ name: 'library' });
        }}
      />
    );
  }
  return <Library onOpen={(docId) => setView({ name: 'reader', docId })} />;
}

/**
 * Texto enviado desde otra app con "Compartir" (share_target del manifiesto).
 * Llega como parámetros de la URL; se guarda como documento y se limpia la URL.
 */
async function receiveSharedText(settings: Settings): Promise<number | null> {
  const params = new URLSearchParams(window.location.search);
  const text = params.get('text')?.trim() ?? '';
  const url = params.get('url')?.trim() ?? '';
  const title = params.get('title')?.trim() ?? '';
  if (!text && !url) return null;
  window.history.replaceState(null, '', window.location.pathname);

  const body = [text, url && !text.includes(url) ? url : ''].filter(Boolean).join('\n\n');
  try {
    return await saveImported(title || titleFromText(body), 'texto', importPlainText(body), settings.splitLongWords);
  } catch {
    return null;
  }
}
