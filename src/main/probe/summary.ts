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

/** Ниже этой доли размеченных переменных правило ничего не покрывает. */
const MIN_LAYER_COVERAGE = 0.05;

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
      // Ноль нарушений при нуле примитивных переменных — не здоровье
      // системы, а пустота: нарушать было нечего.
      if (d.variablesByLayer.primitives === 0) {
        return {
          status: 'not-applicable',
          reason: 'Ни одна переменная не попала в слой примитивов — нарушать нечего',
        };
      }
      // Правило звучит как «привязался к примитиву ВМЕСТО семантики».
      // Если семантического слоя нет, у нарушения нет альтернативы, и
      // правило теряет смысл независимо от числа примитивов.
      if (d.variablesByLayer.semantic === 0) {
        return {
          status: 'not-applicable',
          reason:
            'Нет ни одной семантической переменной — правилу не на что указывать как на верную альтернативу',
        };
      }
      // Разметка на уровне единиц переменных из сотен ничего не покрывает.
      const layered =
        d.variablesByLayer.primitives + d.variablesByLayer.semantic + d.variablesByLayer.component;
      const total = layered + d.variablesByLayer.unmapped;
      if (total > 0 && layered / total < MIN_LAYER_COVERAGE) {
        return {
          status: 'not-applicable',
          reason: `Размечено ${layered} переменных из ${total} — правило покроет ничтожную долю системы`,
        };
      }
      if (d.nodesInComponentMaster === 0) {
        return {
          status: 'not-applicable',
          reason: 'Нет нод внутри определений компонентов — проверять негде',
        };
      }
      return hits === 0
        ? {
            status: 'empty',
            note: `${d.nodesInComponentMaster.toLocaleString('ru')} нод в мастерах, ${d.variablesByLayer.primitives} примитивных переменных — прямых биндингов на примитивы нет`,
          }
        : measured();
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

/**
 * Текст про слои называет конкретные коллекции, а не «намёк есть».
 *
 * «В именах есть намёк на слои» — бесполезная формулировка: она не говорит,
 * какие именно коллекции легли на слои, и её нельзя проверить глазами.
 */
function layerNote(d: Diagnostics, layersOk: boolean): string {
  const v = d.variablesByLayer;
  const layered = v.primitives + v.semantic + v.component;
  const total = layered + v.unmapped;

  if (!layersOk) {
    return layersReadable(d.collectionNames)
      ? 'Ни одна коллекция не легла на слои, хотя в именах есть похожие на слоевые. Проверьте разметку TOKEN_LAYERS: сопоставление идёт по точному имени.'
      : 'Ни одно имя коллекции не читается как слой ДС. Правило layer-violation потребует ручной разметки на каждом файле — либо неприменимо к этой системе вовсе.';
  }

  const mapped = [...new Set(d.layeredCollectionNames)].join(', ');
  const head = `На слои легли коллекции: ${mapped}. Размечено ${layered} переменных из ${total} — примитивы ${v.primitives}, семантика ${v.semantic}, компонентные ${v.component}.`;

  if (total > 0 && layered / total < MIN_LAYER_COVERAGE) {
    return `${head} Это доли процента системы: правило будет проверять почти ничего.`;
  }
  return head;
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
  // Ключевой признак — легли ли коллекции на слои ФАКТИЧЕСКИ. Догадка по
  // именам осталась только подсказкой: она давала «намёк на слои есть» там,
  // где не размечено ничего, и отчёт печатал пустой список коллекций.
  const layersOk = d.layeredCollectionNames.length > 0;
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
    layerNote: layerNote(d, layersOk),
    toJudge,
  };
}
