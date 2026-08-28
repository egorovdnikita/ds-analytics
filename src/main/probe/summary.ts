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
import { withCount } from '../../shared/plural';
import type {
  Diagnostics,
  FileProfile,
  ProbeRuleId,
  Place,
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
      note: 'Здесь живут сами компоненты и токены.',
    };
  }
  if (d.localComponents === 0 && d.instancesTotal > 0) {
    return {
      profile: 'consumer',
      note: 'Собран из копий библиотеки. Сами компоненты и токены лежат в другом файле.',
    };
  }
  if (d.instancesTotal === 0 && d.nodesWithAlias === 0) {
    return {
      profile: 'no-design-system',
      note: 'Ни копий из библиотеки, ни токенов.',
    };
  }
  return { profile: 'unclear', note: 'Не удалось определить.' };
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
        return { status: 'not-applicable', reason: 'в файле нет токенов' };
      }
      if (d.collectionNames.length === 0) {
        return { status: 'not-applicable', reason: 'не удалось прочитать коллекции токенов' };
      }
      if (!layersOk) {
        return {
          status: 'not-applicable',
          reason: 'коллекции токенов не разложены по уровням',
        };
      }
      if (d.localComponents === 0) {
        return {
          status: 'not-applicable',
          reason: 'в файле нет своих компонентов',
        };
      }
      // Ноль нарушений при нуле примитивных переменных — не здоровье
      // системы, а пустота: нарушать было нечего.
      if (d.variablesByLayer.primitives === 0) {
        return {
          status: 'not-applicable',
          reason: 'нет базовых токенов',
        };
      }
      // Правило звучит как «привязался к примитиву ВМЕСТО семантики».
      // Если семантического слоя нет, у нарушения нет альтернативы, и
      // правило теряет смысл независимо от числа примитивов.
      if (d.variablesByLayer.semantic === 0) {
        return {
          status: 'not-applicable',
          reason: 'нет смысловых токенов — не с чем сравнивать',
        };
      }
      // Разметка на уровне единиц переменных из сотен ничего не покрывает.
      const layered =
        d.variablesByLayer.primitives + d.variablesByLayer.semantic + d.variablesByLayer.component;
      const total = layered + d.variablesByLayer.unmapped;
      if (total > 0 && layered / total < MIN_LAYER_COVERAGE) {
        return {
          status: 'not-applicable',
          reason: `по уровням разложено ${withCount(layered, 'токен', 'токена', 'токенов')} из ${total} — слишком мало`,
        };
      }
      if (d.nodesInComponentMaster === 0) {
        return {
          status: 'not-applicable',
          reason: 'у компонентов нет содержимого',
        };
      }
      return hits === 0
        ? {
            status: 'empty',
            note: `проверили ${d.nodesInComponentMaster.toLocaleString('ru')} слоёв в компонентах — прямых привязок к базовым токенам нет`,
          }
        : measured();
    }

    case 'tokens/broken-alias': {
      if (d.nodesWithAlias === 0) {
        return { status: 'not-applicable', reason: 'в файле нет токенов' };
      }
      return hits === 0
        ? {
            status: 'empty',
            note: `все ${d.nodesWithAlias.toLocaleString('ru')} привязок на месте`,
          }
        : measured();
    }

    case 'components/detached-instance': {
      if (d.masterNames === 0) {
        return { status: 'not-applicable', reason: 'компонентов не найдено' };
      }
      return hits === 0 ? { status: 'empty', note: 'ничего не нашли' } : measured();
    }

    // Перечислены явно, а не через default: добавление правила должно
    // заставить принять решение о его применимости, а не молча провалиться
    // в «всегда применимо».
    case 'tokens/raw-fill':
    case 'structure/default-name':
      return hits === 0 ? { status: 'empty', note: 'ничего не нашли' } : measured();
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
      ? 'Названия коллекций похожи на уровни, но ни одна не совпала точно. Проверьте разметку.'
      : 'Коллекции токенов не разложены по уровням: базовые, смысловые, компонентные. Проверять «токен не того уровня» не на чем.';
  }

  const mapped = [...new Set(d.layeredCollectionNames)].join(', ');
  const head = `По уровням разложено ${withCount(layered, 'токен', 'токена', 'токенов')} из ${total}. Базовые ${v.primitives}, смысловые ${v.semantic}, компонентные ${v.component}. Коллекции: ${mapped}.`;

  if (total > 0 && layered / total < MIN_LAYER_COVERAGE) {
    return `${head} Это доли процента — проверять почти нечего.`;
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
  places: ReadonlyMap<ProbeRuleId, readonly Place[]>;
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
    places: input.places.get(rule) ?? [],
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
