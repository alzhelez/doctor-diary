import { SYMPTOM_LABELS, TRIGGER_LABELS } from './dictionary';
import {
  P_DAYS,
  P_ENTRIES,
  P_READINGS,
  P_TIMES,
  TOD_ADVERB,
  addDays,
  dayKey,
  daysInclusive,
  fmtDayMonth,
  fmtDotDate,
  fmtTime,
  plural,
  startOfDay,
  weekdayShort,
} from './dates';
import { isBpAbnormal, parseEntry } from './parser';
import type { Entry, ParsedEntry, Settings, Severity, TimeOfDay } from './types';

/** Запись вместе с разбором и «настоящей» датой события (с учётом «вчера»). */
export interface TimedEntry {
  entry: Entry;
  parsed: ParsedEntry;
  when: Date;
  /** Дата сдвинута из‑за «вчера/позавчера» — точного времени нет. */
  approxTime: boolean;
}

export interface Range {
  from: Date;
  to: Date;
}

export interface Counted {
  name: string;
  count: number;
}

export interface MedStat {
  name: string;
  count: number;
  helped: number;
  notHelped: number;
  /** При каких жалобах принимали. */
  forSymptoms: string[];
}

export interface SymptomStat {
  id: string;
  label: string;
  count: number;
  dayKeys: string[];
  tod: Record<TimeOfDay, number>;
  triggers: Counted[];
  severity: Record<Severity, number>;
  maxScale: number | null;
  durations: string[];
  meds: MedStat[];
}

export interface NumReading {
  when: Date;
  value: number;
}

export interface NumStat {
  count: number;
  min: number;
  max: number;
  avg: number;
  readings: NumReading[];
}

export interface BpReading {
  when: Date;
  sys: number;
  dia: number;
}

export interface BpStat {
  count: number;
  readings: BpReading[];
  min: BpReading;
  max: BpReading;
  avgSys: number;
  avgDia: number;
  abnormal: number;
}

export interface Summary {
  range: Range;
  days: number;
  dayKeys: string[];
  entryCount: number;
  /** Сколько дней из периода были с жалобами. */
  complaintDays: number;
  symptoms: SymptomStat[];
  bp: BpStat | null;
  pulse: NumStat | null;
  temp: NumStat | null;
  sugar: NumStat | null;
  spo2: NumStat | null;
  medications: MedStat[];
  questions: { when: Date; text: string }[];
  /** Записи, в которых ничего не распознано, — чтобы ничего не потерялось. */
  unrecognized: TimedEntry[];
  timeline: TimedEntry[];
}

export function prepare(entries: Entry[]): TimedEntry[] {
  return entries
    .map((entry) => {
      const at = new Date(entry.at);
      const parsed = parseEntry(entry.text, at);
      return { entry, parsed, when: addDays(at, parsed.dayShift), approxTime: parsed.dayShift !== 0 };
    })
    .sort((a, b) => a.when.getTime() - b.when.getTime());
}

const emptyTod = (): Record<TimeOfDay, number> => ({ morning: 0, day: 0, evening: 0, night: 0 });

