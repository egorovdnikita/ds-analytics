import { describe, expect, it } from 'vitest';
import { appendSnapshot, buildSnapshot, buildTrend } from '../../src/main/analysis/snapshot';
import type { Adoption } from '../../src/shared/adoption';
import { deltaPoints, shortDate, type Snapshot } from '../../src/shared/snapshot';

function adoption(over: Partial<Adoption> = {}): Adoption {
  return {
    librarySourcesAvailable: true,
    instancesCounted: 100,
    mastersTotal: 10,
    fromLibrary: 60,
    local: 30,
    unknown: 10,
    masters: [],
    libraries: [],
    collections: [],
    nodesOnLibraryVariable: 40,
    nodesOnLocalVariable: 10,
    nodesWithoutVariable: 50,
    topVariables: [],
    ...over,
  };
}

function snap(over: Partial<Snapshot> = {}): Snapshot {
  return {
    v: 1,
    at: '2026-08-20T10:00:00.000Z',
    scope: 'страница',
    nodes: 1000,
    instances: 100,
    fromLibrary: 60,
    local: 30,
    unknown: 10,
    fills: 100,
    onTokens: 50,
    masters: 10,
    ...over,
  };
}

describe('снимок', () => {
  it('складывает покрытие токенами из двух источников', () => {
    const result = buildSnapshot({
      at: new Date('2026-08-23T12:00:00Z'),
      scope: 'страница',
      nodes: 5000,
      adoption: adoption(),
    });

    expect(result.onTokens).toBe(50);
    expect(result.fills).toBe(100);
    expect(result.v).toBe(1);
  });
});

describe('история', () => {
  it('один снимок на день на охват — последний вытесняет предыдущий', () => {
    const morning = snap({ at: '2026-08-20T09:00:00.000Z', fromLibrary: 40 });
    const evening = snap({ at: '2026-08-20T21:00:00.000Z', fromLibrary: 70 });

    const history = appendSnapshot([morning], evening, 40);

    expect(history).toHaveLength(1);
    expect(history[0]?.fromLibrary).toBe(70);
  });

  it('снимки разных охватов в один день не схлопываются', () => {
    const page = snap({ scope: 'страница' });
    const file = snap({ scope: 'весь файл' });

    expect(appendSnapshot([page], file, 40)).toHaveLength(2);
  });

  it('держит последние N и вытесняет старые', () => {
    let history: readonly Snapshot[] = [];
    for (let day = 1; day <= 50; day++) {
      history = appendSnapshot(
        history,
        snap({ at: `2026-08-${String(day).padStart(2, '0')}` }),
        10,
      );
    }

    expect(history).toHaveLength(10);
    expect(history[0]?.at).toBe('2026-08-41');
  });

  it('хранит точки по возрастанию даты', () => {
    const history = appendSnapshot(
      [snap({ at: '2026-08-22T10:00:00.000Z' })],
      snap({ at: '2026-08-21T10:00:00.000Z' }),
      40,
    );

    expect(history.map((item) => item.at.slice(0, 10))).toEqual(['2026-08-21', '2026-08-22']);
  });
});

describe('тренд', () => {
  it('считается внутри одного охвата', () => {
    // Сравнивать скан страницы со сканом файла бессмысленно: выйдет скачок
    // в разы, который читается как обвал покрытия.
    const history = [
      snap({ scope: 'страница', at: '2026-08-20', fromLibrary: 40 }),
      snap({ scope: 'весь файл', at: '2026-08-21', fromLibrary: 90 }),
      snap({ scope: 'страница', at: '2026-08-22', fromLibrary: 60 }),
    ];

    const trend = buildTrend(history, 'страница');

    expect(trend.points).toHaveLength(2);
    expect(trend.previous?.fromLibrary).toBe(40);
  });

  it('одна точка — сравнивать не с чем', () => {
    expect(buildTrend([snap()], 'страница').previous).toBeNull();
  });

  it('чужой охват не даёт ложного сравнения', () => {
    expect(buildTrend([snap({ scope: 'весь файл' })], 'страница')).toEqual({
      points: [],
      previous: null,
    });
  });
});

describe('разница в пунктах', () => {
  it('считает рост в процентных пунктах', () => {
    expect(deltaPoints({ part: 60, total: 100 }, { part: 45, total: 100 })).toBe(15);
  });

  it('без прошлой точки разницы нет', () => {
    expect(deltaPoints({ part: 60, total: 100 }, null)).toBeNull();
  });

  it('пустой прошлый замер не выдаётся за стопроцентный рост', () => {
    expect(deltaPoints({ part: 60, total: 100 }, { part: 0, total: 0 })).toBeNull();
  });
});

describe('дата', () => {
  it('короткая, без года', () => {
    expect(shortDate('2026-08-12T10:00:00.000Z')).toBe('12 авг');
  });

  it('мусор не роняет отчёт', () => {
    expect(shortDate('не дата')).toBe('—');
  });
});
