/** Контракты между main и ui. Здесь нет ни `figma.*`, ни React. */

export type Severity = 'error' | 'warning' | 'info';

export type RuleCategory = 'tokens' | 'components' | 'structure' | 'content' | 'a11y';

export type ScanScope = 'selection' | 'page' | 'file';

export interface IssueLocation {
  /** id ноды. Резолвится ТОЛЬКО через async-API — см. аудит B3. */
  readonly nodeId: string;
  readonly pageId: string;
  readonly nodeName: string;
}

export interface Issue {
  readonly ruleId: string;
  readonly severity: Severity;
  readonly at: IssueLocation;
  /** Что не так и ПОЧЕМУ. Формулировка без «почему» не проходит DoD. */
  readonly message: string;
  readonly fixable: boolean;
}

/**
 * Одно атомарное изменение свойства ноды.
 *
 * `previousValue` — не опциональное поле и не оптимизация. Плагин НЕ полагается
 * на нативный Cmd+Z: чанкинг обхода через yield разрывает батч Figma на
 * несколько шагов истории, и «откатить массовый фикс целиком» нативно не
 * гарантируется. Откат реализован свой — см. main/fixes/journal.ts
 * и docs/decisions/0001-undo-strategy.md.
 *
 * Фикс, который не может назвать своё предыдущее значение, не применяется.
 */
export interface FixAction {
  readonly issueRuleId: string;
  readonly nodeId: string;
  /** Имя свойства ноды: 'fills', 'cornerRadius', 'name', … */
  readonly property: string;
  readonly previousValue: unknown;
  readonly nextValue: unknown;
  /** Строка для превью-диффа: «#3B82F6 → text-secondary». */
  readonly description: string;
}

export interface ScanSummary {
  readonly scope: ScanScope;
  readonly nodesVisited: number;
  readonly issues: readonly Issue[];
  readonly durationMs: number;
}

/** Уровень правила в конфиге. `off` — правило выключено. */
export type RuleLevel = 'off' | Severity;

/**
 * Настройка правила: либо уровень, либо уровень с опциями —
 * `"tokens/raw-fill": "error"` или `"a11y/token-pair-contrast": ["warning", { "level": "AA" }]`.
 */
export type RuleSetting = RuleLevel | readonly [RuleLevel, Readonly<Record<string, unknown>>];

export interface AuditConfig {
  readonly version: 1;
  readonly extends: string;
  readonly scope: { readonly default: ScanScope };
  readonly rules: Readonly<Record<string, RuleSetting>>;
  /** Обязателен для `tokens/layer-violation`. Пустой — правило отключается. */
  readonly tokenLayers: Readonly<Record<string, readonly string[]>>;
  /**
   * Кто и когда менял. Конфиг живёт в документе и переписывается целиком:
   * полноценного мерджа нет, поэтому нужна хотя бы видимость авторства.
   */
  readonly updatedBy?: string;
  readonly updatedAt?: string;
}
