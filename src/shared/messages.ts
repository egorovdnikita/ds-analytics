/**
 * Типизированная шина сообщений main <-> ui.
 * Строковые литералы в вызовах запрещены — только эти типы.
 *
 * ВЕТКА spike/signal-probe: типы заточены под пробник замера сигнала.
 * В main не мержится.
 */
import type { Adoption, ProbeSummary } from './probe';
import type { ScanScope } from './types';

/** ui -> main */
export type UiMessage =
  | { readonly type: 'ui/ready' }
  | { readonly type: 'ui/scan-requested'; readonly scope: ScanScope; readonly seed: number }
  | { readonly type: 'ui/scan-cancelled' }
  | { readonly type: 'ui/reveal'; readonly nodeId: string; readonly pageId: string };

/** main -> ui */
export type MainMessage =
  | {
      readonly type: 'main/booted';
      readonly fileName: string;
      /** Охват прошлого запуска — чтобы не выбирать его каждый раз заново. */
      readonly lastScope: ScanScope | null;
    }
  | {
      readonly type: 'main/scan-progress';
      readonly nodesVisited: number;
      readonly pagesDone: number;
      readonly pagesTotal: number;
      readonly currentPageName: string;
    }
  | {
      readonly type: 'main/scan-finished';
      readonly csv: string;
      readonly summary: ProbeSummary;
      readonly adoption: Adoption;
    }
  | { readonly type: 'main/error'; readonly message: string };
