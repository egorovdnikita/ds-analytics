import type { Trend } from './snapshot';

/**
 * Контракты отчёта adoption между main и ui.
 *
 * Здесь только типы: `shared/` не импортирует из `main/`, иначе типы Figma
 * утекают в UI-сборку, а граница из паспорта держится именно на этом.
 */

/** Место в файле, к которому можно перейти в один клик. */
export interface Place {
  readonly nodeId: string;
  readonly pageId: string;
  readonly name: string;
  /** Что именно нашли. Для копий пусто. */
  readonly detail?: string;
}

/** Откуда пришёл мастер компонента. */
export type MasterOrigin = 'library' | 'local' | 'unknown';

export interface MasterUsage {
  readonly key: string;
  readonly name: string;
  readonly origin: MasterOrigin;
  /** Сколько инстансов верхнего уровня ссылается на этот мастер. */
  readonly instances: number;
  /** Первые несколько копий — чтобы дойти до них кликом. Список ограничен. */
  readonly places: readonly Place[];
}

export interface LibrarySource {
  readonly libraryName: string;
  readonly collections: number;
  readonly variables: number;
}

export interface CollectionUsage {
  readonly name: string;
  /** Имя библиотеки или «Локальная». */
  readonly source: string;
  readonly variables: number;
  readonly isLocal: boolean;
}

export interface Adoption {
  /**
   * Удалось ли назвать библиотеки-источники.
   *
   * false означает «не смогли спросить», а не «библиотек нет»: без
   * разрешения teamlibrary в манифесте обращение к API бросает исключение.
   */
  readonly librarySourcesAvailable: boolean;
  /** Инстансы верхнего уровня: вложенные делят мастера с родителем. */
  readonly instancesCounted: number;
  readonly mastersTotal: number;
  readonly fromLibrary: number;
  readonly local: number;
  readonly unknown: number;
  readonly masters: readonly MasterUsage[];
  readonly libraries: readonly LibrarySource[];
  readonly collections: readonly CollectionUsage[];
  /** Нод с биндингом на библиотечную переменную. */
  readonly nodesOnLibraryVariable: number;
  readonly nodesOnLocalVariable: number;
  /** Нод, которые могли бы иметь переменную (есть заливка), но не имеют. */
  readonly nodesWithoutVariable: number;
}

export interface ScanReport {
  readonly fileName: string;
  readonly scope: string;
  readonly nodesVisited: number;
  readonly cancelled: boolean;
  readonly adoption: Adoption;
  /** История по этому охвату, от старых к новым, включая текущий замер. */
  readonly trend: Trend;
}
