import { useRef, useState } from 'react';
import { dayKey } from '../lib/dates';
import { makeBackup, mergeEntries, parseBackup, type Store } from '../lib/storage';

export function SettingsView({ store }: { store: Store }) {
  const { settings, updateSettings, entries } = store;
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const exportBackup = () => {
    const blob = new Blob([JSON.stringify(makeBackup(entries, settings), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `doctor-diary-${dayKey(new Date())}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage({ kind: 'ok', text: 'Файл копии сохранён в загрузки.' });
  };

  const importBackup = async (file: File) => {
    const res = parseBackup(await file.text());
    if (!res.ok) {
      setMessage({ kind: 'error', text: res.error });
      return;
    }
    const merged = mergeEntries(entries, res.backup.entries);
    const added = merged.length - entries.length;
    store.replaceAll(merged, {
      patientName: settings.patientName || res.backup.settings.patientName,
      lastVisit: settings.lastVisit ?? res.backup.settings.lastVisit,
      nextVisit: settings.nextVisit ?? res.backup.settings.nextVisit,
    });
    setMessage({ kind: 'ok', text: added ? `Добавлено записей: ${added}.` : 'Все записи из копии уже есть в дневнике.' });
  };

  return (
    <div className="settings">
      <section className="panel">
        <h2>Приём у врача</h2>
        <label className="field">
          <span className="field-label">Ближайший приём</span>
          <input type="date" value={settings.nextVisit ?? ''} onChange={(e) => updateSettings({ nextVisit: e.target.value || null })} />
        </label>
        <label className="field">
          <span className="field-label">Прошлый приём</span>
          <input type="date" value={settings.lastVisit ?? ''} max={dayKey(new Date())} onChange={(e) => updateSettings({ lastVisit: e.target.value || null })} />
          <span className="field-hint">Сводка по умолчанию собирается с этой даты.</span>
        </label>
        <label className="field">
          <span className="field-label">Имя в сводке</span>
          <input
            type="text"
            autoComplete="name"
            placeholder="Например: Иванов Иван Иванович"
            value={settings.patientName}
            onChange={(e) => updateSettings({ patientName: e.target.value })}
          />
          <span className="field-hint">Необязательно. Видно только в сводке, которую вы сами отправите.</span>
        </label>
      </section>

      <section className="panel">
        <h2>Резервная копия</h2>
        <p>Записи хранятся только в этом браузере. Если удалить приложение или очистить данные сайта, они пропадут — время от времени сохраняйте копию.</p>
        <div className="recorder__actions">
          <button className="btn btn--ghost" onClick={exportBackup} disabled={!entries.length}>
            Сохранить копию
          </button>
          <button className="btn btn--ghost" onClick={() => fileRef.current?.click()}>
            Загрузить копию
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importBackup(f);
              e.target.value = '';
            }}
          />
        </div>
        {message && <p className={`notice${message.kind === 'error' ? ' notice--error' : ''}`}>{message.text}</p>}
      </section>

      <section className="panel">
        <h2>Конфиденциальность</h2>
        <p>
          Сервера у приложения нет: записи, даты приёмов и имя хранятся только на этом устройстве и никуда не отправляются. Наружу сводка
          уходит, только когда вы сами нажимаете «Отправить».
        </p>
        <p>
          Голосовой ввод выполняет браузер. В Chrome звук распознают серверы Google, в Safari — устройство или серверы Apple. Если это не
          подходит, пишите текстом.
        </p>
        <p>Приложение ничего не диагностирует и не заменяет врача. При резком ухудшении самочувствия звоните 103 или 112.</p>
      </section>

      <section className="panel panel--danger">
        <h2>Удалить все данные</h2>
        <p>Удалит {entries.length} записей и настройки с этого устройства. Отменить будет нельзя.</p>
        {confirmClear ? (
          <div className="recorder__actions">
            <button
              className="btn btn--danger"
              onClick={() => {
                store.clearAll();
                setConfirmClear(false);
                setMessage(null);
              }}
            >
              Да, удалить всё
            </button>
            <button className="btn btn--quiet" onClick={() => setConfirmClear(false)}>
              Отменить
            </button>
          </div>
        ) : (
          <button className="btn btn--quiet btn--danger-text" onClick={() => setConfirmClear(true)} disabled={!entries.length}>
            Удалить все записи
          </button>
        )}
      </section>

      <p className="version">Дневник для врача, версия {__APP_VERSION__}</p>
    </div>
  );
}
