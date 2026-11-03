import { useCallback, useEffect, useRef, useState } from 'react';

/*
 * Голосовой ввод через Web Speech API (SpeechRecognition).
 * Chrome на Android и Safari на iOS (14.5+) его поддерживают; Firefox и
 * встроенные браузеры мессенджеров — обычно нет. Тогда остаётся микрофон
 * на клавиатуре телефона — он работает в любом текстовом поле.
 *
 * Важно: в Chrome распознавание выполняется на серверах Google, в Safari —
 * на устройстве или на серверах Apple. Сам текст записи хранится только на телефоне.
 */

interface SRAlternative {
  transcript: string;
}
interface SRResult {
  isFinal: boolean;
  0: SRAlternative;
  length: number;
}
interface SREvent {
  resultIndex: number;
  results: { length: number; [i: number]: SRResult };
}
interface SRErrorEvent {
  error: string;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: SREvent) => void) | null;
  onerror: ((e: SRErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
type SRConstructor = new () => SpeechRecognitionLike;

function getRecognition(): SRConstructor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: SRConstructor; webkitSpeechRecognition?: SRConstructor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const speechSupported = (): boolean => getRecognition() !== null;

const ERRORS: Record<string, string> = {
  'not-allowed': 'Нет доступа к микрофону. Разрешите его для этого сайта в настройках браузера.',
  'service-not-allowed': 'Браузер не разрешает распознавание речи. Можно надиктовать через микрофон на клавиатуре.',
  'no-speech': 'Ничего не услышал. Нажмите на микрофон и говорите чуть громче.',
  'audio-capture': 'Не удалось включить микрофон. Проверьте, не занят ли он другим приложением.',
  network: 'Распознаванию нужен интернет. Без связи можно надиктовать через микрофон на клавиатуре.',
  'language-not-supported': 'Браузер не умеет распознавать русскую речь. Попробуйте микрофон на клавиатуре.',
};

/** Склеивает фрагменты так, чтобы не было двойных пробелов. */
function join(a: string, b: string): string {
  if (!a) return b.trim();
  if (!b.trim()) return a;
  return `${a.trimEnd()} ${b.trim()}`;
}

export function useSpeech() {
  const [listening, setListening] = useState(false);
  const [finalText, setFinalText] = useState('');
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  /** Текст, накопленный до текущего сеанса распознавания (для «досказать»). */
  const baseRef = useRef('');
  const interimRef = useRef('');

  const stop = useCallback(() => {
    recRef.current?.stop();
  }, []);

  const start = useCallback((prefix = '') => {
    const SR = getRecognition();
    if (!SR) {
      setError('Этот браузер не умеет распознавать речь. Нажмите «Написать текстом» и используйте микрофон на клавиатуре.');
      return;
    }
    recRef.current?.abort();
    baseRef.current = prefix;
    interimRef.current = '';
    setFinalText(prefix);
    setInterim('');
    setError(null);

    const rec = new SR();
    rec.lang = 'ru-RU';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onresult = (e) => {
      let fin = '';
      let tmp = '';
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) fin = join(fin, r[0].transcript);
        else tmp = join(tmp, r[0].transcript);
      }
      setFinalText(join(baseRef.current, fin));
      interimRef.current = tmp;
      setInterim(tmp);
    };
    rec.onerror = (e) => {
      if (e.error === 'aborted') return;
      setError(ERRORS[e.error] ?? `Распознавание остановилось (${e.error}). Попробуйте ещё раз.`);
    };
    rec.onend = () => {
      // Незавершённый фрагмент не выбрасываем — лучше сохранить, чем потерять.
      const tail = interimRef.current;
      interimRef.current = '';
      if (tail) setFinalText((f) => join(f, tail));
      setInterim('');
      setListening(false);
      recRef.current = null;
    };

    try {
      rec.start();
      recRef.current = rec;
      setListening(true);
    } catch {
      setError('Не удалось запустить распознавание. Попробуйте ещё раз.');
    }
  }, []);

  const reset = useCallback(() => {
    recRef.current?.abort();
    setFinalText('');
    setInterim('');
    setError(null);
  }, []);

  useEffect(() => () => recRef.current?.abort(), []);

  return { listening, finalText, interim, error, start, stop, reset, setFinalText, supported: speechSupported() };
}
