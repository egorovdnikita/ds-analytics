/**
 * Типизированная шина сообщений main <-> ui.
 * Строковые литералы в вызовах запрещены — только эти типы.
 */
import type { ScanScope, ScanSummary } from './types';

/** ui -> main */
export type UiMessage =
  | { readonly type: 'ui/ready' }
  | { readonly type: 'ui/scan-requested'; readonly scope: ScanScope }
  | { readonly type: 'ui/scan-cancelled' }
  | { readonly type: 'ui/reveal-node'; readonly nodeId: string; readonly pageId: string };

/** main -> ui */
export type MainMessage =
  | { readonly type: 'main/booted'; readonly fileName: string }
  | { readonly type: 'main/scan-progress'; readonly done: number; readonly total: number }
  | { readonly type: 'main/scan-finished'; readonly summary: ScanSummary }
  | { readonly type: 'main/error'; readonly message: string };
