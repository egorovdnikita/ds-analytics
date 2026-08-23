import { describe, expect, it } from 'vitest';
import { buildCsv } from '../../src/main/probe/report';
import type { Hit, ProbeRuleId } from '../../src/main/probe/checks';

const meta = {
  fileName: 'Файл',
  scope: 'page',
  nodesVisited: 10,
  cancelled: false,
  seed: 1,
};

function hit(over: Partial<Hit> = {}): Hit {
  return {
    rule: 'tokens/raw-fill',
    pageId: '1:1',
    nodeId: '2:2',
    nodeName: 'Card',
    detail: '#3B82F6',
    ...over,
  };
}

describe('buildCsv', () => {
  it('кладёт вердикт пустой колонкой для судейства', () => {
    const csv = buildCsv(
      new Map<ProbeRuleId, readonly Hit[]>([['tokens/raw-fill', [hit()]]]),
      new Map<ProbeRuleId, number>([['tokens/raw-fill', 1]]),
      meta,
    );

    expect(csv).toContain('правило,страница,id ноды,имя ноды,что нашли,вердикт,заметка');
    expect(csv).toContain('tokens/raw-fill,1:1,2:2,Card,#3B82F6,,');
  });

  it('экранирует запятые и кавычки в именах слоёв', () => {
    const csv = buildCsv(
      new Map<ProbeRuleId, readonly Hit[]>([
        ['tokens/raw-fill', [hit({ nodeName: 'Card, "big"' })]],
      ]),
      new Map<ProbeRuleId, number>([['tokens/raw-fill', 1]]),
      meta,
    );

    expect(csv).toContain('"Card, ""big"""');
  });

  it('показывает общее число срабатываний рядом с размером выборки', () => {
    const csv = buildCsv(
      new Map<ProbeRuleId, readonly Hit[]>([['tokens/raw-fill', [hit(), hit()]]]),
      new Map<ProbeRuleId, number>([['tokens/raw-fill', 900]]),
      meta,
    );

    // Доля судимых к общему нужна, чтобы понимать репрезентативность.
    expect(csv).toContain('# всего срабатываний,tokens/raw-fill,900,в выборке,2');
  });

  it('помечает отменённый обход — данные неполные', () => {
    const csv = buildCsv(new Map(), new Map(), { ...meta, cancelled: true });
    expect(csv).toContain('# ВНИМАНИЕ,обход отменён — данные неполные');
  });
});
