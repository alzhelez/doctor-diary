import { SYMPTOM_LABELS, TRIGGER_LABELS } from '../lib/dictionary';
import { TOD_LABEL } from '../lib/dates';
import { isBpAbnormal } from '../lib/parser';
import type { ParsedEntry } from '../lib/types';

/** Что приложение поняло из записи — показываем, чтобы было видно, попадёт ли это в сводку. */
export function EntryChips({ parsed, showTime = true }: { parsed: ParsedEntry; showTime?: boolean }) {
  if (parsed.question) {
    return (
      <ul className="chips" aria-label="Распознано">
        <li className="chip chip--question">Вопрос врачу</li>
      </ul>
    );
  }

  const m = parsed.measurements;
  const items: { key: string; text: string; kind: string }[] = [];

  for (const id of parsed.symptoms) items.push({ key: `s-${id}`, text: SYMPTOM_LABELS[id] ?? id, kind: 'symptom' });
  if (parsed.scale !== null) items.push({ key: 'scale', text: `${parsed.scale}/10`, kind: 'value' });
  if (m.bp) items.push({ key: 'bp', text: `${m.bp.sys}/${m.bp.dia}`, kind: isBpAbnormal(m.bp.sys, m.bp.dia) ? 'alert' : 'value' });
  if (m.pulse !== undefined) items.push({ key: 'pulse', text: `пульс ${m.pulse}`, kind: 'value' });
  if (m.temp !== undefined) items.push({ key: 'temp', text: `${String(m.temp).replace('.', ',')} °C`, kind: m.temp >= 37 ? 'alert' : 'value' });
  if (m.sugar !== undefined) items.push({ key: 'sugar', text: `сахар ${String(m.sugar).replace('.', ',')}`, kind: 'value' });
  if (m.spo2 !== undefined) items.push({ key: 'spo2', text: `SpO₂ ${m.spo2}%`, kind: 'value' });
  for (const t of parsed.triggers) items.push({ key: `t-${t}`, text: `после: ${TRIGGER_LABELS[t] ?? t}`, kind: 'trigger' });
  for (const med of parsed.medications) {
    const effect = parsed.medEffect === 'helped' ? ', помогло' : parsed.medEffect === 'not_helped' ? ', не помогло' : '';
    items.push({ key: `m-${med}`, text: `${med}${effect}`, kind: 'med' });
  }
  if (parsed.duration) items.push({ key: 'dur', text: parsed.duration, kind: 'plain' });
  if (showTime && parsed.symptoms.length && parsed.timeOfDaySource === 'text') {
    items.push({ key: 'tod', text: TOD_LABEL[parsed.timeOfDay], kind: 'plain' });
  }

  if (!items.length) return null;
  return (
    <ul className="chips" aria-label="Распознано">
      {items.map((i) => (
        <li key={i.key} className={`chip chip--${i.kind}`}>
          {i.text}
        </li>
      ))}
    </ul>
  );
}
