import { daysInclusive, fmtDayMonth, fromDayKey, plural, P_DAYS } from '../lib/dates';
import type { Settings } from '../lib/types';

interface Props {
  settings: Settings;
  onOpenSummary: () => void;
  onOpenSettings: () => void;
  onVisitDone: () => void;
}

/** Строка под заголовком: когда приём и что делать дальше. */
export function VisitBanner({ settings, onOpenSummary, onOpenSettings, onVisitDone }: Props) {
  if (!settings.nextVisit) {
    return (
      <button className="visit visit--empty" onClick={onOpenSettings}>
        Указать дату приёма
      </button>
    );
  }

  const visit = fromDayKey(settings.nextVisit);
  const left = daysInclusive(new Date(), visit) - 1;

  if (left < 0) {
    return (
      <div className="visit">
        <span>Приём {fmtDayMonth(visit)} прошёл?</span>
        <button className="link" onClick={onVisitDone}>
          Начать новый период
        </button>
      </div>
    );
  }

  const when = left === 0 ? 'сегодня' : left === 1 ? 'завтра' : `через ${left} ${plural(left, P_DAYS)}`;
  return (
    <div className={`visit${left <= 1 ? ' visit--soon' : ''}`}>
      <span>
        Приём {fmtDayMonth(visit)}, {when}
      </span>
      {left <= 2 && (
        <button className="link" onClick={onOpenSummary}>
          Открыть сводку
        </button>
      )}
    </div>
  );
}
