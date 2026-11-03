import { describe, expect, it } from 'vitest';
import { parseEntry, parseMeasurements, timeOfDayFromHour } from './parser';

/** 3 ноября 2026, 20:00 — вечер, чтобы проверять, что время из текста важнее часов. */
const EVENING = new Date(2026, 10, 3, 20, 0);
const MORNING = new Date(2026, 10, 3, 8, 15);

describe('жалобы', () => {
  it('«опять болит голова с утра» — головная боль утром, хотя записано вечером', () => {
    const p = parseEntry('Опять болит голова с утра', EVENING);
    expect(p.symptoms).toEqual(['headache']);
    expect(p.timeOfDay).toBe('morning');
    expect(p.timeOfDaySource).toBe('text');
  });

  it('«после кофе давление» — давление, связь с кофе', () => {
    const p = parseEntry('после кофе давление', MORNING);
    expect(p.symptoms).toContain('pressure');
    expect(p.triggers).toEqual(['coffee']);
    expect(p.timeOfDaySource).toBe('clock');
    expect(p.timeOfDay).toBe('morning');
  });

  it('головокружение не путается с головной болью', () => {
    const p = parseEntry('голова кружится и болит спина', MORNING);
    expect(p.symptoms).toContain('dizziness');
    expect(p.symptoms).toContain('back_pain');
    expect(p.symptoms).not.toContain('headache');
  });

  it('боль находится, если часть тела рядом со словом «болит»', () => {
    expect(parseEntry('ноет поясница после тренировки', MORNING).symptoms).toEqual(['back_pain']);
    expect(parseEntry('давит в груди', MORNING).symptoms).toEqual(['chest_pain']);
    expect(parseEntry('колет в правом боку и живот крутит, болит живот', MORNING).symptoms).toContain('abdominal_pain');
    expect(parseEntry('першит в горле', MORNING).symptoms).toEqual(['sore_throat']);
    expect(parseEntry('опять мигрень', MORNING).symptoms).toEqual(['headache']);
  });

  it('боль далеко от части тела не засчитывается', () => {
    const p = parseEntry('голова сегодня ясная, отлично выспался, а вот вечером немного болело колено', MORNING);
    expect(p.symptoms).toEqual(['joint_pain']);
  });

  it('несколько жалоб в одной фразе', () => {
    const p = parseEntry('тошнит, слабость и изжога после жирного', MORNING);
    expect(p.symptoms.sort()).toEqual(['heartburn', 'nausea', 'weakness']);
    expect(p.triggers).toEqual(['fatty_food']);
  });

  it('отрицания не считаются жалобами', () => {
    expect(parseEntry('выпил кофе, голова не болит', MORNING).symptoms).toEqual([]);
    expect(parseEntry('болит спина, тошноты нет', MORNING).symptoms).toEqual(['back_pain']);
    expect(parseEntry('сегодня без головокружения и не тошнит', MORNING).symptoms).toEqual([]);
    expect(parseEntry('не мог уснуть до трёх', MORNING).symptoms).toEqual(['insomnia']);
    expect(parseEntry('нет сил с утра', MORNING).symptoms).toEqual(['weakness']);
  });

  it('«живот крутит» — боль в животе', () => {
    const p = parseEntry('живот крутит после шаурмы', MORNING);
    expect(p.symptoms).toEqual(['abdominal_pain']);
    expect(p.triggers).toEqual(['fatty_food']);
  });

  it('буква «ё» не мешает', () => {
    expect(parseEntry('Отёки на ногах к вечеру', MORNING).symptoms).toEqual(['swelling']);
  });

  it('обычная заметка без жалоб ничего не находит', () => {
    const p = parseEntry('сегодня всё хорошо', MORNING);
    expect(p.symptoms).toEqual([]);
    expect(p.severity).toBeNull();
  });
});

