/** Одна запись дневника — то, что пользователь надиктовал или напечатал. */
export interface Entry {
  id: string;
  /** Когда сделана запись (ISO). Можно поправить вручную. */
  at: string;
  /** Текст как есть — разбор делается на лету, поэтому улучшения парсера применяются и к старым записям. */
  text: string;
  source: 'voice' | 'text';
}

export interface Settings {
  /** Имя для шапки сводки (необязательно). */
  patientName: string;
  /** Дата прошлого приёма (YYYY-MM-DD) — сводка по умолчанию строится с неё. */
  lastVisit: string | null;
  /** Дата ближайшего приёма (YYYY-MM-DD). */
  nextVisit: string | null;
  /** Видел ли пользователь предупреждение о распознавании речи. */
  privacyAcknowledged: boolean;
}

export type TimeOfDay = 'morning' | 'day' | 'evening' | 'night';
export type Severity = 'mild' | 'moderate' | 'severe';
export type MedEffect = 'helped' | 'not_helped';

export interface BloodPressure {
  sys: number;
  dia: number;
}

export interface Measurements {
  bp?: BloodPressure;
  pulse?: number;
  temp?: number;
  sugar?: number;
  spo2?: number;
}

export interface ParsedEntry {
  /** Найденные жалобы (id из словаря). */
  symptoms: string[];
  /** Возможные провоцирующие факторы (id из словаря). */
  triggers: string[];
  timeOfDay: TimeOfDay;
  /** Время суток названо в тексте («с утра») или взято из времени записи. */
  timeOfDaySource: 'text' | 'clock';
  /** Сдвиг дня: «вчера» = -1, «позавчера» = -2. */
  dayShift: number;
  severity: Severity | null;
  /** Оценка по шкале 0–10, если прозвучала («на 7 из 10»). */
  scale: number | null;
  measurements: Measurements;
  /** Названия лекарств (канонические) или «лекарство без названия». */
  medications: string[];
  medEffect: MedEffect | null;
  /** Длительность, если прозвучала: «2 часа», «весь день». */
  duration: string | null;
  /** Запись — вопрос к врачу («вопрос врачу: …»). */
  question: string | null;
}
