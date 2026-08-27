/**
 * Сборка снимка и подготовка тренда.
 *
 * Тренд считается **внутри одного охвата**. Сравнивать скан страницы со
 * сканом всего файла бессмысленно: получится скачок в разы, который
 * читается как обвал покрытия, хотя изменился только охват.
 */
import type { Adoption } from '../../shared/adoption';
import type { Snapshot, Trend } from '../../shared/snapshot';

export function buildSnapshot(input: {
  at: Date;
  scope: string;
  nodes: number;
  adoption: Adoption;
}): Snapshot {
  const { adoption } = input;
  const onTokens = adoption.nodesOnLibraryVariable + adoption.nodesOnLocalVariable;

  return {
    v: 1,
    at: input.at.toISOString(),
    scope: input.scope,
    nodes: input.nodes,
    instances: adoption.instancesCounted,
    fromLibrary: adoption.fromLibrary,
    local: adoption.local,
    unknown: adoption.unknown,
    fills: onTokens + adoption.nodesWithoutVariable,
    onTokens,
    masters: adoption.mastersTotal,
  };
}

/** Один снимок на день на охват: последний за день вытесняет предыдущий. */
function sameDayAndScope(a: Snapshot, b: Snapshot): boolean {
  return a.scope === b.scope && a.at.slice(0, 10) === b.at.slice(0, 10);
}

/**
 * Добавляет снимок в историю.
 *
 * Ротация обязательна: pluginData ограничен, а история копится неделями.
 * Держим последние `limit` снимков — этого хватает на тренд и не грозит
 * молчаливой потерей данных при переполнении.
 */
export function appendSnapshot(
  history: readonly Snapshot[],
  next: Snapshot,
  limit: number,
): readonly Snapshot[] {
  const withoutToday = history.filter((item) => !sameDayAndScope(item, next));
  const sorted = [...withoutToday, next].sort((a, b) => a.at.localeCompare(b.at));
  return sorted.slice(-limit);
}

/** Тренд по текущему охвату: точки по порядку и с чем сравнивать. */
export function buildTrend(history: readonly Snapshot[], scope: string): Trend {
  const points = history.filter((item) => item.scope === scope);
  return { points, previous: points.length >= 2 ? (points[points.length - 2] ?? null) : null };
}
