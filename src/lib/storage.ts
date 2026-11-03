import { useCallback, useEffect, useState } from 'react';
import type { Entry, Settings } from './types';

/**
 * Хранение — только на устройстве, в localStorage браузера.
 * Сервера нет: медицинские записи никуда не уходят.
 */

const ENTRIES_KEY = 'doctor-diary.entries.v1';
const SETTINGS_KEY = 'doctor-diary.settings.v1';

export const DEFAULT_SETTINGS: Settings = {
  patientName: '',
  lastVisit: null,
  nextVisit: null,
  privacyAcknowledged: false,
};

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Просим браузер не удалять данные при нехватке места (особенно важно на iOS). */
export function requestPersistentStorage(): void {
  try {
    navigator.storage?.persist?.().catch(() => undefined);
  } catch {
    /* не поддерживается — не страшно */
  }
}

export interface Store {
  entries: Entry[];
  settings: Settings;
  saveError: boolean;
  addEntry: (text: string, at: Date, source: Entry['source']) => void;
  updateEntry: (id: string, patch: Partial<Pick<Entry, 'text' | 'at'>>) => void;
  deleteEntry: (id: string) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  replaceAll: (entries: Entry[], settings?: Partial<Settings>) => void;
  clearAll: () => void;
}

export function useStore(): Store {
  const [entries, setEntries] = useState<Entry[]>(() => read<Entry[]>(ENTRIES_KEY, []));
  const [settings, setSettings] = useState<Settings>(() => ({ ...DEFAULT_SETTINGS, ...read<Partial<Settings>>(SETTINGS_KEY, {}) }));
  const [saveError, setSaveError] = useState(false);

  useEffect(() => setSaveError(!write(ENTRIES_KEY, entries)), [entries]);
  useEffect(() => {
    write(SETTINGS_KEY, settings);
  }, [settings]);

  // Если приложение открыто в двух вкладках — держим их в согласии.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === ENTRIES_KEY) setEntries(read<Entry[]>(ENTRIES_KEY, []));
      if (e.key === SETTINGS_KEY) setSettings({ ...DEFAULT_SETTINGS, ...read<Partial<Settings>>(SETTINGS_KEY, {}) });
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const addEntry = useCallback((text: string, at: Date, source: Entry['source']) => {
    const clean = text.trim();
    if (!clean) return;
    setEntries((list) => [...list, { id: newId(), at: at.toISOString(), text: clean, source }]);
  }, []);

  const updateEntry = useCallback((id: string, patch: Partial<Pick<Entry, 'text' | 'at'>>) => {
    setEntries((list) => list.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }, []);

  const deleteEntry = useCallback((id: string) => setEntries((list) => list.filter((e) => e.id !== id)), []);

  const updateSettings = useCallback((patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch })), []);

  const replaceAll = useCallback((next: Entry[], nextSettings?: Partial<Settings>) => {
    setEntries(next);
    if (nextSettings) setSettings((s) => ({ ...s, ...nextSettings }));
  }, []);

  const clearAll = useCallback(() => {
    setEntries([]);
    setSettings((s) => ({ ...DEFAULT_SETTINGS, privacyAcknowledged: s.privacyAcknowledged }));
  }, []);

  return { entries, settings, saveError, addEntry, updateEntry, deleteEntry, updateSettings, replaceAll, clearAll };
}

/* ------------------------------------------------------------------ */
/* Резервная копия                                                    */
/* ------------------------------------------------------------------ */

export interface Backup {
  app: 'doctor-diary';
  version: 1;
  exportedAt: string;
  entries: Entry[];
  settings: Settings;
}

export function makeBackup(entries: Entry[], settings: Settings): Backup {
  return { app: 'doctor-diary', version: 1, exportedAt: new Date().toISOString(), entries, settings };
}

/** Проверяет файл копии. Возвращает записи или текст ошибки. */
export function parseBackup(raw: string): { ok: true; backup: Backup } | { ok: false; error: string } {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'Это не файл резервной копии: не удалось прочитать JSON.' };
  }
  const b = data as Partial<Backup>;
  if (b?.app !== 'doctor-diary' || !Array.isArray(b.entries)) {
    return { ok: false, error: 'Файл не похож на копию «Дневника для врача».' };
  }
  const entries = b.entries.filter(
    (e): e is Entry => typeof e?.id === 'string' && typeof e?.text === 'string' && !Number.isNaN(Date.parse(e?.at)),
  );
  return {
    ok: true,
    backup: { app: 'doctor-diary', version: 1, exportedAt: b.exportedAt ?? '', entries, settings: { ...DEFAULT_SETTINGS, ...b.settings } },
  };
}

/** Объединяет копию с текущими записями без дублей (по id). */
export function mergeEntries(current: Entry[], incoming: Entry[]): Entry[] {
  const ids = new Set(current.map((e) => e.id));
  return [...current, ...incoming.filter((e) => !ids.has(e.id))];
}
