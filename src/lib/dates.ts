import type { TimeOfDay } from './types';

const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const WEEKDAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
const WEEKDAYS_SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

export const TOD_LABEL: Record<TimeOfDay, string> = { morning: 'утро', day: 'день', evening: 'вечер', night: 'ночь' };
/** «чаще утром» */
export const TOD_ADVERB: Record<TimeOfDay, string> = { morning: 'утром', day: 'днём', evening: 'вечером', night: 'ночью' };

const pad = (n: number) => String(n).padStart(2, '0');

/** Ключ дня в локальном времени: 2026-11-03. */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 2026-11-03 → Date на полночь локального времени. */
export function fromDayKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/** Сколько календарных дней от a до b включительно. */
export function daysInclusive(a: Date, b: Date): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86_400_000) + 1;
}

/** «3 ноября» */
export function fmtDayMonth(d: Date): string {
  return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
}

/** «3 ноя» */
export function fmtDayShort(d: Date): string {
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

/** «03.11» */
export function fmtDotDate(d: Date): string {
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}`;
}

export function fmtTime(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function weekday(d: Date): string {
  return WEEKDAYS[d.getDay()];
}

export function weekdayShort(d: Date): string {
  return WEEKDAYS_SHORT[d.getDay()];
}

/** «Сегодня», «Вчера», «понедельник, 2 ноября» */
export function fmtDayHeading(d: Date, now = new Date()): string {
  const diff = daysInclusive(d, now) - 1;
  if (diff === 0) return 'Сегодня';
  if (diff === 1) return 'Вчера';
  const s = `${weekday(d)}, ${fmtDayMonth(d)}`;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Значение для <input type="datetime-local">. */
export function toLocalInput(d: Date): string {
  return `${dayKey(d)}T${fmtTime(d)}`;
}

/** Форма слова по числу: plural(5, ['раз', 'раза', 'раз']). */
export function plural(n: number, forms: [string, string, string]): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}

export const P_TIMES: [string, string, string] = ['раз', 'раза', 'раз'];
export const P_DAYS: [string, string, string] = ['день', 'дня', 'дней'];
export const P_ENTRIES: [string, string, string] = ['запись', 'записи', 'записей'];
export const P_READINGS: [string, string, string] = ['замер', 'замера', 'замеров'];
