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
  /**
   * Имена мастеров — локальных компонентов И мастеров, до которых дотянулись
   * через инстансы. Только локальных недостаточно: в файле-потребителе
   * мастера лежат в библиотеке, и эвристика detached не сработала бы никогда.
   */
  readonly masterNames: ReadonlySet<string>;
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

/**
 * Внутри ли нода определения компонента.
 *
 * Инстансы сюда НЕ входят: «компонент биндится к примитиву» — про мастер.
 * Внутренности инстанса приходят из мастера, и чинить их на месте нечем.
 */
export function insideComponentMaster(node: SceneNode): boolean {
  if (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET') return true;
  let current: BaseNode | null = node.parent;
  while (current !== null) {
    if (current.type === 'COMPONENT' || current.type === 'COMPONENT_SET') return true;
    current = current.parent;
  }
  return false;
}

/** Внутри ли нода инстанса — включая сам инстанс. */
export function insideInstance(node: SceneNode): boolean {
  if (node.type === 'INSTANCE') return true;
  let current: BaseNode | null = node.parent;
  while (current !== null) {
    if (current.type === 'INSTANCE') return true;
    current = current.parent;
  }
  return false;
}

/**
 * Привязана ли заливка к стилю.
 *
 * Первый боевой прогон дал 5798 срабатываний raw-fill на странице, собранной
 * из библиотечных инстансов. Причина: проверка смотрела только на переменные.
 * Заливка через paint-стиль — не хардкод, и считать её нарушением значит
 * утопить сигнал.
 */
export function hasFillStyle(node: SceneNode): boolean {
  if (!('fillStyleId' in node)) return false;
  const styleId: unknown = node.fillStyleId;
  return typeof styleId === 'string' && styleId !== '';
}

export function check(node: SceneNode, pageId: string, ctx: ProbeContext): Hit[] {
  const hits: Hit[] = [];
  const at = { pageId, nodeId: node.id, nodeName: node.name };

  // --- tokens/raw-fill ---
  // Три исключения, все найдены первым боевым прогоном: заливка через
  // переменную, заливка через стиль, нода внутри инстанса.
  const solids = visibleSolidFills(node);
  if (
    solids.length > 0 &&
    boundFillAliases(node).length === 0 &&
    !hasFillStyle(node) &&
    !insideInstance(node)
  ) {
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
  if (insideComponentMaster(node)) {
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
  // Фреймы внутри определения компонента и внутри инстанса исключены:
  // это внутренности мастера, а не оторванный инстанс. Найдено замером на
  // файле дизайн-системы — 183 срабатывания при 438 локальных компонентах.
  if (
    node.type === 'FRAME' &&
    ctx.masterNames.has(node.name) &&
    !insideComponentMaster(node) &&
    !insideInstance(node)
  ) {
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
