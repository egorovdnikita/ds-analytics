/**
 * Plugin sandbox entry. Здесь нет DOM и нет React.
 *
 * Отчёт adoption: насколько файл живёт на дизайн-системе. Правила и их
 * прогон сюда не входят — они ждут гейта валидации сигнала (блок A аудита).
 *
 * Никаких тяжёлых синхронных циклов в этом файле: обход дерева живёт
 * в scanner/traversal.ts.
 */
import type { MainMessage, UiMessage } from '../shared/messages';
import type { Place } from '../shared/adoption';
import type { ScanScope } from '../shared/types';
import { buildAdoption, type MasterRef } from './analysis/adoption';
import { VariableUsageIndex } from './analysis/usage';
import { appendSnapshot, buildSnapshot, buildTrend } from './analysis/snapshot';
import { loadConfig } from './storage/config';
import { HISTORY_LIMIT, loadHistory, saveHistory } from './storage/snapshots';
import { traverse, type ScanTarget } from './scanner/traversal';
import { VariableResolver } from './scanner/variables';

const UI_SIZE = { width: 480, height: 640 } as const;
const SCOPE_KEY = 'last-scope';

/** Сколько токенов показываем в impact-списке. Хвост никто не читает. */
const TOP_VARIABLES = 60;

/**
 * Охват прошлого запуска.
 *
 * clientStorage привязан к пользователю, а не к документу: настройка
 * личная и не должна попадать в файл команды.
 */
async function loadLastScope(): Promise<ScanScope | null> {
  try {
    const stored: unknown = await figma.clientStorage.getAsync(SCOPE_KEY);
    return stored === 'selection' || stored === 'page' || stored === 'file' ? stored : null;
  } catch {
    return null;
  }
}

/**
 * Стартовый охват.
 *
 * Личная привычка важнее командного дефолта: если человек в прошлый раз
 * сканировал весь файл, он и сейчас хочет весь файл. Конфиг команды
 * работает как значение по умолчанию для тех, кто ещё ничего не выбирал.
 */
async function startingScope(): Promise<ScanScope> {
  const personal = await loadLastScope();
  if (personal !== null) return personal;
  return loadConfig(figma.root).config.scope.default;
}

let cancelled = false;

function post(message: MainMessage): void {
  figma.ui.postMessage(message);
}

function targetFor(scope: ScanScope): ScanTarget {
  switch (scope) {
    case 'selection':
      return { kind: 'selection', nodes: figma.currentPage.selection, page: figma.currentPage };
    case 'page':
      return { kind: 'page', page: figma.currentPage };
    case 'file':
      return { kind: 'file', document: figma.root };
  }
}

const SCOPE_LABEL: Readonly<Record<ScanScope, string>> = {
  selection: 'выделение',
  page: 'страница',
  file: 'весь файл',
};

function isAlias(value: unknown): value is VariableAlias {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === 'VARIABLE_ALIAS' &&
    typeof (value as { id?: unknown }).id === 'string'
  );
}

/** Все привязки переменных на ноде — по всем свойствам, не только по заливке. */
function allAliases(node: SceneNode): readonly VariableAlias[] {
  if (!('boundVariables' in node)) return [];
  const bound: unknown = node.boundVariables;
  if (bound === undefined || bound === null) return [];

  const result: VariableAlias[] = [];
  for (const value of Object.values(bound as Record<string, unknown>)) {
    if (Array.isArray(value)) {
      for (const item of value) if (isAlias(item)) result.push(item);
    } else if (isAlias(value)) {
      result.push(value);
    }
  }
  return result;
}

/** Есть ли у ноды видимая заливка — кандидат на токенизацию. */
function hasVisibleFill(node: SceneNode): boolean {
  if (!('fills' in node)) return false;
  const fills: readonly Paint[] = Array.isArray(node.fills) ? (node.fills as readonly Paint[]) : [];
  return fills.some((paint) => paint.type === 'SOLID' && paint.visible !== false);
}

