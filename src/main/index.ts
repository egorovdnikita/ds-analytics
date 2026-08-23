/**
 * Plugin sandbox entry. Здесь нет DOM и нет React.
 *
 * Никаких тяжёлых синхронных циклов в этом файле — обход дерева живёт
 * в scanner/traversal.ts (пока не реализован: ждёт решения по B2/B3).
 */
import type { MainMessage, UiMessage } from '../shared/messages';

const UI_SIZE = { width: 420, height: 640 } as const;

function post(message: MainMessage): void {
  figma.ui.postMessage(message);
}

function handle(message: UiMessage): void {
  switch (message.type) {
    case 'ui/ready':
      post({ type: 'main/booted', fileName: figma.root.name });
      return;
    case 'ui/scan-requested':
      post({ type: 'main/error', message: `Скан «${message.scope}» ещё не реализован.` });
      return;
    case 'ui/scan-cancelled':
      return;
    case 'ui/reveal-node':
      void reveal(message.nodeId, message.pageId);
      return;
  }
}

/**
 * Навигация к ноде. Всё через async-API: при documentAccess: "dynamic-page"
 * синхронный getNodeById недоступен, а нужная страница может быть не загружена.
 */
async function reveal(nodeId: string, pageId: string): Promise<void> {
  const page = await figma.getNodeByIdAsync(pageId);
  if (page === null || page.type !== 'PAGE') {
    post({ type: 'main/error', message: 'Страница не найдена — возможно, она удалена.' });
    return;
  }
  await figma.setCurrentPageAsync(page);

  const node = await figma.getNodeByIdAsync(nodeId);
  if (node === null || node.removed || !('visible' in node)) {
    post({ type: 'main/error', message: 'Нода не найдена — возможно, она удалена.' });
    return;
  }
  figma.currentPage.selection = [node];
  figma.viewport.scrollAndZoomIntoView([node]);
}

figma.showUI(__html__, UI_SIZE);
figma.ui.onmessage = (message: UiMessage) => {
  handle(message);
};
