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

export const PROFILE_LABEL: Readonly<Record<FileProfile, string>> = {
  'library-source': 'Источник библиотеки',
  consumer: 'Потребитель библиотеки',
  'no-design-system': 'Файл без дизайн-системы',
  unclear: 'Профиль не определён',
};