async function scan(scope: ScanScope): Promise<void> {
  cancelled = false;
  void figma.clientStorage.setAsync(SCOPE_KEY, scope).catch(() => {
    // Не сохранился охват — не повод мешать скану.
  });

  // Фаза 1 — локальный индекс переменных.
  const resolver = await VariableResolver.build(figma.variables);

  // Фаза 2 — обход дерева со сбором привязок и инстансов.
  const aliasIds = new Set<string>();
  const topLevelInstances: { node: InstanceNode; pageId: string }[] = [];
  const usage = new VariableUsageIndex();
  let withoutVariable = 0;

  const result = await traverse(
    targetFor(scope),
    (node, context) => {
      const aliases = allAliases(node);
      for (const alias of aliases) {
        aliasIds.add(alias.id);
        usage.add(alias.id, { nodeId: node.id, pageId: context.pageId, name: node.name });
      }
      if (aliases.length === 0 && !context.insideInstance && hasVisibleFill(node)) {
        withoutVariable++;
      }

      // Мастер резолвим только для инстансов верхнего уровня: вложенные
      // делят его с родителем, и тысячи лишних async-вызовов растянули бы
      // прогон на минуты.
      if (node.type === 'INSTANCE' && !context.insideInstance) {
        topLevelInstances.push({ node, pageId: context.pageId });
      }
    },
    {
      cancellation: () => cancelled,
      onProgress: (progress) => {
        post({ type: 'main/scan-progress', ...progress });
      },
    },
  );

  // Фаза 3 — догрузка библиотечных переменных и мастеров.
  await resolver.hydrate(aliasIds);

  const masterRefs: (MasterRef | null)[] = [];
  for (const { node, pageId } of topLevelInstances) {
    try {
      const master = await node.getMainComponentAsync();
      if (master === null) {
        masterRefs.push(null);
        continue;
      }
      const place: Place = { nodeId: node.id, pageId, name: node.name };
      masterRefs.push({ key: master.key, name: master.name, remote: master.remote, place });
    } catch {
      masterRefs.push(null);
    }
  }

  // Фаза 4 — покрытие по нодам. Локальность известна только после гидрации,
  // поэтому считается здесь, а не во время обхода.
  const { onLocal: onLocalVariable, onLibrary: onLibraryVariable } = usage.splitByLocality(
    (id: string) => resolver.isLocal(id),
  );

  // Обратный индекс: какие токены держат на себе файл и что сломается,
  // если их тронуть.
  const topVariables = usage.describe((id: string) => {
    const resolved = resolver.resolve(id);
    return resolved.state === 'unavailable'
      ? null
      : { name: resolved.name, collectionName: resolved.collectionName };
  }, TOP_VARIABLES);

  const adoption = await buildAdoption(
    {
      masterRefs,
      resolver,
      nodesOnLibraryVariable: onLibraryVariable,
      nodesOnLocalVariable: onLocalVariable,
      nodesWithoutVariable: withoutVariable,
      topVariables,
    },
    {
      // Обращение к figma.teamLibrary само бросает исключение, если в
      // манифесте нет разрешения. Оборачиваем в функцию, чтобы бросок
      // случился внутри перехвата, а не убил весь прогон.
      getAvailableLibraryVariableCollectionsAsync: () =>
        figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync(),
    },
  );

  const scopeLabel = SCOPE_LABEL[scope];

  // Снимок пишем только за полный обход: отменённый замер занизил бы
  // покрытие и оставил в истории ложную яму.
  let trend = buildTrend(loadHistory(figma.root), scopeLabel);
  if (!result.cancelled) {
    const snapshot = buildSnapshot({
      at: new Date(),
      scope: scopeLabel,
      nodes: result.nodesVisited,
      adoption,
    });
    const history = appendSnapshot(loadHistory(figma.root), snapshot, HISTORY_LIMIT);
    saveHistory(figma.root, history);
    trend = buildTrend(history, scopeLabel);
  }

  post({
    type: 'main/scan-finished',
    report: {
      fileName: figma.root.name,
      scope: scopeLabel,
      nodesVisited: result.nodesVisited,
      cancelled: result.cancelled,
      adoption,
      trend,
    },
  });
}

/**
 * Переход к слою: страница, выделение, зум.
 *
 * Всё через async-API: при documentAccess «dynamic-page» синхронный
 * getNodeById недоступен, а нужная страница может быть не загружена.
 */
async function reveal(nodeId: string, pageId: string): Promise<void> {
  try {
    const page = await figma.getNodeByIdAsync(pageId);
    if (page !== null && page.type === 'PAGE' && page.id !== figma.currentPage.id) {
      await figma.setCurrentPageAsync(page);
    }

    const node = await figma.getNodeByIdAsync(nodeId);
    if (node === null || node.removed || !('visible' in node)) {
      figma.notify('Слой не найден — возможно, его удалили');
      return;
    }

    figma.currentPage.selection = [node];
    figma.viewport.scrollAndZoomIntoView([node]);
  } catch {
    figma.notify('Не удалось перейти к слою');
  }
}

function handle(message: UiMessage): void {
  switch (message.type) {
    case 'ui/ready':
      void startingScope().then((lastScope) => {
        post({ type: 'main/booted', fileName: figma.root.name, lastScope });
      });
      return;
    case 'ui/scan-requested':
      scan(message.scope).catch((error: unknown) => {
        post({
          type: 'main/error',
          message: error instanceof Error ? error.message : String(error),
        });
      });
      return;
    case 'ui/scan-cancelled':
      cancelled = true;
      return;
    case 'ui/reveal':
      void reveal(message.nodeId, message.pageId);
      return;
  }
}

figma.showUI(__html__, UI_SIZE);
figma.ui.onmessage = (message: UiMessage) => {
  handle(message);
};
