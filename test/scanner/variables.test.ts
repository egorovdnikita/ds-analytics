import { describe, expect, it } from 'vitest';
import { VariableResolver, type VariablesGateway } from '../../src/main/scanner/variables';

function variable(over: {
  id: string;
  name?: string;
  collectionId?: string;
  remote?: boolean;
}): Variable {
  return {
    id: over.id,
    name: over.name ?? 'token',
    variableCollectionId: over.collectionId ?? 'C:1',
    remote: over.remote ?? false,
    resolvedType: 'COLOR',
  } as unknown as Variable;
}

function collection(id: string, name: string): VariableCollection {
  return { id, name } as unknown as VariableCollection;
}

function gateway(over: Partial<VariablesGateway> = {}): VariablesGateway {
  return {
    getLocalVariableCollectionsAsync: () => Promise.resolve([]),
    getLocalVariablesAsync: () => Promise.resolve([]),
    getVariableByIdAsync: () => Promise.resolve(null),
    getVariableCollectionByIdAsync: () => Promise.resolve(null),
    ...over,
  };
}

describe('VariableResolver — три состояния', () => {
  it('локальная переменная получает состояние local и имя коллекции', async () => {
    const resolver = await VariableResolver.build(
      gateway({
        getLocalVariableCollectionsAsync: () => Promise.resolve([collection('C:1', 'Semantic')]),
        getLocalVariablesAsync: () =>
          Promise.resolve([variable({ id: 'V:1', name: 'text-secondary' })]),
      }),
      { semantic: ['Semantic'] },
    );

    expect(resolver.resolve('V:1')).toEqual({
      state: 'local',
      id: 'V:1',
      name: 'text-secondary',
      collectionId: 'C:1',
      collectionName: 'Semantic',
      layer: 'semantic',
    });
  });

  it('неизвестный id — unavailable, а не исключение', async () => {
    const resolver = await VariableResolver.build(gateway());
    expect(resolver.resolve('V:404')).toEqual({ state: 'unavailable', id: 'V:404' });
  });

  it('гидрация достаёт библиотечную переменную как library', async () => {
    const resolver = await VariableResolver.build(
      gateway({
        getVariableByIdAsync: (id) =>
          Promise.resolve(variable({ id, name: 'brand/blue', remote: true })),
      }),
    );

    await resolver.hydrate(['V:9']);

    const resolved = resolver.resolve('V:9');
    expect(resolved.state).toBe('library');
    expect(resolver.canJudge('V:9')).toBe(true);
  });

  it('недоступная переменная запрещает выносить вердикт', async () => {
    const resolver = await VariableResolver.build(gateway());
    await resolver.hydrate(['V:404']);

    expect(resolver.resolve('V:404').state).toBe('unavailable');
    expect(resolver.canJudge('V:404')).toBe(false);
  });

  it('упавший запрос трактуется как unavailable и не роняет скан', async () => {
    const resolver = await VariableResolver.build(
      gateway({ getVariableByIdAsync: () => Promise.reject(new Error('library disconnected')) }),
    );

    await expect(resolver.hydrate(['V:1', 'V:2'])).resolves.toBeUndefined();
    expect(resolver.canJudge('V:1')).toBe(false);
    expect(resolver.canJudge('V:2')).toBe(false);
  });

  it('не запрашивает уже известные и повторяющиеся id', async () => {
    let calls = 0;
    const resolver = await VariableResolver.build(
      gateway({
        getLocalVariableCollectionsAsync: () => Promise.resolve([collection('C:1', 'Primitives')]),
        getLocalVariablesAsync: () => Promise.resolve([variable({ id: 'V:1' })]),
        getVariableByIdAsync: (id) => {
          calls++;
          return Promise.resolve(variable({ id, remote: true }));
        },
      }),
    );

    await resolver.hydrate(['V:1', 'V:2', 'V:2', 'V:2']);

    expect(calls).toBe(1);
  });
});

describe('VariableResolver — слои токенов', () => {
  const build = (layers: Parameters<typeof VariableResolver.build>[1]) =>
    VariableResolver.build(
      gateway({
        getLocalVariableCollectionsAsync: () =>
          Promise.resolve([collection('C:1', 'Semantic Legacy')]),
        getLocalVariablesAsync: () => Promise.resolve([variable({ id: 'V:1' })]),
      }),
      layers,
    );

  it('без конфига слои считаются ненастроенными', async () => {
    const resolver = await build({});
    expect(resolver.areLayersConfigured).toBe(false);
    expect(resolver.resolve('V:1')).toMatchObject({ layer: null });
  });

  it('пустые списки слоёв тоже считаются ненастроенными', async () => {
    const resolver = await build({ semantic: [] });
    expect(resolver.areLayersConfigured).toBe(false);
  });

  it('сопоставляет коллекцию слою регистронезависимо', async () => {
    const resolver = await build({ semantic: ['  semantic legacy '] });
    expect(resolver.resolve('V:1')).toMatchObject({ layer: 'semantic' });
  });

  it('матчит по точному имени, а не по подстроке', async () => {
    const resolver = await build({ semantic: ['Semantic'] });

    expect(resolver.areLayersConfigured).toBe(true);
    // Коллекция называется «Semantic Legacy» — подстрочный матч дал бы
    // ложную разметку слоя.
    expect(resolver.resolve('V:1')).toMatchObject({ layer: null });
  });
});

