import { useEffect, useState } from 'react';
import { JournalIcon, SettingsIcon, SummaryIcon } from './components/Icons';
import { Journal } from './components/Journal';
import { Recorder } from './components/Recorder';
import { SettingsView } from './components/SettingsView';
import { SummaryView } from './components/SummaryView';
import { VisitBanner } from './components/VisitBanner';
import { requestPersistentStorage, useStore } from './lib/storage';

type Tab = 'diary' | 'summary' | 'settings';

const TITLES: Record<Tab, string> = { diary: 'Дневник', summary: 'Сводка', settings: 'Настройки' };

export default function App() {
  const store = useStore();
  const [tab, setTab] = useState<Tab>(() => (location.hash === '#summary' ? 'summary' : location.hash === '#settings' ? 'settings' : 'diary'));

  useEffect(() => {
    if (store.entries.length) requestPersistentStorage();
  }, [store.entries.length]);

  useEffect(() => {
    history.replaceState(null, '', tab === 'diary' ? location.pathname : `#${tab}`);
    window.scrollTo(0, 0);
    document.title = tab === 'diary' ? 'Дневник для врача' : `${TITLES[tab]} — Дневник для врача`;
  }, [tab]);

  return (
    <div className="app">
      <header className="topbar">
        <h1 className="topbar__title">{TITLES[tab]}</h1>
        {tab === 'diary' && (
          <VisitBanner
            settings={store.settings}
            onOpenSummary={() => setTab('summary')}
            onOpenSettings={() => setTab('settings')}
            onVisitDone={() => store.updateSettings({ lastVisit: store.settings.nextVisit, nextVisit: null })}
          />
        )}
      </header>

      <main className="content">
        {store.saveError && (
          <p className="notice notice--error">Не удалось сохранить: в браузере закончилось место или запрещено хранение данных. Сохраните резервную копию в «Настройках».</p>
        )}
        {tab === 'diary' && (
          <>
            <Recorder
              onSave={store.addEntry}
              privacyAcknowledged={store.settings.privacyAcknowledged}
              onAcknowledgePrivacy={() => store.updateSettings({ privacyAcknowledged: true })}
            />
            <Journal entries={store.entries} onUpdate={store.updateEntry} onDelete={store.deleteEntry} />
          </>
        )}
        {tab === 'summary' && <SummaryView entries={store.entries} settings={store.settings} />}
        {tab === 'settings' && <SettingsView store={store} />}
      </main>

      <nav className="tabbar" aria-label="Разделы">
        {(['diary', 'summary', 'settings'] as Tab[]).map((t) => (
          <button key={t} className="tabbar__item" aria-current={tab === t ? 'page' : undefined} onClick={() => setTab(t)}>
            {t === 'diary' ? <JournalIcon /> : t === 'summary' ? <SummaryIcon /> : <SettingsIcon />}
            <span>{TITLES[t]}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
