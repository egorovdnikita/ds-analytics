/**
 * Инкрементальная инвалидация индекса.
 *
 * Реализует решение 0003. Это НЕ кэш-хранилище значений: класс отвечает
 * на один вопрос — какие ноды пересчитывать. Сам индекс живёт отдельно.
 *
 * Ключевое ограничение: события приходят только пока плагин открыт, поэтому
 * первый скан после запуска всегда полный. Это отражено в `needsFullScan`.
 */

export interface DirtySet {
  /** Ноды, которые надо пересчитать. */
  readonly dirty: readonly string[];
  /** Ноды, чьи issues надо просто выбросить — их больше нет в документе. */
  readonly removed: readonly string[];
}

type Unsubscribe = () => void;

export class IncrementalCache {
  #seeded = false;
  #dirty = new Set<string>();
  #removed = new Set<string>();
  #trackedPageIds = new Set<string>();
  #unsubscribes: Unsubscribe[] = [];

  /** Пока не было полного скана, инкремент невозможен. */
  get needsFullScan(): boolean {
    return !this.#seeded;
  }

  get trackedPageIds(): ReadonlySet<string> {
    return this.#trackedPageIds;
  }

  get pendingCount(): number {
    return this.#dirty.size + this.#removed.size;
  }

  /** Отмечает, что полный скан выполнен и кэш можно считать актуальным. */
  seed(): void {
    this.#seeded = true;
    this.#dirty.clear();
    this.#removed.clear();
  }

  /**
   * Подписывается на изменения страницы.
   *
   * Используется `page.on('nodechange')`, а не `figma.on('documentchange')`:
   * второй под dynamic-page требует загрузки всех страниц документа.
   */
  observe(page: PageNode): void {
    if (this.#trackedPageIds.has(page.id)) return;
    this.#trackedPageIds.add(page.id);

    const handler = (event: NodeChangeEvent): void => {
      this.applyChanges(event.nodeChanges);
    };
    page.on('nodechange', handler);
    this.#unsubscribes.push(() => {
      page.off('nodechange', handler);
    });
  }

  applyChanges(changes: readonly NodeChange[]): void {
    for (const change of changes) {
      switch (change.type) {
        case 'PROPERTY_CHANGE':
          this.#dirty.add(change.id);
          break;
        case 'CREATE':
          this.#dirty.add(change.id);
          this.#markParent(change.node);
          break;
        case 'DELETE':
          this.#removed.add(change.id);
          this.#dirty.delete(change.id);
          // У RemovedNode нет parent — бывший родитель останется с устаревшим
          // результатом до следующего полного скана. Ограничение решения 0003.
          this.#markParent(change.node);
          break;
      }
    }
  }

  /** Забирает накопленные изменения и очищает их. */
  take(): DirtySet {
    const result: DirtySet = {
      dirty: [...this.#dirty],
      removed: [...this.#removed],
    };
    this.#dirty.clear();
    this.#removed.clear();
    return result;
  }

  /**
   * Полный сброс. Вызывается при смене скоупа: индекс, построенный по одной
   * странице, ничего не знает о других, и достраивать его нельзя.
   */
  reset(): void {
    this.dispose();
    this.#seeded = false;
    this.#dirty.clear();
    this.#removed.clear();
    this.#trackedPageIds.clear();
  }

  /** Снимает все подписки. Обязательно при закрытии плагина. */
  dispose(): void {
    for (const off of this.#unsubscribes) off();
    this.#unsubscribes = [];
  }

  #markParent(node: SceneNode | RemovedNode): void {
    if (node.removed === true) return;
    const parent = node.parent;
    if (parent !== null && parent !== undefined) this.#dirty.add(parent.id);
  }
}
