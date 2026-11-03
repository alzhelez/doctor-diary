import { useMemo, useState } from 'react';
import { P_DAYS, P_ENTRIES, P_TIMES, fmtDayMonth, fromDayKey, plural, weekdayShort } from '../lib/dates';
import { isBpAbnormal } from '../lib/parser';
import {
  buildSummary,
  describeBp,
  describeCounted,
  describeIntensity,
  describeMed,
  describeNum,
  describeTimeOfDay,
  fmtWhen,
  rangeFor,
  summaryToText,
  type SymptomStat,
} from '../lib/summary';
import type { Entry, Settings } from '../lib/types';
import { CopyIcon, PrintIcon, ShareIcon } from './Icons';

type RangeKind = 'since_visit' | 7 | 14 | 30;

interface Props {
  entries: Entry[];
  settings: Settings;
}

export function SummaryView({ entries, settings }: Props) {
  const [kind, setKind] = useState<RangeKind>('since_visit');
  const [toast, setToast] = useState<string | null>(null);

  const summary = useMemo(() => buildSummary(entries, rangeFor(kind, settings, entries)), [entries, settings, kind]);
  const text = useMemo(() => summaryToText(summary, settings), [summary, settings]);

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2500);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      flash('Сводка скопирована');
    } catch {
      flash('Не удалось скопировать. Выделите текст вручную в разделе «Записи по дням».');
    }
  };

  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Сводка для врача', text });
        return;
      } catch (e) {
        if ((e as DOMException)?.name === 'AbortError') return;
      }
    }
    await copy();
  };

  const firstLabel = settings.lastVisit ? 'С прошлого приёма' : 'Все записи';
  const options: { value: RangeKind; label: string }[] = [
    { value: 'since_visit', label: firstLabel },
    { value: 7, label: '7 дней' },
    { value: 14, label: '14 дней' },
    { value: 30, label: '30 дней' },
  ];

  const s = summary;
  const hasMeasures = s.bp || s.pulse || s.temp || s.sugar || s.spo2;
  const notes = s.timeline.filter((t) => !t.parsed.question);

  return (
    <div className="summary">
      <div className="segmented" role="radiogroup" aria-label="Период сводки">
        {options.map((o) => (
          <button key={o.label} role="radio" aria-checked={kind === o.value} className="segmented__item" onClick={() => setKind(o.value)}>
            {o.label}
          </button>
        ))}
      </div>

      <article className="sheet" aria-labelledby="sheet-title">
        <header className="sheet__head">
          <h2 id="sheet-title">Сводка для врача</h2>
          {settings.patientName.trim() && <p className="sheet__patient">{settings.patientName.trim()}</p>}
          <p className="sheet__period">
            {fmtDayMonth(s.range.from)} — {fmtDayMonth(s.range.to)} {s.range.to.getFullYear()}, {s.days} {plural(s.days, P_DAYS)}
          </p>
          <p className="sheet__meta">
            {s.entryCount} {plural(s.entryCount, P_ENTRIES)}, жалобы в {s.complaintDays} {plural(s.complaintDays, P_DAYS)} из {s.days}
          </p>
        </header>

        {!s.entryCount && <p className="sheet__empty">За этот период записей нет. Выберите период подлиннее или добавьте запись в «Дневнике».</p>}

        {s.symptoms.length > 0 && (
          <section className="sheet__section">
            <h3>Жалобы</h3>
            <ul className="symptoms">
              {s.symptoms.map((sym) => (
                <SymptomRow key={sym.id} sym={sym} dayKeys={s.dayKeys} />
              ))}
            </ul>
          </section>
        )}

        {hasMeasures && (
          <section className="sheet__section">
            <h3>Замеры</h3>
            <dl className="measures">
              {s.bp && (
                <div>
                  <dt>Давление</dt>
                  <dd>
                    {describeBp(s.bp)}
                    <ul className="readings">
                      {s.bp.readings.map((r, i) => (
                        <li key={i} className={isBpAbnormal(r.sys, r.dia) ? 'is-high' : undefined}>
                          <span>{fmtWhen({ when: r.when })}</span>
                          <b>
                            {r.sys}/{r.dia}
                          </b>
                        </li>
                      ))}
                    </ul>
                  </dd>
                </div>
              )}
              {s.pulse && (
                <div>
                  <dt>Пульс</dt>
                  <dd>{describeNum(s.pulse, ' уд/мин')}</dd>
                </div>
              )}
              {s.temp && (
                <div>
                  <dt>Температура</dt>
                  <dd>{describeNum(s.temp, ' °C', 1)}</dd>
                </div>
              )}
              {s.sugar && (
                <div>
                  <dt>Сахар крови</dt>
                  <dd>{describeNum(s.sugar, ' ммоль/л', 1)}</dd>
                </div>
              )}
              {s.spo2 && (
                <div>
                  <dt>Сатурация</dt>
                  <dd>{describeNum(s.spo2, '%')}</dd>
                </div>
              )}
            </dl>
          </section>
        )}

        {s.medications.length > 0 && (
          <section className="sheet__section">
            <h3>Лекарства</h3>
            <ul className="plain-list">
              {s.medications.map((m) => (
                <li key={m.name}>
                  {describeMed(m)}
                  {m.forSymptoms.length > 0 && <span className="muted">; при: {m.forSymptoms.join(', ')}</span>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {s.questions.length > 0 && (
          <section className="sheet__section">
            <h3>Вопросы к врачу</h3>
            <ul className="plain-list questions">
              {s.questions.map((q, i) => (
                <li key={i}>{q.text}</li>
              ))}
            </ul>
          </section>
        )}

        {notes.length > 0 && (
          <details className="sheet__section timeline">
            <summary>
              <h3>Записи по дням</h3>
              <span className="muted">
                {notes.length} {plural(notes.length, P_ENTRIES)}
                {s.unrecognized.length > 0 && `, из них без распознанных жалоб: ${s.unrecognized.length}`}
              </span>
            </summary>
            <ol>
              {notes.map((t) => (
                <li key={t.entry.id}>
                  <span className="timeline__when">{fmtWhen({ when: t.when, approxTime: t.approxTime, tod: t.parsed.timeOfDay })}</span>
                  <span>{t.entry.text}</span>
                </li>
              ))}
            </ol>
          </details>
        )}

        <footer className="sheet__foot">Составлено пациентом в приложении «Дневник для врача» по личным записям. Не является медицинским заключением.</footer>
      </article>

      <div className="summary__actions">
        <button className="btn btn--primary" onClick={share} disabled={!s.entryCount}>
          <ShareIcon size={20} /> Отправить
        </button>
        <button className="btn btn--ghost" onClick={copy} disabled={!s.entryCount}>
          <CopyIcon size={20} /> Копировать
        </button>
        <button
          className="btn btn--ghost"
          onClick={() => {
            document.querySelector<HTMLDetailsElement>('.timeline')?.setAttribute('open', '');
            window.print();
          }}
          disabled={!s.entryCount}
        >
          <PrintIcon size={20} /> PDF
        </button>
      </div>
      {toast && (
        <p className="toast" role="status">
          {toast}
        </p>
      )}
    </div>
  );
}

/** Одна жалоба: название, частота и полоска дней периода — врач видит ритм с одного взгляда. */
function SymptomRow({ sym, dayKeys }: { sym: SymptomStat; dayKeys: string[] }) {
  const set = new Set(sym.dayKeys);
  const tod = describeTimeOfDay(sym);
  const intensity = describeIntensity(sym);
  const showStrip = dayKeys.length <= 62;
  const labelEvery = dayKeys.length <= 14;

  return (
    <li className="symptom">
      <div className="symptom__head">
        <span className="symptom__name">{sym.label}</span>
        <span className="symptom__count">
          {sym.count} {plural(sym.count, P_TIMES)}
        </span>
      </div>
      {showStrip && (
        <div
          className={`strip${labelEvery ? ' strip--labelled' : ''}`}
          style={{ gridTemplateColumns: `repeat(${dayKeys.length}, minmax(0, 1fr))` }}
          role="img"
          aria-label={`Дни с жалобой: ${sym.dayKeys.length} из ${dayKeys.length}`}
        >
          {dayKeys.map((k, i) => {
            const d = fromDayKey(k);
            const showLabel = labelEvery || i === 0 || i === dayKeys.length - 1;
            return (
              <span key={k} className="strip__day">
                <span className={`strip__cell${set.has(k) ? ' is-on' : ''}`} title={`${fmtDayMonth(d)}${set.has(k) ? ': было' : ''}`} />
                {showLabel && (
                  <span className={`strip__label${d.getDay() === 0 || d.getDay() === 6 ? ' is-weekend' : ''}`}>
                    {labelEvery ? (
                      <>
                        {d.getDate()}
                        <small>{weekdayShort(d)}</small>
                      </>
                    ) : (
                      d.getDate()
                    )}
                  </span>
                )}
              </span>
            );
          })}
        </div>
      )}
      <p className="symptom__facts">
        {sym.dayKeys.length} {plural(sym.dayKeys.length, P_DAYS)} из {dayKeys.length}
        {tod && `, ${tod}`}
        {intensity && `, ${intensity}`}
        {sym.durations.length > 0 && `, длительность: ${[...new Set(sym.durations)].join(', ')}`}
      </p>
      {sym.triggers.length > 0 && <p className="symptom__line">Связывает с: {describeCounted(sym.triggers)}</p>}
      {sym.meds.length > 0 && <p className="symptom__line">Лекарства: {sym.meds.map(describeMed).join('; ')}</p>}
    </li>
  );
}
