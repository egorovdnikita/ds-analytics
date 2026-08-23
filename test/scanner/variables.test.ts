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