function countMap(names: string[]): Counted[] {
  const m = new Map<string, number>();
  for (const n of names) m.set(n, (m.get(n) ?? 0) + 1);
  return [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
}

function numStat(readings: NumReading[]): NumStat | null {
  if (!readings.length) return null;
  const values = readings.map((r) => r.value);
  const avg = values.reduce((s, v) => s + v, 0) / values.length;
  return { count: readings.length, min: Math.min(...values), max: Math.max(...values), avg: Math.round(avg * 10) / 10, readings };
}

function hasContent(p: ParsedEntry): boolean {
  return p.symptoms.length > 0 || p.medications.length > 0 || Object.keys(p.measurements).length > 0 || p.question !== null;
}

export function buildSummary(entries: Entry[], range: Range): Summary {
  const from = startOfDay(range.from);
  const to = startOfDay(range.to);
  const toEnd = addDays(to, 1).getTime();

  const timeline = prepare(entries).filter((t) => t.when.getTime() >= from.getTime() && t.when.getTime() < toEnd);

  const days = daysInclusive(from, to);
  const dayKeys = Array.from({ length: days }, (_, i) => dayKey(addDays(from, i)));

  // Жалобы
  const bySymptom = new Map<string, TimedEntry[]>();
  for (const t of timeline) {
    for (const id of t.parsed.symptoms) {
      if (!bySymptom.has(id)) bySymptom.set(id, []);
      bySymptom.get(id)!.push(t);
    }
  }

  const symptoms: SymptomStat[] = [...bySymptom.entries()].map(([id, list]) => {
    const tod = emptyTod();
    const severity: Record<Severity, number> = { mild: 0, moderate: 0, severe: 0 };
    const scales: number[] = [];
    const durations: string[] = [];
    for (const t of list) {
      tod[t.parsed.timeOfDay] += 1;
      if (t.parsed.severity) severity[t.parsed.severity] += 1;
      if (t.parsed.scale !== null) scales.push(t.parsed.scale);
      if (t.parsed.duration) durations.push(t.parsed.duration);
    }
    return {
      id,
      label: SYMPTOM_LABELS[id] ?? id,
      count: list.length,
      dayKeys: [...new Set(list.map((t) => dayKey(t.when)))].sort(),
      tod,
      triggers: countMap(list.flatMap((t) => t.parsed.triggers.map((tr) => TRIGGER_LABELS[tr] ?? tr))),
      severity,
      maxScale: scales.length ? Math.max(...scales) : null,
      durations,
      meds: medStats(list),
    };
  });
  symptoms.sort((a, b) => b.count - a.count || b.dayKeys.length - a.dayKeys.length);

  // Замеры
  const bpReadings: BpReading[] = [];
  const pulse: NumReading[] = [];
  const temp: NumReading[] = [];
  const sugar: NumReading[] = [];
  const spo2: NumReading[] = [];
  for (const t of timeline) {
    const m = t.parsed.measurements;
    if (m.bp) bpReadings.push({ when: t.when, ...m.bp });
    if (m.pulse !== undefined) pulse.push({ when: t.when, value: m.pulse });
    if (m.temp !== undefined) temp.push({ when: t.when, value: m.temp });
    if (m.sugar !== undefined) sugar.push({ when: t.when, value: m.sugar });
    if (m.spo2 !== undefined) spo2.push({ when: t.when, value: m.spo2 });
  }

  let bp: BpStat | null = null;
  if (bpReadings.length) {
    const bySys = [...bpReadings].sort((a, b) => a.sys - b.sys || a.dia - b.dia);
    bp = {
      count: bpReadings.length,
      readings: bpReadings,
      min: bySys[0],
      max: bySys[bySys.length - 1],
      avgSys: Math.round(bpReadings.reduce((s, r) => s + r.sys, 0) / bpReadings.length),
      avgDia: Math.round(bpReadings.reduce((s, r) => s + r.dia, 0) / bpReadings.length),
      abnormal: bpReadings.filter((r) => isBpAbnormal(r.sys, r.dia)).length,
    };
  }

  const complaintDays = new Set(timeline.filter((t) => t.parsed.symptoms.length).map((t) => dayKey(t.when))).size;

  return {
    range: { from, to },
    days,
    dayKeys,
    entryCount: timeline.length,
    complaintDays,
    symptoms,
    bp,
    pulse: numStat(pulse),
    temp: numStat(temp),
    sugar: numStat(sugar),
    spo2: numStat(spo2),
    medications: medStats(timeline),
    questions: timeline.filter((t) => t.parsed.question).map((t) => ({ when: t.when, text: t.parsed.question! })),
    unrecognized: timeline.filter((t) => !hasContent(t.parsed)),
    timeline,
  };
}

function medStats(list: TimedEntry[]): MedStat[] {
  const m = new Map<string, MedStat>();
  for (const t of list) {
    for (const name of t.parsed.medications) {
      const s = m.get(name) ?? { name, count: 0, helped: 0, notHelped: 0, forSymptoms: [] };
      s.count += 1;
      if (t.parsed.medEffect === 'helped') s.helped += 1;
      if (t.parsed.medEffect === 'not_helped') s.notHelped += 1;
      for (const id of t.parsed.symptoms) {
        const label = (SYMPTOM_LABELS[id] ?? id).toLowerCase();
        if (!s.forSymptoms.includes(label)) s.forSymptoms.push(label);
      }
      m.set(name, s);
    }
  }
  return [...m.values()].sort((a, b) => b.count - a.count);
}

/* ------------------------------------------------------------------ */
/* Текстовые формулировки — общие для экрана и для «Поделиться»        */
/* ------------------------------------------------------------------ */

/** «5 раз, 4 дня из 8» */
export function describeFrequency(s: SymptomStat, totalDays: number): string {
  const d = s.dayKeys.length;
  return `${s.count} ${plural(s.count, P_TIMES)}, ${d} ${plural(d, P_DAYS)} из ${totalDays}`;
}

/** «чаще утром (4 из 5)» или «утром 2, вечером 2». */
export function describeTimeOfDay(s: SymptomStat): string {
  const entries = (Object.entries(s.tod) as [TimeOfDay, number][]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return '';
  if (s.count === 1) return TOD_ADVERB[entries[0][0]];
  const [topTod, topN] = entries[0];
  if (entries.length === 1) return `всегда ${TOD_ADVERB[topTod]}`;
  if (topN / s.count >= 0.6) return `чаще ${TOD_ADVERB[topTod]} (${topN} из ${s.count})`;
  return entries.map(([tod, n]) => `${TOD_ADVERB[tod]} ${n}`).join(', ');
}

/** «до 7/10, сильно — 3 раза из 5» */
export function describeIntensity(s: SymptomStat): string {
  const parts: string[] = [];
  if (s.maxScale !== null) parts.push(`до ${s.maxScale}/10`);
  const { severe, moderate, mild } = s.severity;
  if (severe) parts.push(`сильная — ${severe} ${plural(severe, P_TIMES)} из ${s.count}`);
  else if (moderate) parts.push(`умеренная — ${moderate} ${plural(moderate, P_TIMES)} из ${s.count}`);
  else if (mild) parts.push(`слабая — ${mild} ${plural(mild, P_TIMES)} из ${s.count}`);
  return parts.join(', ');
}

export function describeCounted(list: Counted[]): string {
  return list.map((c) => (c.count > 1 ? `${c.name} (${c.count})` : c.name)).join(', ');
}

export function describeMed(m: MedStat): string {
  const effect: string[] = [];
  if (m.helped) effect.push(`помогло ${m.helped}`);
  if (m.notHelped) effect.push(`не помогло ${m.notHelped}`);
  return `${m.name} — ${m.count} ${plural(m.count, P_TIMES)}${effect.length ? ` (${effect.join(', ')})` : ''}`;
}

export function fmtWhen(t: { when: Date; approxTime?: boolean; tod?: TimeOfDay }): string {
  const base = `${fmtDotDate(t.when)} ${weekdayShort(t.when)}`;
  if (t.approxTime) return t.tod ? `${base}, ${TOD_ADVERB[t.tod]}` : base;
  return `${base} ${fmtTime(t.when)}`;
}

export function describeBp(bp: BpStat): string {
  const s = `${bp.count} ${plural(bp.count, P_READINGS)}`;
  if (bp.count === 1) return `${s}: ${bp.max.sys}/${bp.max.dia} (${fmtWhen({ when: bp.max.when })})`;
  const high = bp.abnormal ? `; вне нормы — ${bp.abnormal} ${plural(bp.abnormal, P_TIMES)}` : '';
  return `${s}: от ${bp.min.sys}/${bp.min.dia} до ${bp.max.sys}/${bp.max.dia}, в среднем ${bp.avgSys}/${bp.avgDia}${high}. Максимум — ${fmtWhen({ when: bp.max.when })}`;
}

export function describeNum(stat: NumStat, unit: string, digits = 0): string {
  const f = (v: number) => v.toFixed(digits).replace('.', ',');
  const s = `${stat.count} ${plural(stat.count, P_READINGS)}`;
  if (stat.count === 1) return `${s}: ${f(stat.max)}${unit}`;
  return `${s}: от ${f(stat.min)} до ${f(stat.max)}${unit}, в среднем ${f(stat.avg)}${unit}`;
}

/** Сводка обычным текстом — для «Поделиться», мессенджера или печати. */
export function summaryToText(s: Summary, settings: Pick<Settings, 'patientName'>): string {
  const L: string[] = [];
  const year = s.range.to.getFullYear();
  L.push('Дневник самочувствия — сводка для врача');
  if (settings.patientName.trim()) L.push(`Пациент: ${settings.patientName.trim()}`);
  L.push(
    `Период: ${fmtDayMonth(s.range.from)} — ${fmtDayMonth(s.range.to)} ${year} (${s.days} ${plural(s.days, P_DAYS)}). ` +
      `${s.entryCount} ${plural(s.entryCount, P_ENTRIES)}, дней с жалобами: ${s.complaintDays}.`,
  );

  if (s.symptoms.length) {
    L.push('', 'ЖАЛОБЫ');
    for (const sym of s.symptoms) {
      const parts = [`${sym.label}: ${describeFrequency(sym, s.days)}`];
      const tod = describeTimeOfDay(sym);
      if (tod) parts.push(tod);
      const intensity = describeIntensity(sym);
      if (intensity) parts.push(intensity);
      if (sym.durations.length) parts.push(`длительность: ${[...new Set(sym.durations)].join(', ')}`);
      if (sym.triggers.length) parts.push(`связывает с: ${describeCounted(sym.triggers)}`);
      if (sym.meds.length) parts.push(`лекарства: ${sym.meds.map(describeMed).join('; ')}`);
      L.push(`• ${parts.join('; ')}.`);
      L.push(`  Дни: ${sym.dayKeys.map((k) => k.slice(8, 10) + '.' + k.slice(5, 7)).join(', ')}`);
    }
  }

  const measures: string[] = [];
  if (s.bp) measures.push(`• Давление — ${describeBp(s.bp)}.`);
  if (s.pulse) measures.push(`• Пульс — ${describeNum(s.pulse, ' уд/мин')}.`);
  if (s.temp) measures.push(`• Температура — ${describeNum(s.temp, ' °C', 1)}.`);
  if (s.sugar) measures.push(`• Сахар крови — ${describeNum(s.sugar, ' ммоль/л', 1)}.`);
  if (s.spo2) measures.push(`• Сатурация — ${describeNum(s.spo2, '%')}.`);
  if (measures.length) L.push('', 'ЗАМЕРЫ', ...measures);

  if (s.medications.length) {
    L.push('', 'ЛЕКАРСТВА');
    for (const m of s.medications) L.push(`• ${describeMed(m)}${m.forSymptoms.length ? `; при: ${m.forSymptoms.join(', ')}` : ''}.`);
  }

  if (s.questions.length) {
    L.push('', 'ВОПРОСЫ К ВРАЧУ');
    for (const q of s.questions) L.push(`• ${q.text}`);
  }

  const notes = s.timeline.filter((t) => !t.parsed.question);
  if (notes.length) {
    L.push('', 'ЗАПИСИ ПО ДНЯМ');
    for (const t of notes) L.push(`${fmtWhen({ when: t.when, approxTime: t.approxTime, tod: t.parsed.timeOfDay })} — ${t.entry.text.trim()}`);
  }

  return L.join('\n');
}

/** Период «с прошлого приёма» или последние N дней. */
export function rangeFor(kind: 'since_visit' | 7 | 14 | 30 | 'all', settings: Settings, entries: Entry[], now = new Date()): Range {
  const to = startOfDay(now);
  if (kind === 'since_visit' && settings.lastVisit) {
    const [y, m, d] = settings.lastVisit.split('-').map(Number);
    return { from: new Date(y, m - 1, d), to };
  }
  if (kind === 'all' || kind === 'since_visit') {
    const prepared = prepare(entries);
    const first = prepared.length ? startOfDay(prepared[0].when) : to;
    return { from: first.getTime() < to.getTime() ? first : to, to };
  }
  return { from: addDays(to, -(kind - 1)), to };
}
