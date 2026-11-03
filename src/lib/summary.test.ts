import { describe, expect, it } from 'vitest';
import { buildSummary, describeTimeOfDay, rangeFor, summaryToText } from './summary';
import type { Entry, Settings } from './types';

let n = 0;
const e = (y: number, mo: number, d: number, h: number, text: string): Entry => ({
  id: String(++n),
  at: new Date(y, mo - 1, d, h, 0).toISOString(),
  text,
  source: 'voice',
});

/** Неделя из примера: голова по утрам, давление после кофе. */
const WEEK: Entry[] = [
  e(2026, 10, 28, 8, 'опять болит голова с утра, 6 из 10'),
  e(2026, 10, 28, 10, 'после кофе давление 150 на 95'),
  e(2026, 10, 29, 7, 'голова болит сильно, выпил нурофен, помогло'),
  e(2026, 10, 30, 21, 'с утра болела голова, к обеду прошла'),
  e(2026, 10, 31, 11, 'после кофе давление, сердце колотится'),
  e(2026, 11, 1, 19, 'давление 125/80 в норме'),
  e(2026, 11, 2, 22, 'голова болит вечером после компьютера'),
  e(2026, 11, 3, 9, 'вопрос врачу: можно ли мне кофе'),
  e(2026, 11, 3, 9, 'купил новый тонометр'),
];

const RANGE = { from: new Date(2026, 9, 27), to: new Date(2026, 10, 3) };
const SETTINGS: Settings = { patientName: 'Иванов И. И.', lastVisit: null, nextVisit: null, privacyAcknowledged: true };

describe('сводка', () => {
  const s = buildSummary(WEEK, RANGE);

  it('период и счётчики', () => {
    expect(s.days).toBe(8);
    expect(s.entryCount).toBe(9);
    expect(s.complaintDays).toBe(5);
  });

  it('самая частая жалоба — головная боль, чаще утром', () => {
    const head = s.symptoms[0];
    expect(head.id).toBe('headache');
    expect(head.count).toBe(4);
    expect(head.dayKeys).toEqual(['2026-10-28', '2026-10-29', '2026-10-30', '2026-11-02']);
    expect(head.tod.morning).toBe(3);
    expect(describeTimeOfDay(head)).toBe('чаще утром (3 из 4)');
    expect(head.maxScale).toBe(6);
    expect(head.severity.severe).toBe(1);
  });

  it('давление связано с кофе, нормальный замер не считается жалобой', () => {
    const p = s.symptoms.find((x) => x.id === 'pressure')!;
    expect(p.count).toBe(2);
    expect(p.triggers[0]).toEqual({ name: 'кофе', count: 2 });
  });

  it('замеры давления', () => {
    expect(s.bp!.count).toBe(2);
    expect(s.bp!.max).toMatchObject({ sys: 150, dia: 95 });
    expect(s.bp!.min).toMatchObject({ sys: 125, dia: 80 });
    expect(s.bp!.abnormal).toBe(1);
  });

  it('лекарства привязаны к жалобам', () => {
    expect(s.medications).toEqual([
      { name: 'Ибупрофен (Нурофен)', count: 1, helped: 1, notHelped: 0, forSymptoms: ['головная боль'] },
    ]);
  });

  it('вопросы и нераспознанные записи не теряются', () => {
    expect(s.questions.map((q) => q.text)).toEqual(['Можно ли мне кофе']);
    expect(s.unrecognized.map((t) => t.entry.text)).toEqual(['купил новый тонометр']);
  });

  it('записи вне периода не попадают', () => {
    const short = buildSummary(WEEK, { from: new Date(2026, 10, 1), to: new Date(2026, 10, 3) });
    expect(short.entryCount).toBe(4);
    expect(short.symptoms.find((x) => x.id === 'headache')!.count).toBe(1);
  });

  it('«вчера» переносит запись на предыдущий день', () => {
    const s2 = buildSummary([e(2026, 11, 3, 9, 'вчера вечером тошнило')], RANGE);
    expect(s2.symptoms[0].dayKeys).toEqual(['2026-11-02']);
    expect(s2.timeline[0].approxTime).toBe(true);
  });

  it('текст сводки содержит главное', () => {
    const text = summaryToText(s, SETTINGS);
    expect(text).toContain('Пациент: Иванов И. И.');
    expect(text).toContain('Период: 27 октября — 3 ноября 2026 (8 дней)');
    expect(text).toContain('Головная боль: 4 раза, 4 дня из 8; чаще утром (3 из 4); до 6/10');
    expect(text).toContain('связывает с: кофе (2)');
    expect(text).toContain('Давление — 2 замера: от 125/80 до 150/95');
    expect(text).toContain('ВОПРОСЫ К ВРАЧУ\n• Можно ли мне кофе');
    expect(text).toContain('28.10 ср 08:00 — опять болит голова с утра, 6 из 10');
  });

  it('пустой период', () => {
    const empty = buildSummary([], RANGE);
    expect(empty.symptoms).toEqual([]);
    expect(summaryToText(empty, { patientName: '' })).toContain('0 записей');
  });
});

describe('период', () => {
  const now = new Date(2026, 10, 3, 12);
  it('последние 7 дней включают сегодня', () => {
    const r = rangeFor(7, SETTINGS, [], now);
    expect(r.from).toEqual(new Date(2026, 9, 28));
    expect(r.to).toEqual(new Date(2026, 10, 3));
  });

  it('с прошлого приёма', () => {
    const r = rangeFor('since_visit', { ...SETTINGS, lastVisit: '2026-10-20' }, [], now);
    expect(r.from).toEqual(new Date(2026, 9, 20));
  });

  it('без даты приёма — с первой записи', () => {
    const r = rangeFor('since_visit', SETTINGS, WEEK, now);
    expect(r.from).toEqual(new Date(2026, 9, 28));
  });
});
