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
import { traverse, type ScanTarget } from './scanner/traversal';
import { VariableResolver } from './scanner/variables';

const UI_SIZE = { width: 480, height: 640 } as const;
const SCOPE_KEY = 'last-scope';

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

/** Внутри ли нода инстанса — включая сам инстанс. */
function insideInstance(node: SceneNode): boolean {
  if (node.type === 'INSTANCE') return true;
  let current: BaseNode | null = node.parent;
  while (current !== null) {
    if (current.type === 'INSTANCE') return true;
    current = current.parent;
  }
  return false;
}

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
  const nodes: SceneNode[] = [];

  const result = await traverse(
    targetFor(scope),
    (node, pageId) => {
      nodes.push(node);
      for (const alias of allAliases(node)) aliasIds.add(alias.id);

      if (node.type === 'INSTANCE') {
        const parent = node.parent;
        const nested = parent !== null && 'type' in parent && insideInstance(parent as SceneNode);
        if (!nested) topLevelInstances.push({ node, pageId });
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

  // Фаза 4 — подсчёт покрытия по нодам.
  let onLibraryVariable = 0;
  let onLocalVariable = 0;
  let withoutVariable = 0;
  for (const node of nodes) {
    const aliases = allAliases(node);
    if (aliases.length === 0) {
      if (!insideInstance(node) && hasVisibleFill(node)) withoutVariable++;
      continue;
    }
    if (aliases.some((alias) => resolver.isLocal(alias.id))) onLocalVariable++;
    else onLibraryVariable++;
  }

  const adoption = await buildAdoption(
    {
      masterRefs,
      resolver,
      nodesOnLibraryVariable: onLibraryVariable,
      nodesOnLocalVariable: onLocalVariable,
      nodesWithoutVariable: withoutVariable,
    },
    {
      // Обращение к figma.teamLibrary само бросает исключение, если в
      // манифесте нет разрешения. Оборачиваем в функцию, чтобы бросок
      // случился внутри перехвата, а не убил весь прогон.
      getAvailableLibraryVariableCollectionsAsync: () =>
        figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync(),
    },
  );

  post({
    type: 'main/scan-finished',
    report: {
      fileName: figma.root.name,
      scope: SCOPE_LABEL[scope],
      nodesVisited: result.nodesVisited,
      cancelled: result.cancelled,
      adoption,
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
      void loadLastScope().then((lastScope) => {
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
