/**
 * Контракты пробника между main и ui.
 *
 * Здесь только типы: `shared/` не импортирует из `main/`, иначе типы Figma
 * утекают в UI-сборку, а граница из паспорта держится именно на этом.
 */

export type ProbeRuleId =
  | 'tokens/raw-fill'
  | 'tokens/layer-violation'
  | 'tokens/broken-alias'
  | 'components/detached-instance'
  | 'structure/default-name';

export const PROBE_RULES: readonly ProbeRuleId[] = [
  'tokens/raw-fill',
  'tokens/layer-violation',
  'tokens/broken-alias',
  'components/detached-instance',
  'structure/default-name',
];

export interface Diagnostics {
  nodesTotal: number;
  /** Нод с хотя бы одним биндингом переменной. Ноль означает: переменных не используют. */
  nodesWithAlias: number;
  /** Нод с привязанным стилем заливки. Их нельзя считать хардкодом. */
  nodesWithFillStyle: number;
  /** Нод внутри инстансов — их содержимое приходит из мастера. */
  nodesInsideInstance: number;
  instancesTotal: number;
  instancesTopLevel: number;
  localComponents: number;
  masterNames: number;
  localCollections: number;
  localVariables: number;
  collectionNames: string[];
  /** Имена коллекций, которые удалось сопоставить слою ДС. */
  layeredCollectionNames: string[];
  /** Сколько разрезолвленных переменных попало в каждый слой. */
  variablesByLayer: { primitives: number; semantic: number; component: number; unmapped: number };
  /** Нод внутри определений компонентов — область действия layer-violation. */
  nodesInComponentMaster: number;
}

/**
 * Три исхода, которые в голом списке счётчиков выглядят одинаково:
 * правило нашло N, правило не нашло ничего, правило не могло отработать.
 *
 * Последний случай читается как «всё хорошо», хотя означает «инструмент
 * здесь слеп». Именно на этом смешении мы потеряли два прогона.
 */
export type RuleOutcome =
  | { readonly status: 'measured'; readonly hits: number; readonly sampled: number }
  | { readonly status: 'empty'; readonly note: string }
  | { readonly status: 'not-applicable'; readonly reason: string };

export interface RuleSummary {
  readonly rule: ProbeRuleId;
  readonly outcome: RuleOutcome;
  /** Места из выборки — к каждому можно перейти. */
  readonly places: readonly Place[];
}

export type FileProfile = 'library-source' | 'consumer' | 'no-design-system' | 'unclear';

export interface ProbeSummary {
  readonly fileName: string;
  readonly scope: string;
  readonly nodesVisited: number;
  readonly cancelled: boolean;
  readonly profile: FileProfile;
  readonly profileNote: string;
  readonly rules: readonly RuleSummary[];
  readonly diagnostics: Diagnostics;
  readonly layersReadable: boolean;
  readonly layerNote: string;
  /** Сколько срабатываний реально предстоит отсудить. */
  readonly toJudge: number;
}

/** Человеческие названия правил. Технический id остаётся в деталях. */
export const RULE_LABEL: Readonly<Record<ProbeRuleId, string>> = {
  'tokens/raw-fill': 'цвет без токена',
  'tokens/layer-violation': 'токен не того уровня',
  'tokens/broken-alias': 'битые токены',
  'components/detached-instance': 'оторванные копии',
  'structure/default-name': 'имена по умолчанию',
};

export const PROFILE_LABEL: Readonly<Record<FileProfile, string>> = {
  'library-source': 'файл дизайн-системы',
  consumer: 'файл на библиотеке',
  'no-design-system': 'файл без дизайн-системы',
  unclear: 'не понятно',
};

/* ================= Adoption ================= */

/** Откуда пришёл мастер компонента. */
export type MasterOrigin = 'library' | 'local' | 'unknown';

/** Место в файле, к которому можно перейти в один клик. */
export interface Place {
  readonly nodeId: string;
  readonly pageId: string;
  readonly name: string;
  /** Что именно нашли — для правил. Для копий пусто. */
  readonly detail?: string;
}

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
  /** Кандидаты в оторванные инстансы — доля системы, потерянная при detach. */
  readonly detachedCandidates: number;
  readonly masters: readonly MasterUsage[];
  readonly libraries: readonly LibrarySource[];
  readonly collections: readonly CollectionUsage[];
  /** Нод с биндингом на библиотечную переменную. */
  readonly nodesOnLibraryVariable: number;
  readonly nodesOnLocalVariable: number;
  /** Нод, которые могли бы иметь переменную (есть заливка), но не имеют. */
  readonly nodesWithoutVariable: number;
}
