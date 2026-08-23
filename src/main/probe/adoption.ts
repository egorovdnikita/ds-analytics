/**
 * Adoption: насколько файл живёт на дизайн-системе.
 *
 * Что API даёт и чего не даёт:
 *
 * - для **переменных** библиотеку-источник назвать можно —
 *   `figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync()` отдаёт
 *   `libraryName`, а коллекция сопоставляется с ним по `key`;
 * - для **компонентов** такого API нет. Различить локальный и библиотечный
 *   мастер можно (`ComponentNode.remote`), назвать библиотеку — нельзя.
 *   Это ограничение платформы, а не недоделка: в отчёте так и написано.
 */
import type {
  Adoption,
  CollectionUsage,
  LibrarySource,
  MasterOrigin,
  MasterUsage,
} from '../../shared/probe';
import type { VariableResolver } from '../scanner/variables';

export interface MasterRef {
  readonly key: string;
  readonly name: string;
  readonly remote: boolean;
}

export interface LibraryGateway {
  getAvailableLibraryVariableCollectionsAsync(): Promise<LibraryVariableCollection[]>;
}

export interface AdoptionInput {
  /** По одной записи на инстанс верхнего уровня; null — мастер недоступен. */
  readonly masterRefs: readonly (MasterRef | null)[];
  readonly detachedCandidates: number;
  readonly resolver: VariableResolver;
  readonly nodesOnLibraryVariable: number;
  readonly nodesOnLocalVariable: number;
  readonly nodesWithoutVariable: number;
}

export async function buildAdoption(
  input: AdoptionInput,
  library: LibraryGateway,
): Promise<Adoption> {
  const masters = countMasters(input.masterRefs);
  const unknown = input.masterRefs.filter((ref) => ref === null).length;

  const { collections, libraries } = await describeVariableSources(input.resolver, library);

  return {
    instancesCounted: input.masterRefs.length,
    mastersTotal: masters.length,
    fromLibrary: masters.filter((m) => m.origin === 'library').reduce(sumInstances, 0),
    local: masters.filter((m) => m.origin === 'local').reduce(sumInstances, 0),
    unknown,
    detachedCandidates: input.detachedCandidates,
    masters,
    libraries,
    collections,
    nodesOnLibraryVariable: input.nodesOnLibraryVariable,
    nodesOnLocalVariable: input.nodesOnLocalVariable,
    nodesWithoutVariable: input.nodesWithoutVariable,
  };
}

const sumInstances = (sum: number, master: MasterUsage): number => sum + master.instances;

function countMasters(refs: readonly (MasterRef | null)[]): MasterUsage[] {
  const byKey = new Map<string, { name: string; origin: MasterOrigin; instances: number }>();

  for (const ref of refs) {
    if (ref === null) continue;
    const origin: MasterOrigin = ref.remote ? 'library' : 'local';
    const existing = byKey.get(ref.key);
    if (existing === undefined) {
      byKey.set(ref.key, { name: ref.name, origin, instances: 1 });
    } else {
      existing.instances++;
    }
  }

  return [...byKey]
    .map(([key, value]) => ({ key, ...value }))
    .sort((a, b) => b.instances - a.instances);
}

/**
 * Сопоставляет коллекции переменных с библиотеками по ключу.
 *
 * `getAvailableLibraryVariableCollectionsAsync` перечисляет коллекции всех
 * подключённых к файлу библиотек. Коллекция, которой там нет, — либо
 * локальная, либо из библиотеки, которая файлу больше не подключена. Второе
 * как раз и есть «используется что-то не из нашей ДС».
 */
async function describeVariableSources(
  resolver: VariableResolver,
  library: LibraryGateway,
): Promise<{ collections: CollectionUsage[]; libraries: LibrarySource[] }> {
  const libraryByKey = new Map<string, string>();
  try {
    for (const collection of await library.getAvailableLibraryVariableCollectionsAsync()) {
      libraryByKey.set(collection.key, collection.libraryName);
    }
  } catch {
    // Библиотеки недоступны — источники останутся неизвестными, но
    // остальной отчёт от этого не теряется.
  }

  const collections: CollectionUsage[] = resolver.collectionsWithUsage().map((collection) => ({
    name: collection.name,
    source: collection.isLocal
      ? 'Локальная'
      : (libraryByKey.get(collection.key) ?? 'Библиотека не подключена'),
    variables: collection.variables,
    isLocal: collection.isLocal,
  }));

  const byLibrary = new Map<string, { collections: number; variables: number }>();
  for (const collection of collections) {
    if (collection.isLocal) continue;
    const entry = byLibrary.get(collection.source) ?? { collections: 0, variables: 0 };
    entry.collections++;
    entry.variables += collection.variables;
    byLibrary.set(collection.source, entry);
  }

  const libraries: LibrarySource[] = [...byLibrary]
    .map(([libraryName, value]) => ({ libraryName, ...value }))
    .sort((a, b) => b.variables - a.variables);

  return { collections: collections.sort((a, b) => b.variables - a.variables), libraries };
}