describe('VariableResolver — коллекции библиотечных переменных', () => {
  it('догружает коллекцию библиотечной переменной и определяет слой', async () => {
    // Боевой замер: 9220 нод с биндингами, локальных коллекций 0.
    // Без догрузки коллекции слой всегда null, и layer-violation молча
    // не работает на любом файле-потребителе библиотеки.
    const resolver = await VariableResolver.build(
      gateway({
        getVariableByIdAsync: (id) =>
          Promise.resolve(
            variable({ id, name: 'gray-500', collectionId: 'C:remote', remote: true }),
          ),
        getVariableCollectionByIdAsync: (id) => Promise.resolve(collection(id, 'Primitives')),
      }),
      { primitives: ['Primitives'] },
    );

    await resolver.hydrate(['V:1']);

    expect(resolver.resolve('V:1')).toMatchObject({
      state: 'library',
      collectionName: 'Primitives',
      layer: 'primitives',
    });
  });

  it('запрашивает коллекцию один раз на несколько переменных', async () => {
    let calls = 0;
    const resolver = await VariableResolver.build(
      gateway({
        getVariableByIdAsync: (id) =>
          Promise.resolve(variable({ id, collectionId: 'C:remote', remote: true })),
        getVariableCollectionByIdAsync: (id) => {
          calls++;
          return Promise.resolve(collection(id, 'Semantic'));
        },
      }),
    );

    await resolver.hydrate(['V:1', 'V:2', 'V:3']);

    expect(calls).toBe(1);
  });

  it('недоступная коллекция оставляет слой null, но переменную не теряет', async () => {
    const resolver = await VariableResolver.build(
      gateway({
        getVariableByIdAsync: (id) =>
          Promise.resolve(variable({ id, name: 'brand', collectionId: 'C:x', remote: true })),
        getVariableCollectionByIdAsync: () => Promise.reject(new Error('нет доступа')),
      }),
      { primitives: ['Primitives'] },
    );

    await resolver.hydrate(['V:1']);

    expect(resolver.resolve('V:1')).toMatchObject({ state: 'library', layer: null });
    expect(resolver.canJudge('V:1')).toBe(true);
  });

  it('отдаёт имена всех известных коллекций', async () => {
    const resolver = await VariableResolver.build(
      gateway({
        getLocalVariableCollectionsAsync: () => Promise.resolve([collection('C:1', 'Local')]),
        getVariableByIdAsync: (id) =>
          Promise.resolve(variable({ id, collectionId: 'C:2', remote: true })),
        getVariableCollectionByIdAsync: (id) => Promise.resolve(collection(id, 'Remote')),
      }),
    );

    await resolver.hydrate(['V:1']);

    expect([...resolver.collectionNames].sort()).toEqual(['Local', 'Remote']);
  });
});

describe('VariableResolver — счётчики по слоям', () => {
  it('считает переменные по слоям и отдельно неразмеченные', async () => {
    // «Нарушений слоёв не найдено» непроверяемо без этих чисел: ноль
    // нарушений при нуле примитивов — это не здоровье системы, а пустота.
    const resolver = await VariableResolver.build(
      gateway({
        getLocalVariableCollectionsAsync: () =>
          Promise.resolve([
            collection('C:1', 'Primitives'),
            collection('C:2', 'Semantic'),
            collection('C:3', 'Brand Colors'),
          ]),
        getLocalVariablesAsync: () =>
          Promise.resolve([
            variable({ id: 'V:1', collectionId: 'C:1' }),
            variable({ id: 'V:2', collectionId: 'C:1' }),
            variable({ id: 'V:3', collectionId: 'C:2' }),
            variable({ id: 'V:4', collectionId: 'C:3' }),
          ]),
      }),
      { primitives: ['Primitives'], semantic: ['Semantic'] },
    );

    expect(resolver.countByLayer()).toEqual({
      primitives: 2,
      semantic: 1,
      component: 0,
      unmapped: 1,
    });
  });

  it('называет коллекции, которые легли на слои', async () => {
    const resolver = await VariableResolver.build(
      gateway({
        getLocalVariableCollectionsAsync: () =>
          Promise.resolve([collection('C:1', 'Primitives'), collection('C:2', 'Kit')]),
      }),
      { primitives: ['Primitives'] },
    );

    expect(resolver.layeredCollectionNames()).toEqual(['Primitives']);
  });
});
