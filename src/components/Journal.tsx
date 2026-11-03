import { useEffect, useMemo, useRef, useState } from 'react';
import { TOD_ADVERB, dayKey, fmtDayHeading, fmtTime, fromDayKey, toLocalInput } from '../lib/dates';
import { prepare, type TimedEntry } from '../lib/summary';
import type { Entry } from '../lib/types';
import { EntryChips } from './EntryChips';
import { CloseIcon } from './Icons';

interface Props {
  entries: Entry[];
  onUpdate: (id: string, patch: Partial<Pick<Entry, 'text' | 'at'>>) => void;
  onDelete: (id: string) => void;
}

export function Journal({ entries, onUpdate, onDelete }: Props) {
  const [editing, setEditing] = useState<Entry | null>(null);

  const days = useMemo(() => {
    const groups = new Map<string, TimedEntry[]>();
    for (const t of prepare(entries).reverse()) {
      const k = dayKey(t.when);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(t);
    }
    return [...groups.entries()];
  }, [entries]);

  if (!entries.length) {
    return (
      <section className="journal journal--empty">
        <p>
          Здесь появятся ваши записи. Записывайте всё, что беспокоит, сразу, как заметили: когда началось, после чего, что помогло.
          Перед приёмом откройте «Сводку» — там всё будет собрано для врача.
        </p>
      </section>
    );
  }

  return (
    <section className="journal" aria-label="Записи">
      {days.map(([k, list]) => (
        <div className="day" key={k}>
          <h3 className="day__title">{fmtDayHeading(fromDayKey(k))}</h3>
          <ol className="day__list">
            {list.map((t) => (
              <li key={t.entry.id}>
                <button className="entry" onClick={() => setEditing(t.entry)}>
                  <span className="entry__time">{t.approxTime ? TOD_ADVERB[t.parsed.timeOfDay] : fmtTime(t.when)}</span>
                  <span className="entry__body">
                    <span className="entry__text">{t.entry.text}</span>
                    <EntryChips parsed={t.parsed} />
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      ))}
      {editing && (
        <EditSheet
          entry={editing}
          onClose={() => setEditing(null)}
          onSave={(patch) => {
            onUpdate(editing.id, patch);
            setEditing(null);
          }}
          onDelete={() => {
            onDelete(editing.id);
            setEditing(null);
          }}
        />
      )}
    </section>
  );
}

function EditSheet({
  entry,
  onClose,
  onSave,
  onDelete,
}: {
  entry: Entry;
  onClose: () => void;
  onSave: (patch: Partial<Pick<Entry, 'text' | 'at'>>) => void;
  onDelete: () => void;
}) {
  const [text, setText] = useState(entry.text);
  const [when, setWhen] = useState(toLocalInput(new Date(entry.at)));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialogRef.current;
    if (d && !d.open) d.showModal?.();
    return () => d?.close?.();
  }, []);

  return (
    <dialog ref={dialogRef} className="sheet-dialog" onClose={onClose} onCancel={onClose} aria-labelledby="edit-title">
      <div className="sheet-dialog__head">
        <h2 id="edit-title">Запись</h2>
        <button className="icon-btn" onClick={onClose} aria-label="Закрыть">
          <CloseIcon />
        </button>
      </div>
      <label htmlFor="edit-text" className="field-label">
        Текст
      </label>
      <textarea id="edit-text" className="recorder__text" rows={4} value={text} onChange={(e) => setText(e.target.value)} />
      <label htmlFor="edit-when" className="field-label">
        Когда
      </label>
      <input id="edit-when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
      <div className="recorder__actions">
        <button
          className="btn btn--primary"
          disabled={!text.trim() || !when}
          onClick={() => onSave({ text: text.trim(), at: new Date(when).toISOString() })}
        >
          Сохранить изменения
        </button>
        {confirmDelete ? (
          <button className="btn btn--danger" onClick={onDelete}>
            Да, удалить запись
          </button>
        ) : (
          <button className="btn btn--quiet" onClick={() => setConfirmDelete(true)}>
            Удалить
          </button>
        )}
      </div>
    </dialog>
  );
}
