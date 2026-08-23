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
 * Форма FixAction намеренно минимальна.
 *
 * Поле `previousValue` для собственного отката ещё не добавлено: решение по
 * стратегии undo не принято — см. docs/pre-launch-audit.md, блок B1.
 * Не расширять этот тип до того, как B1 закрыт.
 */
export interface FixAction {
  readonly issueRuleId: string;
  readonly nodeId: string;
  readonly description: string;
}

export interface ScanSummary {
  readonly scope: ScanScope;
  readonly nodesVisited: number;
  readonly issues: readonly Issue[];
  readonly durationMs: number;
}
