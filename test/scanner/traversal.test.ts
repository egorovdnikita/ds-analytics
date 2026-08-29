import { describe, expect, it, beforeEach, vi } from 'vitest';
import { traverse, type ScanTarget } from '../../src/main/scanner/traversal';
import {
  document,
  frame,
  manyRectangles,
  page,
  rectangle,
  resetIds,
  tree,
} from '../factories/node';

/** Считает точки yield вместо реального таймера. */
function countingYield() {
  let calls = 0;
  return {
    fn: () => {
      calls++;
      return Promise.resolve();
    },
    get calls() {
      return calls;
    },
  };
}

describe('traverse', () => {
  beforeEach(resetIds);

  it('обходит вложенное дерево целиком', async () => {
    const leaf = rectangle({ name: 'leaf' });
    const inner = tree(frame({ name: 'inner' }), [leaf]);
    const outer = tree(frame({ name: 'outer' }), [inner]);
    const target: ScanTarget = { kind: 'page', page: page({ children: [outer] }) };

    const seen: string[] = [];
    const result = await traverse(target, (node) => seen.push(node.name));

    expect(seen).toEqual(['outer', 'inner', 'leaf']);
    expect(result).toEqual({ nodesVisited: 3, pagesVisited: 1, cancelled: false });
  });

  it('сохраняет порядок детей слева направо', async () => {
    const parent = tree(frame({ name: 'p' }), [
      rectangle({ name: 'a' }),
      rectangle({ name: 'b' }),
      rectangle({ name: 'c' }),
    ]);
    const target: ScanTarget = { kind: 'page', page: page({ children: [parent] }) };

    const seen: string[] = [];
    await traverse(target, (node) => seen.push(node.name));

    expect(seen).toEqual(['p', 'a', 'b', 'c']);
  });

  it('передаёт pageId вместе с нодой', async () => {
    const target: ScanTarget = {
      kind: 'page',
      page: page({ id: '7:7', children: [rectangle()] }),
    };

    const seen: string[] = [];
    await traverse(target, (_node, context) => seen.push(context.pageId));

    expect(seen).toEqual(['7:7']);
  });

  it('уступает событийному циклу каждые chunkSize нод', async () => {
    const y = countingYield();
    const target: ScanTarget = { kind: 'page', page: page({ children: manyRectangles(250) }) };

    await traverse(target, () => {}, { chunkSize: 100, yieldToEventLoop: y.fn });

    expect(y.calls).toBe(2);
  });

  it('обходит несколько страниц и грузит каждую ровно один раз', async () => {
    const loadA = vi.fn();
    const loadB = vi.fn();
    const target: ScanTarget = {
      kind: 'file',
      document: document([
        page({ name: 'A', children: [rectangle()], onLoad: loadA }),
        page({ name: 'B', children: [rectangle(), rectangle()], onLoad: loadB }),
      ]),
    };

    const result = await traverse(target, () => {});

    expect(result).toEqual({ nodesVisited: 3, pagesVisited: 2, cancelled: false });
    expect(loadA).toHaveBeenCalledTimes(1);
    expect(loadB).toHaveBeenCalledTimes(1);
  });

  it('не грузит оставшиеся страницы после отмены', async () => {
    const loadA = vi.fn();
    const loadB = vi.fn();
    let cancelled = false;
    const target: ScanTarget = {
      kind: 'file',
      document: document([
        page({ name: 'A', children: [rectangle()], onLoad: loadA }),
        page({ name: 'B', children: [rectangle()], onLoad: loadB }),
      ]),
    };

    const result = await traverse(
      target,
      () => {
        cancelled = true;
      },
      { cancellation: () => cancelled },
    );

    expect(result.cancelled).toBe(true);
    expect(loadA).toHaveBeenCalledTimes(1);
    expect(loadB).not.toHaveBeenCalled();
  });

  it('отменяется на границе чанка и возвращает частичный результат', async () => {
    let cancelled = false;
    const target: ScanTarget = { kind: 'page', page: page({ children: manyRectangles(500) }) };

    const result = await traverse(
      target,
      () => {
        cancelled = true;
      },
      { chunkSize: 10, cancellation: () => cancelled, yieldToEventLoop: () => Promise.resolve() },
    );

    expect(result.cancelled).toBe(true);
    expect(result.nodesVisited).toBe(10);
  });

  it('в скоупе selection обходит только выделенное поддерево', async () => {
    const selected = tree(frame({ name: 'selected' }), [rectangle({ name: 'child' })]);
    const other = frame({ name: 'other' });
    const target: ScanTarget = {
      kind: 'selection',
      nodes: [selected],
      page: page({ children: [selected, other] }),
    };

    const seen: string[] = [];
    await traverse(target, (node) => seen.push(node.name));

    expect(seen).toEqual(['selected', 'child']);
  });

  it('сообщает прогресс двумя уровнями', async () => {
    const progress: string[] = [];
    const target: ScanTarget = {
      kind: 'file',
      document: document([
        page({ name: 'A', children: [rectangle()] }),
        page({ name: 'B', children: [rectangle()] }),
      ]),
    };

    await traverse(target, () => {}, {
      onProgress: (p) =>
        progress.push(`${p.currentPageName} ${p.pagesDone}/${p.pagesTotal} n=${p.nodesVisited}`),
    });

    expect(progress[0]).toBe('A 0/2 n=0');
    expect(progress[progress.length - 1]).toBe('B 2/2 n=2');
  });

  it('пустая страница проходится без ошибок', async () => {
    const result = await traverse({ kind: 'page', page: page() }, () => {});
    expect(result).toEqual({ nodesVisited: 0, pagesVisited: 1, cancelled: false });
  });
});
