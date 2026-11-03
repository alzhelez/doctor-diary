import {
  BODY_PARTS,
  DURATION,
  FEVER_WORD,
  GENERIC_MED,
  MEDICATIONS,
  MED_HELPED,
  MED_NOT_HELPED,
  MILD,
  MODERATE,
  NORMAL_WORD,
  PAIN_WORD,
  PRESSURE_CHANGE,
  PRESSURE_WORD,
  SEVERE,
  STANDALONE_PAIN,
  SYMPTOMS,
  TIME_OF_DAY_WORDS,
  TRIGGERS,
} from './dictionary';
import type { Measurements, ParsedEntry, Severity, TimeOfDay } from './types';

const DIZZINESS_GLOBAL = new RegExp(SYMPTOMS.find((s) => s.id === 'dizziness')!.re.source, 'g');

/** Нижний регистр и «ё» → «е». Длина строки не меняется — индексы совпадают с оригиналом. */
export function normalize(text: string): string {
  return text.toLowerCase().replace(/ё/g, 'е');
}

/** Время суток по часу записи: 5–11 утро, 12–16 день, 17–22 вечер, остальное ночь. */
export function timeOfDayFromHour(hour: number): TimeOfDay {
  if (hour >= 5 && hour <= 11) return 'morning';
  if (hour >= 12 && hour <= 16) return 'day';
  if (hour >= 17 && hour <= 22) return 'evening';
  return 'night';
}

/** Время суток из текста: побеждает то, что названо раньше всего. */
function timeOfDayFromText(t: string): TimeOfDay | null {
  let best: { tod: TimeOfDay; idx: number } | null = null;
  for (const { tod, re } of TIME_OF_DAY_WORDS) {
    const m = re.exec(t);
    if (m && (best === null || m.index < best.idx)) best = { tod, idx: m.index };
  }
  return best?.tod ?? null;
}

const QUESTION_RE = /^\s*(?:вопрос(?:\s+(?:к\s+)?врачу)?|спросить(?:\s+(?:у\s+)?врача)?|уточнить(?:\s+у\s+врача)?)\s*[:,.—–-]?\s*/;

/** Замеры: давление, пульс, температура, сахар, сатурация. */
export function parseMeasurements(t: string): Measurements {
  const m: Measurements = {};

  // Давление: «140/90», «140 на 90», «130-85». Систолическое больше диастолического хотя бы на 10.
  const bpRe = /(\d{2,3})\s*(?:\/|\\|на|-)\s*(\d{2,3})(?!\d)/g;
  for (const match of t.matchAll(bpRe)) {
    const sys = Number(match[1]);
    const dia = Number(match[2]);
    if (sys >= 70 && sys <= 260 && dia >= 40 && dia <= 160 && sys - dia >= 10) {
      m.bp = { sys, dia };
      break;
    }
  }

  const pulse = /пульс\D{0,12}(\d{2,3})(?!\d)/.exec(t);
  if (pulse) {
    const v = Number(pulse[1]);
    if (v >= 30 && v <= 220) m.pulse = v;
  }

  // Температура: «37,8», «38.2» или «температура 38».
  const tempDec = /(?:^|[^\d])(3[4-9]|4[0-2])[.,](\d)(?!\d)/.exec(t);
  const tempInt = /температур\D{0,15}(3[5-9]|4[0-2])(?![\d.,])/.exec(t);
  if (tempDec) m.temp = Number(`${tempDec[1]}.${tempDec[2]}`);
  else if (tempInt) m.temp = Number(tempInt[1]);

  const sugar = /(?:сахар|глюкоз)\D{0,12}(\d{1,2}(?:[.,]\d{1,2})?)/.exec(t);
  if (sugar) {
    const v = Number(sugar[1].replace(',', '.'));
    if (v >= 1 && v <= 35) m.sugar = v;
  }

  const spo2 = /(?:сатурац|кислород)\D{0,12}(\d{2,3})(?!\d)/.exec(t);
  if (spo2) {
    const v = Number(spo2[1]);
    if (v >= 50 && v <= 100) m.spo2 = v;
  }

  return m;
}

export function isBpAbnormal(sys: number, dia: number): boolean {
  return sys >= 140 || dia >= 90 || sys < 90 || dia < 60;
}

const NEG_BEFORE = /(?:^|[^а-я])(?:не|без|нет)\s+$/;
const NEG_AFTER = /^[а-я]*\s+(?:нет|не было)(?:$|[^а-я])/;

/** Есть ли совпадение, перед которым нет «не/без/нет» и после которого нет «нет»: «не тошнит», «тошноты нет». */
export function matchesAffirmed(re: RegExp, t: string): boolean {
  const g = new RegExp(re.source, 'g');
  for (const m of t.matchAll(g)) {
    const i = m.index ?? 0;
    if (!NEG_BEFORE.test(t.slice(Math.max(0, i - 6), i)) && !NEG_AFTER.test(t.slice(i, i + m[0].length + 20))) return true;
  }
  return false;
}

