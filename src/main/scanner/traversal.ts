/**
 * Обход дерева с чанкингом, ленивой загрузкой страниц и отменой.
 *
 * Реализует решение 0002. Единственное место в плагине, где дерево обходится:
 * правила работают по готовому индексу и в дерево не ходят.
 */

export type ScanTarget =
  | { readonly kind: 'selection'; readonly nodes: readonly SceneNode[]; readonly page: PageNode }
  | { readonly kind: 'page'; readonly page: PageNode }
  | { readonly kind: 'file'; readonly document: DocumentNode };

export interface TraversalProgress {
  readonly nodesVisited: number;
  /** Для скоупа 'file' — сколько страниц пройдено. Иначе всегда 1 из 1. */
  readonly pagesDone: number;
  readonly pagesTotal: number;
  readonly currentPageName: string;
}

export interface TraversalResult {
  readonly nodesVisited: number;
  readonly pagesVisited: number;
  /** true, если обход прерван пользователем. Результат при этом частичный. */
  readonly cancelled: boolean;
}

/**
 * Запрос отмены, а не снимок состояния.
 *
 * Намеренно функция: у поля `readonly isCancelled: boolean` анализ потока
 * TypeScript считает значение неизменным внутри функции и схлопывает вторую
 * проверку в мёртвый код. Отмена по определению меняется между проверками.
 */
export type Cancellation = () => boolean;

export interface TraversalOptions {
  /** Сколько нод пройти до передачи управления событийному циклу. */
  readonly chunkSize?: number;
  readonly cancellation?: Cancellation;
  readonly onProgress?: (progress: TraversalProgress) => void;
  /**
   * Передача управления событийному циклу. Инжектируется, чтобы тесты могли
   * считать точки yield, а не ждать реальных таймеров.
   */
  readonly yieldToEventLoop?: () => Promise<void>;
}

const DEFAULT_CHUNK_SIZE = 500;

const defaultYield = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

/** Ноды, у которых есть дети. Проверка по наличию поля, а не по списку типов. */
function childrenOf(node: SceneNode): readonly SceneNode[] {
  return 'children' in node ? node.children : [];
}

/**
 * Обходит цель и вызывает `visit` на каждой ноде.
 *
 * Обход итеративный: глубина вложенности во фрейме не ограничена, а стек
 * вызовов JS ограничен, поэтому рекурсия здесь — отложенный краш.
 */
export async function traverse(
  target: ScanTarget,
  visit: (node: SceneNode, pageId: string) => void,
  options: TraversalOptions = {},
): Promise<TraversalResult> {
  const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const yieldToEventLoop = options.yieldToEventLoop ?? defaultYield;
  const cancellation = options.cancellation;

  const pages = pagesOf(target);
  let nodesVisited = 0;
  let pagesVisited = 0;
  let sinceLastYield = 0;

  const report = (currentPageName: string): void => {
    options.onProgress?.({
      nodesVisited,
      pagesDone: pagesVisited,
      pagesTotal: pages.length,
      currentPageName,
    });
  };

  for (const page of pages) {
    if (cancellation?.() === true) {
      return { nodesVisited, pagesVisited, cancelled: true };
    }

    // Ленивая загрузка: страница грузится ровно перед её обходом, а не пачкой
    // через loadAllPagesAsync — иначе отмена на третьей странице из сорока
    // всё равно оплачена загрузкой всех сорока.
    await page.loadAsync();
    report(page.name);

    const stack: SceneNode[] = [...rootsFor(target, page)];

    while (stack.length > 0) {
      const node = stack.pop();
      if (node === undefined) break;

      visit(node, page.id);
      nodesVisited++;
      sinceLastYield++;

      const children = childrenOf(node);
      for (let i = children.length - 1; i >= 0; i--) {
        const child = children[i];
        if (child !== undefined) stack.push(child);
      }

      if (sinceLastYield >= chunkSize) {
        sinceLastYield = 0;
        report(page.name);
        await yieldToEventLoop();
        if (cancellation?.() === true) {
          return { nodesVisited, pagesVisited, cancelled: true };
        }
      }
    }

    pagesVisited++;
    report(page.name);
  }

  return { nodesVisited, pagesVisited, cancelled: false };
}

function pagesOf(target: ScanTarget): readonly PageNode[] {
  switch (target.kind) {
    case 'selection':
      return [target.page];
    case 'page':
      return [target.page];
    case 'file':
      return target.document.children;
  }
}

function rootsFor(target: ScanTarget, page: PageNode): readonly SceneNode[] {
  return target.kind === 'selection' ? target.nodes : page.children;
}
