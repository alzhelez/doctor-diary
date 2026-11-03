import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, makeBackup, mergeEntries, parseBackup } from './storage';
import type { Entry } from './types';

const a: Entry = { id: 'a', at: '2026-11-01T08:00:00.000Z', text: 'болит голова', source: 'voice' };
const b: Entry = { id: 'b', at: '2026-11-02T08:00:00.000Z', text: 'давление 140/90', source: 'text' };

describe('резервная копия', () => {
  it('копия читается обратно', () => {
    const raw = JSON.stringify(makeBackup([a, b], { ...DEFAULT_SETTINGS, patientName: 'Иванов' }));
    const res = parseBackup(raw);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.backup.entries).toEqual([a, b]);
      expect(res.backup.settings.patientName).toBe('Иванов');
    }
  });

  it('не JSON и чужой файл — понятная ошибка', () => {
    expect(parseBackup('привет')).toEqual({ ok: false, error: 'Это не файл резервной копии: не удалось прочитать JSON.' });
    expect(parseBackup('{"foo": 1}')).toMatchObject({ ok: false });
  });

  it('битые записи отбрасываются', () => {
    const res = parseBackup(JSON.stringify({ app: 'doctor-diary', entries: [a, { id: 1 }, { id: 'x', text: 'y', at: 'не дата' }] }));
    expect(res.ok && res.backup.entries).toEqual([a]);
  });

  it('объединение без дублей', () => {
    expect(mergeEntries([a], [a, b]).map((e) => e.id)).toEqual(['a', 'b']);
  });
});
