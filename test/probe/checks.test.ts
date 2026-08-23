import { describe, expect, it, beforeEach } from 'vitest';
import { check, type ProbeContext } from '../../src/main/probe/checks';
import { VariableResolver } from '../../src/main/scanner/variables';
import {
  component,
  frame,
  instance,
  rectangle,
  resetIds,
  solidPaint,
  text,
  tree,
  variableAlias,
} from '../factories/node';

function makeResolver(over: {
  collections?: { id: string; name: string }[];
  variables?: { id: string; name: string; collectionId: string }[];
  unavailable?: boolean;
}) {
  return VariableResolver.build(
    {
      getLocalVariableCollectionsAsync: () =>
        Promise.resolve((over.collections ?? []) as unknown as VariableCollection[]),
      getLocalVariablesAsync: () =>
        Promise.resolve(
          (over.variables ?? []).map((v) => ({
            id: v.id,
            name: v.name,
            variableCollectionId: v.collectionId,
            remote: false,
          })) as unknown as Variable[],
        ),
      getVariableByIdAsync: () => Promise.resolve(null),
      getVariableCollectionByIdAsync: () => Promise.resolve(null),
    },
    { primitives: ['Primitives'], semantic: ['Semantic'] },
  );
}

async function ctx(
  over: Parameters<typeof makeResolver>[0] = {},
  names: string[] = [],
): Promise<ProbeContext> {
  return { resolver: await makeResolver(over), masterNames: new Set(names) };
}

describe('пробник: tokens/raw-fill', () => {
  beforeEach(resetIds);

  it('ловит сплошную заливку без биндинга', async () => {
    const node = rectangle({ name: 'Card', fills: [solidPaint(0.23, 0.51, 0.96)] });
    const hits = check(node, 'p', await ctx());

    expect(hits).toEqual([
      expect.objectContaining({ rule: 'tokens/raw-fill', detail: '#3B82F5', nodeName: 'Card' }),
    ]);
  });

  it('молчит, когда заливка привязана к переменной', async () => {
    const node = rectangle({
      fills: [solidPaint(1, 0, 0)],
      boundVariables: { fills: [variableAlias('V:1')] },
    });

    // broken-alias здесь срабатывает справедливо — переменной нет в индексе.
    // Проверяем именно raw-fill.
    expect(check(node, 'p', await ctx()).filter((h) => h.rule === 'tokens/raw-fill')).toEqual([]);
  });

  it('молчит на ноде без заливок', async () => {
    expect(check(frame({ name: 'Wrapper' }), 'p', await ctx())).toEqual([]);
  });

  it('молчит, когда заливка идёт от paint-стиля', async () => {
    // Регрессия первого боевого прогона: 5798 срабатываний на странице из
    // библиотечных инстансов, потому что проверка смотрела только переменные.
    const node = rectangle({ fills: [solidPaint(1, 0, 0)], fillStyleId: 'S:1234' });

    expect(check(node, 'p', await ctx()).filter((h) => h.rule === 'tokens/raw-fill')).toEqual([]);
  });

  it('молчит внутри инстанса — чинить содержимое инстанса здесь нечем', async () => {
    const child = rectangle({ name: 'Vector', fills: [solidPaint(0, 0, 0)] });
    tree(instance({ name: 'Icon' }), [child]);

    expect(check(child, 'p', await ctx()).filter((h) => h.rule === 'tokens/raw-fill')).toEqual([]);
  });
});

describe('пробник: tokens/broken-alias', () => {
  beforeEach(resetIds);

  it('показывает неразрезолвленный биндинг как кандидата', async () => {
    const node = rectangle({ boundVariables: { fills: [variableAlias('V:404')] } });
    const hits = check(node, 'p', await ctx());

    expect(hits).toEqual([
      expect.objectContaining({ rule: 'tokens/broken-alias', detail: 'не разрезолвилась: V:404' }),
    ]);
  });

  it('молчит на разрезолвленной переменной', async () => {
    const node = rectangle({ boundVariables: { fills: [variableAlias('V:1')] } });
    const context = await ctx({
      collections: [{ id: 'C:1', name: 'Semantic' }],
      variables: [{ id: 'V:1', name: 'text-primary', collectionId: 'C:1' }],
    });

    expect(check(node, 'p', context)).toEqual([]);
  });
});

