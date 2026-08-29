/**
 * Обратный индекс: токен → где он используется.
 *
 * Паспорт называет impact analysis причиной, по которой плагин выберут
 * вместо линтера хардкода: «что сломается, если удалить этот токен» — до
 * рефакторинга, а не после.
 *
 * Индекс собирается прямо во время обхода: список привязок и так проходит
 * через сканер, второй проход по дереву ради него был бы лишним.
 */
import type { Place, VariableUsage } from '../../shared/adoption';

/**
 * Сколько мест помним на токен.
 *
 * Счётчик точный, список — примеры. Хранить все места значит тащить в UI
 * десятки тысяч записей ради списка, который никто не пролистает.
 */
const PLACES_PER_VARIABLE = 12;

interface Entry {
  nodes: number;
  readonly places: Place[];
  readonly pages: Set<string>;
}

export class VariableUsageIndex {
  readonly #byId = new Map<string, Entry>();
  /**
   * Ноды с их привязками.
   *
   * Нужен, чтобы делить ноды по локальности точно, а не оценочно: мест на
   * токен хранится ограниченное число, и считать по ним значит занижать.
   * Записей здесь столько, сколько нод с токенами — на боевом файле это
   * двадцать тысяч, а не сто десять.
   */
  readonly #byNode = new Map<string, string[]>();

  add(variableId: string, place: Place): void {
    const entry = this.#byId.get(variableId);
    if (entry === undefined) {
      this.#byId.set(variableId, { nodes: 1, places: [place], pages: new Set([place.pageId]) });
    } else {
      entry.nodes++;
      entry.pages.add(place.pageId);
      if (entry.places.length < PLACES_PER_VARIABLE) entry.places.push(place);
    }

    const onNode = this.#byNode.get(place.nodeId);
    if (onNode === undefined) this.#byNode.set(place.nodeId, [variableId]);
    else onNode.push(variableId);
  }

  get size(): number {
    return this.#byId.size;
  }

  /**
   * Делит ноды на живущие на локальных и на библиотечных токенах.
   *
   * Нода считается один раз: если на ней есть хоть одна локальная привязка,
   * она локальная. Иначе двойной учёт раздул бы сумму выше числа нод.
   */
  splitByLocality(isLocal: (variableId: string) => boolean): {
    onLocal: number;
    onLibrary: number;
  } {
    let onLocal = 0;
    let onLibrary = 0;

    for (const variableIds of this.#byNode.values()) {
      // Нода с локальной и библиотечной привязками считается локальной:
      // иначе она попала бы в оба счётчика и сумма превысила бы число нод.
      if (variableIds.some(isLocal)) onLocal++;
      else onLibrary++;
    }

    return { onLocal, onLibrary };
  }

  /** Использование токенов, от самых востребованных к редким. */
  describe(
    resolve: (id: string) => { name: string; collectionName: string } | null,
    limit: number,
  ): readonly VariableUsage[] {
    const result: VariableUsage[] = [];

    for (const [id, entry] of this.#byId) {
      const resolved = resolve(id);
      if (resolved === null) continue;
      result.push({
        id,
        name: resolved.name,
        collectionName: resolved.collectionName,
        nodes: entry.nodes,
        pages: entry.pages.size,
        places: entry.places,
      });
    }

    return result.sort((a, b) => b.nodes - a.nodes).slice(0, limit);
  }
}
