import { describe, expect, it } from 'vitest';
import { buildAdvice, verdict } from '../../src/shared/advice';
import type { Adoption, CollectionUsage, MasterUsage } from '../../src/shared/adoption';

function adoption(over: Partial<Adoption> = {}): Adoption {
  return {
    librarySourcesAvailable: true,
    instancesCounted: 1000,
    mastersTotal: 50,
    fromLibrary: 1000,
    local: 0,
    unknown: 0,
    masters: [],
    libraries: [],
    collections: [],
    nodesOnLibraryVariable: 1000,
    nodesOnLocalVariable: 0,
    nodesWithoutVariable: 0,
    ...over,
  };
}

function master(over: Partial<MasterUsage>): MasterUsage {
  return { key: 'k', name: 'Button', origin: 'local', instances: 10, places: [], ...over };
}

function collection(over: Partial<CollectionUsage>): CollectionUsage {
  return { name: 'Kit', source: 'Core DS', variables: 10, isLocal: false, ...over };
}

describe('с чего начать', () => {
  it('на здоровом файле не выдумывает проблем', () => {
    expect(buildAdvice(adoption())).toEqual([]);
  });

  it('копии без библиотеки идут первыми — их нельзя обновить', () => {
    const advice = buildAdvice(
      adoption({ instancesCounted: 1000, fromLibrary: 500, local: 200, unknown: 300 }),
    );

    expect(advice[0]?.id).toBe('unknown-masters');
    expect(advice.map((item) => item.id)).toContain('local-masters');
  });

  it('называет самый частый локальный компонент', () => {
    const advice = buildAdvice(
      adoption({
        instancesCounted: 100,
        fromLibrary: 50,
        local: 50,
        masters: [master({ name: 'Card/Product', instances: 31 })],
      }),
    );

    expect(advice.find((item) => item.id === 'local-masters')?.hint).toContain('Card/Product');
  });

  it('молчит про доли ниже двух процентов — это шум, а не проблема', () => {
    const advice = buildAdvice(
      adoption({ instancesCounted: 1000, fromLibrary: 990, local: 5, unknown: 5 }),
    );

    expect(advice).toEqual([]);
  });

  it('ловит токены из отключённой библиотеки', () => {
    const advice = buildAdvice(
      adoption({
        collections: [
          collection({ name: 'Kit', source: 'Библиотека не подключена', variables: 41 }),
          collection({ name: 'Brand', source: 'Core DS', variables: 200 }),
        ],
      }),
    );

    const found = advice.find((item) => item.id === 'orphan-collections');
    expect(found?.value).toBe('41');
    expect(found?.hint).toContain('Kit');
    expect(found?.hint).not.toContain('Brand');
  });

  it('говорит про цвета без токенов, когда их заметная доля', () => {
    const advice = buildAdvice(
      adoption({ nodesOnLibraryVariable: 100, nodesWithoutVariable: 400 }),
    );

    expect(advice.find((item) => item.id === 'no-tokens')?.hint).toContain('80%');
  });

  it('каждый пункт ведёт куда-то конкретно', () => {
    const advice = buildAdvice(
      adoption({
        instancesCounted: 100,
        fromLibrary: 40,
        local: 30,
        unknown: 30,
        collections: [collection({ source: 'Библиотека не подключена' })],
      }),
    );

    expect(advice.length).toBeGreaterThan(0);
    for (const item of advice) expect(item.target).toBeDefined();
  });
});

describe('вердикт одной фразой', () => {
  it.each([
    [1000, 'Файл держится на дизайн-системе', 'good'],
    [600, 'Дизайн-система используется наполовину', 'warn'],
    [200, 'Большая часть собрана мимо дизайн-системы', 'warn'],
  ])('%i из 1000 → «%s»', (fromLibrary, text, tone) => {
    expect(verdict(adoption({ fromLibrary }))).toEqual({ text, tone });
  });

  it('пустой охват не выдаётся за здоровье', () => {
    expect(verdict(adoption({ instancesCounted: 0, fromLibrary: 0 }))).toEqual({
      text: 'Копий компонентов в этом охвате нет',
      tone: 'warn',
    });
  });
});
