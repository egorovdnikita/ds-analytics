import { describe, expect, it } from 'vitest';
import { toMarkdown } from '../../src/shared/export';
import type { Adoption, ScanReport, VariableUsage } from '../../src/shared/adoption';
import { plain } from '../helpers/text';
import type { Snapshot } from '../../src/shared/snapshot';

function snap(over: Partial<Snapshot> = {}): Snapshot {
  return {
    v: 1,
    at: '2026-08-20T10:00:00.000Z',
    scope: 'весь файл',
    nodes: 1000,
    instances: 100,
    fromLibrary: 45,
    local: 40,
    unknown: 15,
    fills: 200,
    onTokens: 100,
    masters: 10,
    ...over,
  };
}

function report(over: Partial<Adoption> = {}, trend?: ScanReport['trend']): ScanReport {
  return {
    fileName: 'Главная',
    scope: 'весь файл',
    nodesVisited: 110918,
    cancelled: false,
    adoption: {
      librarySourcesAvailable: true,
      instancesCounted: 100,
      mastersTotal: 12,
      fromLibrary: 60,
      local: 30,
      unknown: 10,
      masters: [],
      libraries: [],
      collections: [],
      nodesOnLibraryVariable: 80,
      nodesOnLocalVariable: 20,
      nodesWithoutVariable: 100,
      topVariables: [],
      ...over,
    },
    trend: trend ?? { points: [], previous: null },
  };
}

const at = new Date('2026-08-23T10:00:00.000Z');

describe('отчёт в Markdown', () => {
  it('начинается с вердикта и охвата', () => {
    const text = toMarkdown(report(), at);

    expect(text).toContain('# Дизайн-система в файле «Главная»');
    expect(text).toContain('Дизайн-система используется наполовину.');
    expect(text).toContain('охват «весь файл»');
  });

  it('даёт и долю, и абсолютные числа', () => {
    // Процент без абсолютных чисел нечитаем: 60% от ста и от десяти —
    // разговор разной серьёзности.
    const text = toMarkdown(report(), at);

    expect(plain(text)).toContain('60% · 60 из 100 копий');
  });

  it('показывает изменение к прошлому замеру', () => {
    const text = toMarkdown(report({}, undefined), at);
    expect(text).not.toContain('Изменение с');

    const withTrend = toMarkdown(
      report({}, { points: [snap(), snap({ at: '2026-08-23T10:00:00.000Z' })], previous: snap() }),
      at,
    );
    expect(withTrend).toContain('Изменение с 20 авг | +15 п.п.');
  });

  it('перечисляет компоненты мимо библиотеки, но не все подряд', () => {
    const masters = Array.from({ length: 30 }, (_, i) => ({
      key: `k${i}`,
      name: `Card ${i}`,
      origin: 'local' as const,
      instances: 30 - i,
      places: [],
    }));

    const text = toMarkdown(report({ masters }), at);

    expect(text).toContain('| Card 0 | свой | 30 |');
    expect(text).not.toContain('Card 11');
  });

  it('не ломает таблицу именем со вертикальной чертой', () => {
    // Имена слоёв в Figma бывают любые.
    const text = toMarkdown(
      report({
        masters: [{ key: 'k', name: 'Icon | 24', origin: 'unknown', instances: 3, places: [] }],
      }),
      at,
    );

    expect(text).toContain('Icon \\| 24');
  });

  it('предупреждает, если обход был остановлен', () => {
    const text = toMarkdown({ ...report(), cancelled: true }, at);
    expect(text).toContain('Обход был остановлен');
  });

  it('историю печатает только когда есть что сравнивать', () => {
    expect(toMarkdown(report(), at)).not.toContain('Как менялось');

    const withHistory = toMarkdown(
      report({}, { points: [snap(), snap({ at: '2026-08-22T10:00:00.000Z' })], previous: snap() }),
      at,
    );
    expect(withHistory).toContain('## Как менялось');
  });

  it('на здоровом файле не выдумывает раздел «с чего начать»', () => {
    const text = toMarkdown(
      report({ fromLibrary: 100, local: 0, unknown: 0, nodesWithoutVariable: 0 }),
      at,
    );
    expect(text).not.toContain('С чего начать');
  });
});

describe('токены в отчёте', () => {
  const usage = (over: Partial<VariableUsage>): VariableUsage => ({
    id: 'V1',
    name: 'color/bg',
    collectionName: 'Brand',
    nodes: 3200,
    pages: 12,
    places: [],
    ...over,
  });

  it('перечисляет самые востребованные и объясняет, зачем это число', () => {
    const text = toMarkdown(report({ topVariables: [usage({})] }), at);

    expect(text).toContain('## Токены, которые держат файл');
    expect(text).toContain('сломается, если токен удалить или переименовать');
    expect(plain(text)).toContain('| color/bg | Brand | 3 200 | 12 |');
  });

  it('без привязок раздел не выдумывается', () => {
    expect(toMarkdown(report(), at)).not.toContain('Токены, которые держат файл');
  });

  it('не вываливает весь список — только верхушку', () => {
    const many = Array.from({ length: 30 }, (_, i) => usage({ id: `V${i}`, name: `t-${i}` }));
    const text = toMarkdown(report({ topVariables: many }), at);

    expect(text).toContain('| t-0 |');
    expect(text).not.toContain('| t-11 |');
  });
});
