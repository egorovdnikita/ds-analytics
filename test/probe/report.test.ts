import { describe, expect, it } from 'vitest';
import { buildCsv } from '../../src/main/probe/report';
import type { Hit, ProbeRuleId } from '../../src/main/probe/checks';
import { emptyDiagnostics } from '../../src/main/probe/diagnostics';

const meta = {
  fileName: 'Файл',
  scope: 'page',
  nodesVisited: 10,
  cancelled: false,
  seed: 1,
  diagnostics: emptyDiagnostics(),
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

describe('диагностика в шапке', () => {
  it('объясняет ноль, когда переменных в скоупе нет', () => {
    // Первый боевой прогон дал три нуля подряд, и по нулю нельзя понять,
    // файл чистый или пробник слеп. Шапка обязана отвечать на это.
    const csv = buildCsv(new Map(), new Map(), {
      ...meta,
      diagnostics: { ...emptyDiagnostics(), nodesTotal: 25804, nodesWithAlias: 0 },
    });

    expect(csv).toContain(
      '# ВЫВОД,переменные в скоупе не используются — layer-violation и broken-alias неприменимы здесь',
    );
  });

  it('объясняет ноль, когда мастеров не нашлось', () => {
    const csv = buildCsv(new Map(), new Map(), {
      ...meta,
      diagnostics: { ...emptyDiagnostics(), masterNames: 0 },
    });

    expect(csv).toContain(
      '# ВЫВОД,мастеров компонентов не найдено — detached-instance неприменим здесь',
    );
  });

  it('печатает имена коллекций — по ним настраивается TOKEN_LAYERS', () => {
    const csv = buildCsv(new Map(), new Map(), {
      ...meta,
      diagnostics: {
        ...emptyDiagnostics(),
        localCollections: 2,
        collectionNames: ['Colors', 'Colors 2'],
        nodesWithAlias: 5,
        masterNames: 3,
      },
    });

    expect(csv).toContain('# имена коллекций,Colors | Colors 2');
  });

  it('не молчит про ноды со стилями заливки', () => {
    const csv = buildCsv(new Map(), new Map(), {
      ...meta,
      diagnostics: { ...emptyDiagnostics(), nodesWithFillStyle: 4200 },
    });

    expect(csv).toContain('# нод со стилем заливки,4200');
  });
});
