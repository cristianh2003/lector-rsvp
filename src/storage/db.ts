// Almacenamiento local con IndexedDB (Dexie): documentos, progreso, ajustes y estadísticas.
import Dexie, { type Table } from 'dexie';
import type { Chapter, PageMark, Token, TokenizedDocument } from '../core/tokenizer';
import { mergeSettings, type Settings } from './settings';

export type DocumentKind = 'texto' | 'txt' | 'md' | 'pdf' | 'docx' | 'epub';

/** Datos ligeros de un documento, para la biblioteca. */
export interface DocumentMeta {
  id?: number;
  title: string;
  kind: DocumentKind;
  createdAt: number;
  lastReadAt: number;
  wordCount: number;
  position: number;
  chapters: Chapter[];
  pages: PageMark[];
}

/** Texto ya tokenizado, en una tabla aparte para que la biblioteca cargue rápido. */
export interface DocumentContent {
  id: number;
  tokens: Token[];
}

export interface DayStats {
  /** AAAA-MM-DD en hora local. */
  date: string;
  words: number;
  ms: number;
}

interface KeyValue {
  key: string;
  value: unknown;
}

class ReaderDatabase extends Dexie {
  documents!: Table<DocumentMeta, number>;
  contents!: Table<DocumentContent, number>;
  kv!: Table<KeyValue, string>;
  stats!: Table<DayStats, string>;

  constructor() {
    super('lector-rsvp');
    this.version(1).stores({
      documents: '++id, lastReadAt',
      contents: 'id',
      kv: 'key',
      stats: 'date',
    });
  }
}

export const db = new ReaderDatabase();

export async function addDocument(title: string, kind: DocumentKind, doc: TokenizedDocument): Promise<number> {
  const now = Date.now();
  return db.transaction('rw', db.documents, db.contents, async () => {
    const id = await db.documents.add({
      title,
      kind,
      createdAt: now,
      lastReadAt: now,
      wordCount: doc.tokens.length,
      position: 0,
      chapters: doc.chapters,
      pages: doc.pages,
    });
    await db.contents.add({ id, tokens: doc.tokens });
    return id;
  });
}

export function listDocuments(): Promise<DocumentMeta[]> {
  return db.documents.orderBy('lastReadAt').reverse().toArray();
}

export async function loadDocument(id: number): Promise<{ meta: DocumentMeta; tokens: Token[] } | null> {
  const [meta, content] = await Promise.all([db.documents.get(id), db.contents.get(id)]);
  if (!meta || !content) return null;
  return { meta, tokens: content.tokens };
}

export async function savePosition(id: number, position: number): Promise<void> {
  await db.documents.update(id, { position, lastReadAt: Date.now() });
}

export async function deleteDocument(id: number): Promise<void> {
  await db.transaction('rw', db.documents, db.contents, async () => {
    await db.documents.delete(id);
    await db.contents.delete(id);
  });
}

export async function loadSettings(): Promise<Settings> {
  const row = await db.kv.get('settings');
  return mergeSettings(row?.value);
}

export async function saveSettings(settings: Settings): Promise<void> {
  await db.kv.put({ key: 'settings', value: settings });
}

/** Documento abierto al cerrar la app, para retomarlo al volver. */
export async function getOpenDocument(): Promise<number | null> {
  const row = await db.kv.get('openDocument');
  return typeof row?.value === 'number' ? row.value : null;
}

export async function setOpenDocument(id: number | null): Promise<void> {
  await db.kv.put({ key: 'openDocument', value: id });
}

export function localDate(time = Date.now()): string {
  const d = new Date(time);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export async function addReadingStats(words: number, ms: number): Promise<void> {
  if (words <= 0 && ms <= 0) return;
  const date = localDate();
  await db.transaction('rw', db.stats, async () => {
    const current = await db.stats.get(date);
    await db.stats.put({ date, words: (current?.words ?? 0) + words, ms: (current?.ms ?? 0) + ms });
  });
}

export function recentStats(days: number): Promise<DayStats[]> {
  const since = localDate(Date.now() - (days - 1) * 86400000);
  return db.stats.where('date').aboveOrEqual(since).sortBy('date');
}