describe('давление и замеры', () => {
  it('«140 на 90» и «140/90» — одинаково', () => {
    expect(parseMeasurements('давление 140 на 90').bp).toEqual({ sys: 140, dia: 90 });
    expect(parseMeasurements('давление 140/90').bp).toEqual({ sys: 140, dia: 90 });
    expect(parseMeasurements('130-85 утром').bp).toEqual({ sys: 130, dia: 85 });
  });

  it('нормальное давление — замер, но не жалоба', () => {
    const p = parseEntry('давление 120/80, в норме', MORNING);
    expect(p.measurements.bp).toEqual({ sys: 120, dia: 80 });
    expect(p.symptoms).not.toContain('pressure');
  });

  it('высокое давление — жалоба', () => {
    const p = parseEntry('намерил 155 на 95 пульс 92', MORNING);
    expect(p.symptoms).toContain('pressure');
    expect(p.measurements.pulse).toBe(92);
  });

  it('время и шкала боли не принимаются за давление', () => {
    expect(parseMeasurements('в 10:30 боль на 7/10').bp).toBeUndefined();
    expect(parseMeasurements('через 2-3 часа').bp).toBeUndefined();
  });

  it('температура: с запятой, с точкой и словом', () => {
    expect(parseMeasurements('37,8').temp).toBe(37.8);
    expect(parseMeasurements('градусник 38.2').temp).toBe(38.2);
    expect(parseMeasurements('температура 39').temp).toBe(39);
  });

  it('36,6 — не жалоба на температуру', () => {
    expect(parseEntry('температура 36,6', MORNING).symptoms).not.toContain('fever');
    expect(parseEntry('температура 37,9, знобит', MORNING).symptoms).toContain('fever');
  });

  it('сахар и сатурация', () => {
    const m = parseMeasurements('сахар 6,4 натощак, сатурация 96');
    expect(m.sugar).toBe(6.4);
    expect(m.spo2).toBe(96);
  });
});

describe('сила, длительность, время', () => {
  it('шкала «7 из 10» и «на 6 баллов»', () => {
    expect(parseEntry('болит голова, 7 из 10', MORNING).scale).toBe(7);
    expect(parseEntry('спина ноет на 6 баллов', MORNING).scale).toBe(6);
  });

  it('сила словами', () => {
    expect(parseEntry('сильно болит голова', MORNING).severity).toBe('severe');
    expect(parseEntry('немного тошнит', MORNING).severity).toBe('mild');
    expect(parseEntry('голова болит не сильно', MORNING).severity).toBe('mild');
  });

  it('длительность', () => {
    expect(parseEntry('голова болела 2 часа', MORNING).duration).toBe('2 часа');
    expect(parseEntry('слабость весь день', MORNING).duration).toBe('весь день');
  });

  it('«вчера вечером» сдвигает день и задаёт вечер', () => {
    const p = parseEntry('вчера вечером кололо в груди', MORNING);
    expect(p.dayShift).toBe(-1);
    expect(p.timeOfDay).toBe('evening');
    expect(parseEntry('позавчера тошнило', MORNING).dayShift).toBe(-2);
  });

  it('«в 3 ночи» — ночь', () => {
    expect(parseEntry('проснулся в 3 ночи с сердцебиением', MORNING).timeOfDay).toBe('night');
  });

  it('«3 дня болит горло» — не «днём»', () => {
    const p = parseEntry('3 дня болит горло', EVENING);
    expect(p.timeOfDaySource).toBe('clock');
    expect(p.duration).toBe('3 дня');
  });

  it('время суток по часам', () => {
    expect(timeOfDayFromHour(6)).toBe('morning');
    expect(timeOfDayFromHour(13)).toBe('day');
    expect(timeOfDayFromHour(19)).toBe('evening');
    expect(timeOfDayFromHour(2)).toBe('night');
  });
});

describe('лекарства и вопросы', () => {
  it('название лекарства и эффект', () => {
    const p = parseEntry('выпил нурофен, через час отпустило', MORNING);
    expect(p.medications).toEqual(['Ибупрофен (Нурофен)']);
    expect(p.medEffect).toBe('helped');
  });

  it('«не помогло» важнее «помогло»', () => {
    expect(parseEntry('цитрамон не помог', MORNING).medEffect).toBe('not_helped');
  });

  it('таблетка без названия', () => {
    expect(parseEntry('выпила таблетку от головы', MORNING).medications).toEqual(['Лекарство без названия']);
  });

  it('вопрос к врачу', () => {
    const p = parseEntry('Вопрос врачу: можно ли пить кофе при таком давлении', MORNING);
    expect(p.question).toBe('Можно ли пить кофе при таком давлении');
    expect(p.symptoms).toEqual([]);
    expect(parseEntry('спросить у врача, нужен ли анализ крови', MORNING).question).toBe('Нужен ли анализ крови');
  });
});
