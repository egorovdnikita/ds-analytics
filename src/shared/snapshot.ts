/**
 * Снимок состояния файла во времени.
 *
 * Формат версионированный: набор метрик будет меняться, а история должна
 * пережить это, а не обнулиться при первом же изменении.
 *
 * Поля короткие намеренно — снимки живут в pluginData, у которого жёсткий
 * лимит, и длинные имена ключей съедают его быстрее самих данных.
 */

export interface Snapshot {
  /** Версия формата. Снимки чужой версии не читаются, а отбрасываются. */
  readonly v: 1;
  /** ISO-дата. По ней же снимки схлопываются: один на день на охват. */
  readonly at: string;
  readonly scope: string;
  readonly nodes: number;
  readonly instances: number;
  readonly fromLibrary: number;
  readonly local: number;
  readonly unknown: number;
  /** Слоёв с заливкой всего и из них на токенах. */
  readonly fills: number;
  readonly onTokens: number;
  readonly masters: number;
}

export interface Trend {
  /** Снимки того же охвата, от старых к новым, включая текущий. */
  readonly points: readonly Snapshot[];
  /** Предыдущий снимок для сравнения. null — сравнивать не с чем. */
  readonly previous: Snapshot | null;
}

/** Разница в процентных пунктах. null, если сравнивать не с чем. */
export function deltaPoints(
  current: { part: number; total: number },
  previous: { part: number; total: number } | null,
): number | null {
  if (previous === null || current.total === 0 || previous.total === 0) return null;
  const now = (current.part / current.total) * 100;
  const before = (previous.part / previous.total) * 100;
  return Math.round(now - before);
}

/** «12 авг» — дата без года, потому что тренд короткий. */
export function shortDate(iso: string): string {
  const months = [
    'янв',
    'фев',
    'мар',
    'апр',
    'мая',
    'июн',
    'июл',
    'авг',
    'сен',
    'окт',
    'ноя',
    'дек',
  ];
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return `${date.getDate()} ${months[date.getMonth()] ?? ''}`;
}
