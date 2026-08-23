/**
 * Проверки пробника — ИЗМЕРИТЕЛЬНЫЙ ИНСТРУМЕНТ, НЕ ПРОДУКТОВЫЙ КОД.
 *
 * Живёт на ветке spike/signal-probe и в main не мержится. Задача — получить
 * цифру сигнала по протоколу docs/validation/protocol.md, а не написать
 * хорошие правила. Отсюда осознанные упрощения: нет опций, нет ignore-листа,
 * нет фиксов, эвристики примитивные.
 *
 * Переносить этот код в src/main/rules/ нельзя. Переносятся только цифры.
 */
import type { VariableResolver } from '../scanner/variables';

export type ProbeRuleId =
  | 'tokens/raw-fill'
  | 'tokens/layer-violation'
  | 'tokens/broken-alias'
  | 'components/detached-instance'
  | 'structure/default-name';

export const PROBE_RULES: readonly ProbeRuleId[] = [
  'tokens/raw-fill',
  'tokens/layer-violation',
  'tokens/broken-alias',
  'components/detached-instance',
  'structure/default-name',
];

export interface Hit {
  readonly rule: ProbeRuleId;
  readonly pageId: string;
  readonly nodeId: string;
  readonly nodeName: string;
  /** Что именно нашли — попадает в CSV, чтобы судить не открывая файл. */
  readonly detail: string;
}

export interface ProbeContext {
  readonly resolver: VariableResolver;
  /** Имена мастеров компонентов файла — для эвристики detached. */
  readonly componentNames: ReadonlySet<string>;
}

const DEFAULT_NAME =
  /^(Frame|Group|Rectangle|Ellipse|Vector|Line|Polygon|Star|Slice|Text|Component|Instance)\s+\d+$/;

function toHex(color: RGB): string {
  const part = (v: number): string =>
    Math.round(v * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${part(color.r)}${part(color.g)}${part(color.b)}`.toUpperCase();
}

function visibleSolidFills(node: SceneNode): SolidPaint[] {
  if (!('fills' in node)) return [];
  // `fills` может быть figma.mixed — Array.isArray сужает до any[],
  // поэтому тип возвращаем явно, а не полагаемся на вывод.
  const fills: readonly Paint[] = Array.isArray(node.fills) ? (node.fills as readonly Paint[]) : [];
  return fills.filter(
    (paint): paint is SolidPaint => paint.type === 'SOLID' && paint.visible !== false,
  );
}

function boundFillAliases(node: SceneNode): readonly VariableAlias[] {
  if (!('boundVariables' in node)) return [];
  const bound = node.boundVariables?.fills;
  return Array.isArray(bound) ? bound : [];
}

/** Все алиасы переменных на ноде — по всем свойствам, не только по заливке. */
export function allAliases(node: SceneNode): readonly VariableAlias[] {
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

function isAlias(value: unknown): value is VariableAlias {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === 'VARIABLE_ALIAS' &&
    typeof (value as { id?: unknown }).id === 'string'
  );
}

/** Внутри ли нода компонента или инстанса — для layer-violation. */
function insideComponent(node: SceneNode): boolean {
  let current: BaseNode | null = node.parent;
  while (current !== null) {
    if (
      current.type === 'COMPONENT' ||
      current.type === 'COMPONENT_SET' ||
      current.type === 'INSTANCE'
    ) {
      return true;
    }
    current = current.parent;
  }
  return node.type === 'COMPONENT' || node.type === 'INSTANCE';
}

export function check(node: SceneNode, pageId: string, ctx: ProbeContext): Hit[] {
  const hits: Hit[] = [];
  const at = { pageId, nodeId: node.id, nodeName: node.name };

  // --- tokens/raw-fill ---
  const solids = visibleSolidFills(node);
  if (solids.length > 0 && boundFillAliases(node).length === 0) {
    const first = solids[0];
    if (first !== undefined) {
      hits.push({ rule: 'tokens/raw-fill', ...at, detail: toHex(first.color) });
    }
  }

  const aliases = allAliases(node);

  // --- tokens/broken-alias ---
  // Пробник НЕ утверждает, что переменная удалена: отличить «удалена» от
  // «плагину недоступна» невозможно (решение 0004). Он показывает кандидатов,
  // а дизайнер проверяет в Figma. Доля реально удалённых здесь и есть та
  // цифра, ради которой правило либо нужно, либо нет.
  for (const alias of aliases) {
    if (!ctx.resolver.canJudge(alias.id)) {
      hits.push({
        rule: 'tokens/broken-alias',
        ...at,
        detail: `не разрезолвилась: ${alias.id}`,
      });
    }
  }

  // --- tokens/layer-violation ---
  if (insideComponent(node)) {
    for (const alias of aliases) {
      const resolved = ctx.resolver.resolve(alias.id);
      if (resolved.state !== 'unavailable' && resolved.layer === 'primitives') {
        hits.push({
          rule: 'tokens/layer-violation',
          ...at,
          detail: `примитив ${resolved.name} (${resolved.collectionName})`,
        });
      }
    }
  }

  // --- components/detached-instance ---
  // Самая слабая эвристика каталога, и включена намеренно: если она провалится
  // по сигналу, лучше узнать это здесь, а не после релиза.
  if (node.type === 'FRAME' && ctx.componentNames.has(node.name)) {
    hits.push({
      rule: 'components/detached-instance',
      ...at,
      detail: `фрейм повторяет имя мастера «${node.name}»`,
    });
  }

  // --- structure/default-name ---
  if (DEFAULT_NAME.test(node.name)) {
    hits.push({ rule: 'structure/default-name', ...at, detail: node.name });
  }

  return hits;
}
