/**
 * Журнал отката массового фикса.
 *
 * Реализует решение 0001: плагин откатывает свои изменения сам, не полагаясь
 * на нативную историю Figma. Причина — в docs/decisions/0001-undo-strategy.md.
 *
 * Журнал — чистая структура данных: он не знает, как достать ноду по id.
 * Резолвер передаётся снаружи, потому что при documentAccess: "dynamic-page"
 * доступ к ноде асинхронный и зависит от загрузки страницы.
 */
import type { FixAction } from '../../shared/types';

export interface RevertReport {
  /** Свойств успешно возвращено к предыдущему значению. */
  readonly reverted: number;
  /** Пропущено: нода удалена или недоступна. */
  readonly skipped: number;
  readonly skippedNodeIds: readonly string[];
}

type NodeResolver = (nodeId: string) => Promise<BaseNode | null>;

export class UndoJournal {
  #entries: FixAction[] = [];

  get size(): number {
    return this.#entries.length;
  }

  record(action: FixAction): void {
    this.#entries.push(action);
  }

  recordAll(actions: readonly FixAction[]): void {
    for (const action of actions) this.record(action);
  }

  clear(): void {
    this.#entries = [];
  }

  /**
   * Возвращает свойства к предыдущим значениям в обратном порядке.
   *
   * Обратный порядок обязателен: два фикса могли тронуть одно свойство одной
   * ноды, и правильное конечное состояние даёт только откат с конца.
   *
   * Удалённая нода — не ошибка, а пропуск: пользователь мог удалить слой между
   * фиксом и откатом. Падать в этом месте нельзя, иначе один удалённый слой
   * заблокирует откат остальных 199 изменений.
   */
  async revert(resolve: NodeResolver): Promise<RevertReport> {
    let reverted = 0;
    const skippedNodeIds: string[] = [];

    for (let i = this.#entries.length - 1; i >= 0; i--) {
      const entry = this.#entries[i];
      if (entry === undefined) continue;

      const node = await resolve(entry.nodeId);
      if (node === null || node.removed) {
        skippedNodeIds.push(entry.nodeId);
        continue;
      }

      (node as unknown as Record<string, unknown>)[entry.property] = entry.previousValue;
      reverted++;
    }

    this.clear();
    return { reverted, skipped: skippedNodeIds.length, skippedNodeIds };
  }
}
