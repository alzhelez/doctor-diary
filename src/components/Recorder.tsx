import { useEffect, useMemo, useRef, useState } from 'react';
import { fmtTime, toLocalInput } from '../lib/dates';
import { parseEntry } from '../lib/parser';
import { useSpeech } from '../lib/speech';
import type { Entry } from '../lib/types';
import { EntryChips } from './EntryChips';
import { KeyboardIcon, MicIcon, StopIcon } from './Icons';

type Mode = 'idle' | 'consent' | 'listening' | 'review';

interface Props {
  onSave: (text: string, at: Date, source: Entry['source']) => void;
  privacyAcknowledged: boolean;
  onAcknowledgePrivacy: () => void;
}

const EXAMPLES = ['опять болит голова с утра', 'после кофе давление 150 на 95', 'выпил нурофен, через час отпустило', 'вопрос врачу: можно ли мне бегать'];

export function Recorder({ onSave, privacyAcknowledged, onAcknowledgePrivacy }: Props) {
  const speech = useSpeech();
  const [mode, setMode] = useState<Mode>('idle');
  const [draft, setDraft] = useState('');
  const [source, setSource] = useState<Entry['source']>('voice');
  const [customTime, setCustomTime] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState<string | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [example] = useState(() => EXAMPLES[Math.floor(Math.random() * EXAMPLES.length)]);

  // Распознавание закончилось — переходим к проверке текста.
  useEffect(() => {
    if (mode === 'listening' && !speech.listening) {
      const text = speech.finalText.trim();
      if (text) {
        setDraft(text);
        setMode('review');
      } else {
        setMode(draft ? 'review' : 'idle');
      }
    }
  }, [speech.listening, speech.finalText, mode, draft]);

  const at = customTime ? new Date(customTime) : new Date();
  const parsed = useMemo(() => parseEntry(draft, at), [draft, customTime]); // eslint-disable-line react-hooks/exhaustive-deps

  const beginVoice = (prefix = '') => {
    if (!privacyAcknowledged && speech.supported) {
      setMode('consent');
      return;
    }
    setSource('voice');
    setMode('listening');
    speech.start(prefix);
  };

  const beginTyping = () => {
    setSource('text');
    setMode('review');
    requestAnimationFrame(() => textRef.current?.focus());
  };

  const cancel = () => {
    speech.reset();
    setDraft('');
    setCustomTime(null);
    setMode('idle');
  };

  const save = () => {
    const text = draft.trim();
    if (!text) return;
    const when = customTime ? new Date(customTime) : new Date();
    onSave(text, when, source);
    speech.reset();
    setDraft('');
    setCustomTime(null);
    setMode('idle');
    setSavedFlash(`Записано в ${fmtTime(when)}`);
    window.setTimeout(() => setSavedFlash(null), 2500);
  };

  if (mode === 'consent') {
    return (
      <section className="recorder recorder--consent" aria-labelledby="consent-title">
        <h2 id="consent-title" className="recorder__title">Перед первой записью</h2>
        <p>
          Записи хранятся только на этом телефоне. Но распознаёт речь сам браузер: в Chrome звук обрабатывают серверы Google, в
          Safari — устройство или серверы Apple.
        </p>
        <p>Если это не подходит, нажмите «Написать текстом» — микрофон на клавиатуре тоже подойдёт.</p>
        <div className="recorder__actions">
          <button
            className="btn btn--primary"
            onClick={() => {
              onAcknowledgePrivacy();
              setSource('voice');
              setMode('listening');
              speech.start();
            }}
          >
            Понятно, включить микрофон
          </button>
          <button className="btn btn--ghost" onClick={beginTyping}>
            Написать текстом
          </button>
        </div>
      </section>
    );
  }

  if (mode === 'listening') {
    return (
      <section className="recorder recorder--listening" aria-live="polite">
        <p className="recorder__live">
          {speech.finalText || speech.interim ? (
            <>
              <span>{speech.finalText}</span> <span className="recorder__interim">{speech.interim}</span>
            </>
          ) : (
            <span className="recorder__placeholder">Говорите, я записываю…</span>
          )}
        </p>
        <button className="mic mic--on" onClick={speech.stop} aria-label="Закончить запись">
          <span className="mic__ring" aria-hidden />
          <StopIcon size={30} />
        </button>
        <p className="recorder__hint">Нажмите, когда закончите</p>
      </section>
    );
  }

  if (mode === 'review') {
    return (
      <section className="recorder recorder--review">
        <label className="visually-hidden" htmlFor="draft">
          Текст записи
        </label>
        <textarea
          id="draft"
          ref={textRef}
          className="recorder__text"
          value={draft}
          rows={3}
          placeholder="Что беспокоит? Например: болит голова с утра"
          onChange={(e) => setDraft(e.target.value)}
        />
        {speech.error && <p className="notice notice--error">{speech.error}</p>}
        {draft.trim() && <EntryChips parsed={parsed} />}
        <div className="recorder__when">
          {customTime === null ? (
            <>
              <span>Когда: сейчас</span>
              <button className="link" onClick={() => setCustomTime(toLocalInput(new Date()))}>
                изменить
              </button>
            </>
          ) : (
            <>
              <label htmlFor="when">Когда</label>
              <input id="when" type="datetime-local" value={customTime} max={toLocalInput(new Date())} onChange={(e) => setCustomTime(e.target.value || null)} />
            </>
          )}
        </div>
        <div className="recorder__actions">
          <button className="btn btn--primary" onClick={save} disabled={!draft.trim()}>
            Сохранить запись
          </button>
          {speech.supported && (
            <button className="btn btn--ghost" onClick={() => beginVoice(draft)} aria-label="Досказать голосом">
              <MicIcon size={20} /> Досказать
            </button>
          )}
          <button className="btn btn--quiet" onClick={cancel}>
            Отменить
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="recorder" aria-labelledby="rec-title">
      <h2 id="rec-title" className="recorder__title">
        Что беспокоит?
      </h2>
      <p className="recorder__example">Скажите своими словами, например: «{example}»</p>
      {speech.supported ? (
        <button className="mic" onClick={() => beginVoice()} aria-label="Начать запись голосом">
          <MicIcon size={34} />
        </button>
      ) : (
        <p className="notice">Этот браузер не распознаёт речь. Нажмите «Написать текстом» и диктуйте через микрофон на клавиатуре.</p>
      )}
      {speech.error && <p className="notice notice--error">{speech.error}</p>}
      {savedFlash && (
        <p className="recorder__saved" role="status">
          {savedFlash}
        </p>
      )}
      <button className="link recorder__type" onClick={beginTyping}>
        <KeyboardIcon size={18} /> Написать текстом
      </button>
    </section>
  );
}
