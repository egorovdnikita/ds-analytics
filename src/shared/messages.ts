/**
 * Типизированная шина сообщений main <-> ui.
 * Строковые литералы в вызовах запрещены — только эти типы.
 *
 * ВЕТКА spike/signal-probe: типы заточены под пробник замера сигнала.
 * В main не мержится.
 */
import type { ScanScope } from './types';

/** ui -> main */
export type UiMessage =
  | { readonly type: 'ui/ready' }
  | { readonly type: 'ui/scan-requested'; readonly scope: ScanScope; readonly seed: number }
  | { readonly type: 'ui/scan-cancelled' };

/** main -> ui */
export type MainMessage =
  | { readonly type: 'main/booted'; readonly fileName: string }
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
      readonly totals: readonly (readonly [string, number])[];
      readonly nodesVisited: number;
      readonly cancelled: boolean;
    }
  | { readonly type: 'main/error'; readonly message: string };