/** Боль: слово «болит/ноет/колет…» не дальше трёх слов от части тела. */
function findPain(t: string): string[] {
  // Головокружение — не головная боль: убираем его до поиска «голова + болит».
  const cleaned = t.replace(DIZZINESS_GLOBAL, ' головокружение ');
  const words = cleaned.split(/[^а-яa-z0-9-]+/).filter(Boolean);
  const painIdx: number[] = [];
  words.forEach((w, i) => {
    // «не болит», «боли нет», «без боли» — это не жалоба.
    const negated = /^(?:не|без)$/.test(words[i - 1] ?? '') || words[i + 1] === 'нет';
    if (PAIN_WORD.test(w) && !negated) painIdx.push(i);
  });
  const found = new Set<string>();
  if (painIdx.length) {
    words.forEach((w, i) => {
      for (const part of BODY_PARTS) {
        if (part.re.test(w) && painIdx.some((p) => Math.abs(p - i) <= 3)) found.add(part.symptom);
      }
    });
  }
  for (const s of STANDALONE_PAIN) if (matchesAffirmed(s.re, t)) found.add(s.id);
  return [...found];
}

function parseSeverity(t: string): Severity | null {
  if (MILD.test(t) && /не\s?сильн/.test(t)) return 'mild';
  if (SEVERE.test(t)) return 'severe';
  if (MODERATE.test(t)) return 'moderate';
  if (MILD.test(t)) return 'mild';
  return null;
}

function parseScale(t: string): number | null {
  const m = /(?:^|[^\d])(\d{1,2})\s*(?:из|\/)\s*10(?!\d)/.exec(t) ?? /на\s*(\d{1,2})\s*балл/.exec(t);
  if (!m) return null;
  const v = Number(m[1]);
  return v >= 0 && v <= 10 ? v : null;
}

function parseMedications(t: string): string[] {
  const meds = MEDICATIONS.filter((m) => m.re.test(t)).map((m) => m.name);
  if (!meds.length && GENERIC_MED.test(t)) meds.push('Лекарство без названия');
  return meds;
}

/**
 * Разбирает одну запись. `at` — время, когда запись сделана; от него зависит
 * время суток, если в тексте оно не названо.
 */
export function parseEntry(text: string, at: Date): ParsedEntry {
  const t = normalize(text);

  const q = QUESTION_RE.exec(t);
  if (q && q[0].trim().length > 0) {
    const question = text.slice(q[0].length).trim();
    return {
      symptoms: [],
      triggers: [],
      timeOfDay: timeOfDayFromHour(at.getHours()),
      timeOfDaySource: 'clock',
      dayShift: 0,
      severity: null,
      scale: null,
      measurements: {},
      medications: [],
      medEffect: null,
      duration: null,
      question: question ? question.charAt(0).toUpperCase() + question.slice(1) : null,
    };
  }

  const measurements = parseMeasurements(t);
  const symptoms = new Set<string>();

  for (const s of SYMPTOMS) if (matchesAffirmed(s.re, t)) symptoms.add(s.id);
  for (const id of findPain(t)) symptoms.add(id);

  // Давление — жалоба, если о нём говорят без замера, если цифры вне нормы
  // или если сказано «скачет/поднялось/упало». «Давление 120/80, в норме» — просто замер.
  if (PRESSURE_WORD.test(t) || measurements.bp) {
    const bp = measurements.bp;
    const abnormal = bp ? isBpAbnormal(bp.sys, bp.dia) : false;
    const saysNormal = NORMAL_WORD.test(t);
    if (abnormal || (!bp && !saysNormal) || (PRESSURE_CHANGE.test(t) && !saysNormal)) symptoms.add('pressure');
  }

  // Температура — жалоба, если не названа нормальная цифра.
  if (FEVER_WORD.test(t) || measurements.temp !== undefined) {
    const temp = measurements.temp;
    if (temp === undefined ? !NORMAL_WORD.test(t) : temp >= 37.0) symptoms.add('fever');
  }

  const triggers = TRIGGERS.filter((tr) => tr.re.test(t)).map((tr) => tr.id);

  const todText = timeOfDayFromText(t);
  const dayShift = /позавчера/.test(t) ? -2 : /вчера/.test(t) ? -1 : 0;

  const medications = parseMedications(t);
  let medEffect: ParsedEntry['medEffect'] = null;
  if (medications.length) {
    if (MED_NOT_HELPED.test(t)) medEffect = 'not_helped';
    else if (MED_HELPED.test(t)) medEffect = 'helped';
  }

  const dur = DURATION.exec(t);

  return {
    symptoms: [...symptoms],
    triggers,
    timeOfDay: todText ?? timeOfDayFromHour(at.getHours()),
    timeOfDaySource: todText ? 'text' : 'clock',
    dayShift,
    severity: symptoms.size ? parseSeverity(t) : null,
    scale: parseScale(t),
    measurements,
    medications,
    medEffect,
    duration: dur ? (dur[1] ?? dur[2]).replace(/\s+/g, ' ').trim() : null,
    question: null,
  };
}
