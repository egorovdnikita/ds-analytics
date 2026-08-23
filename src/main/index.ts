/**
 * ВЕТКА spike/signal-probe — входная точка пробника, НЕ продукта.
 *
 * Задача: получить цифры для docs/validation/results.md по протоколу
 * docs/validation/protocol.md. Ветка в main не мержится.
 *
 * Пробник переиспользует боевые scanner/traversal.ts и scanner/variables.ts —
 * иначе меряется не то, что поедет в продукт.
 */
import type { MainMessage, UiMessage } from '../shared/messages';
import type { ScanScope } from '../shared/types';
import { traverse, type ScanTarget } from './scanner/traversal';
import { VariableResolver } from './scanner/variables';
import {
  allAliases,
  check,
  hasFillStyle,
  insideInstance,
  PROBE_RULES,
  type Hit,
  type ProbeRuleId,
} from './probe/checks';
import { emptyDiagnostics } from './probe/diagnostics';
import { buildCsv } from './probe/report';
import { sample } from './probe/sample';

const UI_SIZE = { width: 480, height: 640 } as const;
const SAMPLE_SIZE = 30;

/**
 * Разметка слоёв для layer-violation.
 *
 * Пробник без настроек — правится здесь перед прогоном на конкретном файле.
 * Если имена коллекций файла не ложатся в эти списки, это само по себе
 * результат замера: правило неприменимо из коробки. Фактические имена
 * коллекций пробник печатает в шапке CSV.
 */
const TOKEN_LAYERS = {
  primitives: ['Primitives', 'Palette', 'Primitive', 'Core'],
  semantic: ['Semantic', 'Theme', 'Tokens'],
  component: ['Component', 'Components'],
} as const;

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

async function runProbe(scope: ScanScope, seed: number): Promise<void> {
  cancelled = false;

  // Фаза 1 — локальный индекс переменных.
  const resolver = await VariableResolver.build(figma.variables, TOKEN_LAYERS);

  // Фаза 2 — обход. Ноды копим целиком: пробник меряет, а не экономит память.
  const nodes: { node: SceneNode; pageId: string }[] = [];
  const aliasIds = new Set<string>();
  const topLevelInstances: InstanceNode[] = [];
  const diagnostics = emptyDiagnostics();

  const result = await traverse(
    targetFor(scope),
    (node, pageId) => {
      nodes.push({ node, pageId });
      diagnostics.nodesTotal++;

      const aliases = allAliases(node);
      if (aliases.length > 0) diagnostics.nodesWithAlias++;
      for (const alias of aliases) aliasIds.add(alias.id);

      if (hasFillStyle(node)) diagnostics.nodesWithFillStyle++;
      if (node.type === 'COMPONENT') diagnostics.localComponents++;

      if (node.type === 'INSTANCE') {
        diagnostics.instancesTotal++;
        // Мастер резолвим только для инстансов верхнего уровня: вложенные
        // делят мастера с родителем, и тысячи лишних async-вызовов
        // растянули бы прогон на минуты.
        const parent = node.parent;
        const nested = parent !== null && 'type' in parent && insideInstance(parent as SceneNode);
        if (!nested) {
          diagnostics.instancesTopLevel++;
          topLevelInstances.push(node);
        }
      } else if (insideInstance(node)) {
        diagnostics.nodesInsideInstance++;
      }
    },
    {
      cancellation: () => cancelled,
      onProgress: (p) => {
        post({ type: 'main/scan-progress', ...p });
      },
    },
  );

  // Фаза 3 — догрузка библиотечных переменных и имён мастеров.
  await resolver.hydrate(aliasIds);

  const masterNames = new Set(
    nodes.filter(({ node }) => node.type === 'COMPONENT').map(({ node }) => node.name),
  );
  // Без этого detached-instance не мог сработать ни разу на файле-потребителе:
  // локальных COMPONENT там нет, мастера лежат в библиотеке.
  for (const instance of topLevelInstances) {
    try {
      const master = await instance.getMainComponentAsync();
      if (master !== null) masterNames.add(master.name);
    } catch {
      // Недоступный мастер — не повод ронять замер.
    }
  }
  diagnostics.masterNames = masterNames.size;

  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  diagnostics.localCollections = collections.length;
  diagnostics.collectionNames = collections.map((collection) => collection.name);
  diagnostics.localVariables = (await figma.variables.getLocalVariablesAsync()).length;

  // Фаза 4 — синхронный прогон.
  const byRule = new Map<ProbeRuleId, Hit[]>(PROBE_RULES.map((rule) => [rule, []]));
  for (const { node, pageId } of nodes) {
    for (const hit of check(node, pageId, { resolver, masterNames })) {
      byRule.get(hit.rule)?.push(hit);
    }
  }

  const totals = new Map<ProbeRuleId, number>();
  const sampled = new Map<ProbeRuleId, readonly Hit[]>();
  for (const [rule, hits] of byRule) {
    totals.set(rule, hits.length);
    sampled.set(rule, sample(hits, SAMPLE_SIZE, seed));
  }

  post({
    type: 'main/scan-finished',
    csv: buildCsv(sampled, totals, {
      fileName: figma.root.name,
      scope,
      nodesVisited: result.nodesVisited,
      cancelled: result.cancelled,
      seed,
      diagnostics,
    }),
    totals: [...totals].map(([rule, count]) => [rule, count] as const),
    nodesVisited: result.nodesVisited,
    cancelled: result.cancelled,
  });
}

function handle(message: UiMessage): void {
  switch (message.type) {
    case 'ui/ready':
      post({ type: 'main/booted', fileName: figma.root.name });
      return;
    case 'ui/scan-requested':
      runProbe(message.scope, message.seed).catch((error: unknown) => {
        post({
          type: 'main/error',
          message: error instanceof Error ? error.message : String(error),
        });
      });
      return;
    case 'ui/scan-cancelled':
      cancelled = true;
      return;
  }
}

figma.showUI(__html__, UI_SIZE);
figma.ui.onmessage = (message: UiMessage) => {
  handle(message);
};
