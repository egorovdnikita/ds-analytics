/**
 * Типизированная шина сообщений main <-> ui.
 * Строковые литералы в вызовах запрещены — только эти типы.
 */
import type { ScanReport } from './adoption';
import type { ScanScope } from './types';

/** ui -> main */
export type UiMessage =
  | { readonly type: 'ui/ready' }
  | { readonly type: 'ui/scan-requested'; readonly scope: ScanScope }
  | { readonly type: 'ui/scan-cancelled' }
  | { readonly type: 'ui/reveal'; readonly nodeId: string; readonly pageId: string };

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
  | { readonly type: 'main/scan-finished'; readonly report: ScanReport }
  | { readonly type: 'main/error'; readonly message: string };
