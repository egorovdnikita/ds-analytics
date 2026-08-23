/**
 * Фабрика моков нод.
 *
 * DoD требует по три теста на правило. Если написание мока дороже написания
 * правила, DoD перестают соблюдать — поэтому фабрика создаётся раньше правил.
 *
 * Моки намеренно частичные: правило читает считаные поля, и заполнять весь
 * SceneNode — потеря времени. Приведение типа локализовано в `as`-хелперах,
 * чтобы `any` не расползался по тестам.
 */

let counter = 0;
const nextId = (): string => `${++counter}:${counter}`;

/** Сброс счётчика id между тестами — делает id предсказуемыми. */
export function resetIds(): void {
  counter = 0;
}

export function solidPaint(r: number, g: number, b: number, a = 1): SolidPaint {
  return { type: 'SOLID', color: { r, g, b }, opacity: a, visible: true, blendMode: 'NORMAL' };
}

export function variableAlias(id: string): VariableAlias {
  return { type: 'VARIABLE_ALIAS', id };
}

interface BaseOverrides {
  id?: string;
  name?: string;
  visible?: boolean;
  opacity?: number;
  fills?: readonly Paint[];
  /** '' — стиля нет. Непустая строка — заливка идёт от paint-стиля. */
  fillStyleId?: string;
  boundVariables?: Record<string, VariableAlias | readonly VariableAlias[]>;
  parent?: BaseNode | null;
  children?: readonly SceneNode[];
}

function base(type: string, o: BaseOverrides) {
  return {
    type,
    id: o.id ?? nextId(),
    name: o.name ?? type.charAt(0) + type.slice(1).toLowerCase(),
    visible: o.visible ?? true,
    opacity: o.opacity ?? 1,
    removed: false,
    fills: o.fills ?? [],
    fillStyleId: o.fillStyleId ?? '',
    boundVariables: o.boundVariables ?? {},
    parent: o.parent ?? null,
    children: o.children ?? [],
  };
}

export function frame(o: BaseOverrides & { layoutMode?: 'NONE' | 'HORIZONTAL' | 'VERTICAL' } = {}) {
  return {
    ...base('FRAME', o),
    layoutMode: o.layoutMode ?? 'NONE',
  } as unknown as FrameNode;
}

export function rectangle(o: BaseOverrides = {}) {
  return base('RECTANGLE', o) as unknown as RectangleNode;
}

export function text(o: BaseOverrides & { characters?: string } = {}) {
  return {
    ...base('TEXT', o),
    characters: o.characters ?? '',
  } as unknown as TextNode;
}

export function component(o: BaseOverrides = {}) {
  return base('COMPONENT', o) as unknown as ComponentNode;
}

export function instance(o: BaseOverrides & { mainComponentId?: string } = {}) {
  return {
    ...base('INSTANCE', o),
    getMainComponentAsync: () =>
      Promise.resolve(
        o.mainComponentId === undefined ? null : component({ id: o.mainComponentId }),
      ),
  } as unknown as InstanceNode;
}

/** Связывает родителя с детьми в обе стороны — правила часто ходят вверх. */
export function tree<T extends { children?: unknown }>(parent: T, children: SceneNode[]): T {
  (parent as { children: SceneNode[] }).children = children;
  for (const child of children) {
    (child as { parent: unknown }).parent = parent;
  }
  return parent;
}

interface PageOverrides {
  id?: string;
  name?: string;
  children?: readonly SceneNode[];
  /** Счётчик вызовов loadAsync — ленивую загрузку надо уметь проверять. */
  onLoad?: () => void;
}

export function page(o: PageOverrides = {}) {
  const node = {
    type: 'PAGE',
    id: o.id ?? nextId(),
    name: o.name ?? 'Page 1',
    removed: false,
    children: o.children ?? [],
    loadAsync: () => {
      o.onLoad?.();
      return Promise.resolve();
    },
  };
  for (const child of node.children) {
    (child as { parent: unknown }).parent = node;
  }
  return node as unknown as PageNode;
}

export function document(pages: readonly PageNode[]) {
  return {
    type: 'DOCUMENT',
    id: '0:0',
    name: 'Document',
    children: pages,
  } as unknown as DocumentNode;
}

/** Строит плоскую пачку прямоугольников — для проверки чанкинга. */
export function manyRectangles(count: number): SceneNode[] {
  return Array.from({ length: count }, (_, i) => rectangle({ name: `Rect ${i}` }));
}
