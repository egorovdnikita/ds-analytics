/**
 * Аналитика прогона: что именно означает каждое число.
 *
 * Ключевая идея — различать три исхода, которые в голом списке счётчиков
 * выглядят одинаково:
 *
 *   измерено      правило отработало и нашло N
 *   пусто         правило отработало и не нашло ничего
 *   неприменимо   правило не могло отработать в принципе
 *
 * Третий случай в отчёте читается как «у меня всё хорошо», хотя означает
 * «инструмент здесь слеп». Именно на этом мы потеряли два прогона.
 */
import type {
  Diagnostics,
  FileProfile,
  ProbeRuleId,
  ProbeSummary,
  RuleOutcome,
  RuleSummary,
} from '../../shared/probe';

const LAYER_ROOTS = [
  'primitive',
  'palette',
  'core',
  'semantic',
  'theme',
  'token',
  'component',
  'alias',
];

function layersReadable(names: readonly string[]): boolean {
  return names.some((name) => LAYER_ROOTS.some((root) => name.toLowerCase().includes(root)));
}

function detectProfile(d: Diagnostics): { profile: FileProfile; note: string } {
  if (d.localComponents > 0 && d.localCollections > 0) {
    return {
      profile: 'library-source',
      note: 'Здесь живут мастера и переменные. Единственный профиль, на котором проверяются правила про слои токенов.',
    };
  }
  if (d.localComponents === 0 && d.instancesTotal > 0) {
    return {
      profile: 'consumer',
      note: 'Файл собран из библиотечных инстансов. Мастера и переменные живут в другом файле — правила про компоненты и слои здесь проверить нельзя.',
    };
  }
  if (d.instancesTotal === 0 && d.nodesWithAlias === 0) {
    return {
      profile: 'no-design-system',
      note: 'Ни инстансов, ни переменных. Профиль «помойка» из протокола: проверяет, не захлебнётся ли отчёт от объёма.',
    };
  }
  return { profile: 'unclear', note: 'Профиль не определился однозначно.' };
}

function outcomeFor(
  rule: ProbeRuleId,
  hits: number,
  sampled: number,
  d: Diagnostics,
  layersOk: boolean,
): RuleOutcome {
  const measured = (): RuleOutcome => ({ status: 'measured', hits, sampled });

  switch (rule) {
    case 'tokens/layer-violation': {
      if (d.nodesWithAlias === 0) {
        return { status: 'not-applicable', reason: 'В скоупе не используются переменные' };
      }
      if (d.collectionNames.length === 0) {
        return { status: 'not-applicable', reason: 'Коллекции переменных не разрезолвились' };
      }
      if (!layersOk) {
        return {
          status: 'not-applicable',
          reason: 'Ни одна коллекция не размечена как слой — размечать нечего',
        };
      }
      if (d.localComponents === 0) {
        return {
          status: 'not-applicable',
          reason: 'Нет локальных компонентов — правило проверяет мастера, а не инстансы',
        };
      }
      return hits === 0 ? { status: 'empty', note: 'Нарушений слоёв не найдено' } : measured();
    }

    case 'tokens/broken-alias': {
      if (d.nodesWithAlias === 0) {
        return { status: 'not-applicable', reason: 'В скоупе не используются переменные' };
      }
      return hits === 0
        ? { status: 'empty', note: `Все ${d.nodesWithAlias} биндингов разрезолвились` }
        : measured();
    }

    case 'components/detached-instance': {
      if (d.masterNames === 0) {
        return { status: 'not-applicable', reason: 'Мастеров компонентов не найдено' };
      }
      return hits === 0 ? { status: 'empty', note: 'Кандидатов не найдено' } : measured();
    }

    // Перечислены явно, а не через default: добавление правила должно
    // заставить принять решение о его применимости, а не молча провалиться
    // в «всегда применимо».
    case 'tokens/raw-fill':
    case 'structure/default-name':
      return hits === 0 ? { status: 'empty', note: 'Срабатываний нет' } : measured();
  }
}

export function buildSummary(input: {
  fileName: string;
  scope: string;
  nodesVisited: number;
  cancelled: boolean;
  diagnostics: Diagnostics;
  hits: ReadonlyMap<ProbeRuleId, number>;
  sampled: ReadonlyMap<ProbeRuleId, number>;
}): ProbeSummary {
  const { diagnostics: d } = input;
  const layersOk = layersReadable(d.collectionNames);
  const { profile, note } = detectProfile(d);

  const rules: RuleSummary[] = [...input.hits].map(([rule, hits]) => ({
    rule,
    outcome: outcomeFor(rule, hits, input.sampled.get(rule) ?? 0, d, layersOk),
  }));

  const toJudge = rules.reduce(
    (sum, { outcome }) => sum + (outcome.status === 'measured' ? outcome.sampled : 0),
    0,
  );

  return {
    fileName: input.fileName,
    scope: input.scope,
    nodesVisited: input.nodesVisited,
    cancelled: input.cancelled,
    profile,
    profileNote: note,
    rules,
    diagnostics: d,
    layersReadable: layersOk,
    layerNote: layersOk
      ? 'В именах коллекций есть намёк на слои — разметку TOKEN_LAYERS имеет смысл настроить под них.'
      : 'Имена коллекций не читаются как слои ДС. Правило layer-violation потребует ручной разметки на каждом файле — либо не применимо к этой системе вовсе.',
    toJudge,
  };
}