describe('пробник: tokens/layer-violation', () => {
  beforeEach(resetIds);

  const primitives = {
    collections: [{ id: 'C:1', name: 'Primitives' }],
    variables: [{ id: 'V:1', name: 'gray-500', collectionId: 'C:1' }],
  };

  it('ловит биндинг на примитив внутри компонента', async () => {
    const child = rectangle({ boundVariables: { fills: [variableAlias('V:1')] } });
    tree(component({ name: 'Button' }), [child]);

    const hits = check(child, 'p', await ctx(primitives));

    expect(hits).toContainEqual(
      expect.objectContaining({
        rule: 'tokens/layer-violation',
        detail: 'примитив gray-500 (Primitives)',
      }),
    );
  });

  it('молчит на том же биндинге вне компонента', async () => {
    const node = rectangle({ boundVariables: { fills: [variableAlias('V:1')] } });
    const hits = check(node, 'p', await ctx(primitives));

    expect(hits.filter((h) => h.rule === 'tokens/layer-violation')).toEqual([]);
  });

  it('молчит внутри инстанса — нарушение живёт в мастере, а не здесь', async () => {
    const child = rectangle({ boundVariables: { fills: [variableAlias('V:1')] } });
    tree(instance({ name: 'Button' }), [child]);

    const hits = check(child, 'p', await ctx(primitives));

    expect(hits.filter((h) => h.rule === 'tokens/layer-violation')).toEqual([]);
  });

  it('молчит на семантике внутри компонента', async () => {
    const child = rectangle({ boundVariables: { fills: [variableAlias('V:2')] } });
    tree(component({ name: 'Button' }), [child]);

    const context = await ctx({
      collections: [{ id: 'C:2', name: 'Semantic' }],
      variables: [{ id: 'V:2', name: 'text-secondary', collectionId: 'C:2' }],
    });

    expect(check(child, 'p', context).filter((h) => h.rule === 'tokens/layer-violation')).toEqual(
      [],
    );
  });
});

describe('пробник: structure/default-name', () => {
  beforeEach(resetIds);

  it.each(['Frame 427', 'Rectangle 12', 'Group 3', 'Ellipse 1'])('ловит «%s»', async (name) => {
    const hits = check(frame({ name }), 'p', await ctx());
    expect(hits.map((h) => h.rule)).toContain('structure/default-name');
  });

  it.each(['Card', 'Frame', 'Button 2.0', 'Icon 24 / Close'])('молчит на «%s»', async (name) => {
    const hits = check(text({ name }), 'p', await ctx());
    expect(hits.map((h) => h.rule)).not.toContain('structure/default-name');
  });
});

describe('пробник: components/detached-instance', () => {
  beforeEach(resetIds);

  it('ловит фрейм с именем существующего мастера', async () => {
    const hits = check(frame({ name: 'Button' }), 'p', await ctx({}, ['Button']));
    expect(hits.map((h) => h.rule)).toContain('components/detached-instance');
  });

  it('молчит на фрейме внутри определения компонента', async () => {
    // На файле ДС таких фреймов сотни: это внутренности мастера, а не
    // оторванные инстансы. 183 срабатывания при 438 компонентах.
    const inner = frame({ name: 'Button' });
    tree(component({ name: 'Button' }), [inner]);

    const hits = check(inner, 'p', await ctx({}, ['Button']));

    expect(hits.map((h) => h.rule)).not.toContain('components/detached-instance');
  });

  it('молчит на фрейме внутри инстанса', async () => {
    const inner = frame({ name: 'Button' });
    tree(instance({ name: 'Card' }), [inner]);

    const hits = check(inner, 'p', await ctx({}, ['Button']));

    expect(hits.map((h) => h.rule)).not.toContain('components/detached-instance');
  });

  it('молчит, когда мастера с таким именем нет', async () => {
    const hits = check(frame({ name: 'Button' }), 'p', await ctx({}, ['Card']));
    expect(hits.map((h) => h.rule)).not.toContain('components/detached-instance');
  });
});
