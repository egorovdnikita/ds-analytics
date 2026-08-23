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
import { allAliases, check, PROBE_RULES, type Hit, type ProbeRuleId } from './probe/checks';
import { buildCsv } from './probe/report';
import { sample } from './probe/sample';

const UI_SIZE = { width: 480, height: 640 } as const;
const SAMPLE_SIZE = 30;

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
  // tokenLayers берём из конфига документа? Нет: пробник намеренно без
  // настроек. Разметку слоёв задаём здесь руками перед прогоном на файле.
  const resolver = await VariableResolver.build(figma.variables, TOKEN_LAYERS);

  // Фаза 2 — обход. Ноды копим целиком: пробник меряет, а не экономит память.
  const nodes: { node: SceneNode; pageId: string }[] = [];
  const aliasIds = new Set<string>();

  const result = await traverse(
    targetFor(scope),
    (node, pageId) => {
      nodes.push({ node, pageId });
      for (const alias of allAliases(node)) aliasIds.add(alias.id);
    },
    {
      cancellation: () => cancelled,
      onProgress: (p) => {
        post({ type: 'main/scan-progress', ...p });
      },
    },
  );

  // Фаза 3 — догрузка библиотечных переменных.
  await resolver.hydrate(aliasIds);

  // Фаза 4 — синхронный прогон.
  const componentNames = new Set(
    nodes.filter(({ node }) => node.type === 'COMPONENT').map(({ node }) => node.name),
  );

  const byRule = new Map<ProbeRuleId, Hit[]>(PROBE_RULES.map((rule) => [rule, []]));
  for (const { node, pageId } of nodes) {
    for (const hit of check(node, pageId, { resolver, componentNames })) {
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
    }),
    totals: [...totals].map(([rule, count]) => [rule, count] as const),
    nodesVisited: result.nodesVisited,
    cancelled: result.cancelled,
  });
}

/**
 * Разметка слоёв для layer-violation.
 *
 * Пробник без настроек — правится здесь перед прогоном на конкретном файле.
 * Если на боевом файле имена коллекций не ложатся в эти списки, это само по
 * себе результат замера: правило неприменимо из коробки (см. results.md).
 */
const TOKEN_LAYERS = {
  primitives: ['Primitives', 'Palette', 'Primitive', 'Core'],
  semantic: ['Semantic', 'Theme', 'Tokens'],
  component: ['Component', 'Components'],
} as const;

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
