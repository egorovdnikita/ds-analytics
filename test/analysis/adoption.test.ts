import { describe, expect, it } from 'vitest';
import {
  buildAdoption,
  type LibraryGateway,
  type MasterRef,
} from '../../src/main/analysis/adoption';
import { VariableResolver } from '../../src/main/scanner/variables';

function emptyResolver() {
  return VariableResolver.build({
    getLocalVariableCollectionsAsync: () => Promise.resolve([]),
    getLocalVariablesAsync: () => Promise.resolve([]),
    getVariableByIdAsync: () => Promise.resolve(null),
    getVariableCollectionByIdAsync: () => Promise.resolve(null),
  });
}

/** Место, через которое встретился мастер. Для счётчиков важен только факт. */
function place(id: string) {
  return { nodeId: `${id}:1`, pageId: 'p:1', name: 'копия' };
}

const okLibrary: LibraryGateway = {
  getAvailableLibraryVariableCollectionsAsync: () => Promise.resolve([]),
};

/** Воспроизводит боевое падение: обращение к API бросает само по себе. */
const forbiddenLibrary: LibraryGateway = {
  getAvailableLibraryVariableCollectionsAsync: () => {
    throw new Error('"teamlibrary" permission not specified in manifest.json.');
  },
};

async function build(masterRefs: (MasterRef | null)[], library = okLibrary) {
  return buildAdoption(
    {
      masterRefs,
      resolver: await emptyResolver(),
      nodesOnLibraryVariable: 0,
      nodesOnLocalVariable: 0,
      nodesWithoutVariable: 0,
    },
    library,
  );
}

describe('adoption: происхождение компонентов', () => {
  it('делит инстансы на библиотечные, локальные и недоступные', async () => {
    const adoption = await build([
      { key: 'a', name: 'Button', remote: true, place: place('a') },
      { key: 'a', name: 'Button', remote: true, place: place('a') },
      { key: 'b', name: 'Card', remote: false, place: place('b') },
      null,
    ]);

    expect(adoption.instancesCounted).toBe(4);
    expect(adoption.mastersTotal).toBe(2);
    expect(adoption.fromLibrary).toBe(2);
    expect(adoption.local).toBe(1);
    expect(adoption.unknown).toBe(1);
  });

  it('сортирует мастеров по числу инстансов', async () => {
    const adoption = await build([
      { key: 'a', name: 'Rare', remote: true, place: place('a') },
      { key: 'b', name: 'Common', remote: true, place: place('b') },
      { key: 'b', name: 'Common', remote: true, place: place('b') },
    ]);

    expect(adoption.masters.map((m) => m.name)).toEqual(['Common', 'Rare']);
    expect(adoption.masters[0]?.instances).toBe(2);
  });

  it('пустой файл не ломает отчёт', async () => {
    const adoption = await build([]);
    expect(adoption).toMatchObject({ instancesCounted: 0, mastersTotal: 0, fromLibrary: 0 });
  });
});

describe('adoption: недоступная библиотека', () => {
  it('не роняет замер и честно помечает источники неизвестными', async () => {
    // Боевой прогон падал целиком из-за одного необязательного источника.
    const adoption = await build(
      [{ key: 'a', name: 'Button', remote: true, place: place('a') }],
      forbiddenLibrary,
    );

    expect(adoption.librarySourcesAvailable).toBe(false);
    expect(adoption.fromLibrary).toBe(1);
    expect(adoption.libraries).toEqual([]);
  });

  it('при доступной библиотеке флаг поднят', async () => {
    const adoption = await build([{ key: 'a', name: 'Button', remote: true, place: place('a') }]);
    expect(adoption.librarySourcesAvailable).toBe(true);
  });
});

describe('adoption: места для перехода', () => {
  it('запоминает копии, но не больше десяти на компонент', async () => {
    // Хранить все — значит тащить в UI десятки тысяч id ради списка,
    // который никто не пролистает.
    const refs = Array.from({ length: 40 }, (_, i) => ({
      key: 'a',
      name: 'Button',
      remote: true,
      place: { nodeId: `n:${i}`, pageId: 'p:1', name: `копия ${i}` },
    }));

    const adoption = await build(refs);

    expect(adoption.masters[0]?.instances).toBe(40);
    expect(adoption.masters[0]?.places).toHaveLength(10);
    expect(adoption.masters[0]?.places[0]?.nodeId).toBe('n:0');
  });

  it('у каждой копии есть страница — без неё переход невозможен', async () => {
    const adoption = await build([
      {
        key: 'a',
        name: 'Button',
        remote: true,
        place: { nodeId: 'n:1', pageId: 'p:7', name: 'к' },
      },
    ]);

    expect(adoption.masters[0]?.places[0]).toMatchObject({ nodeId: 'n:1', pageId: 'p:7' });
  });
});
