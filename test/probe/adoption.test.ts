import { describe, expect, it } from 'vitest';
import { buildAdoption, type LibraryGateway, type MasterRef } from '../../src/main/probe/adoption';
import { VariableResolver } from '../../src/main/scanner/variables';

function emptyResolver() {
  return VariableResolver.build({
    getLocalVariableCollectionsAsync: () => Promise.resolve([]),
    getLocalVariablesAsync: () => Promise.resolve([]),
    getVariableByIdAsync: () => Promise.resolve(null),
    getVariableCollectionByIdAsync: () => Promise.resolve(null),
  });
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
      detachedCandidates: 0,
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
      { key: 'a', name: 'Button', remote: true },
      { key: 'a', name: 'Button', remote: true },
      { key: 'b', name: 'Card', remote: false },
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
      { key: 'a', name: 'Rare', remote: true },
      { key: 'b', name: 'Common', remote: true },
      { key: 'b', name: 'Common', remote: true },
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
    const adoption = await build([{ key: 'a', name: 'Button', remote: true }], forbiddenLibrary);

    expect(adoption.librarySourcesAvailable).toBe(false);
    expect(adoption.fromLibrary).toBe(1);
    expect(adoption.libraries).toEqual([]);
  });

  it('при доступной библиотеке флаг поднят', async () => {
    const adoption = await build([{ key: 'a', name: 'Button', remote: true }]);
    expect(adoption.librarySourcesAvailable).toBe(true);
  });
});
