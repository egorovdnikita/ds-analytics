import { describe, expect, it } from 'vitest';
import { buildSummary } from '../../src/main/probe/summary';
import { emptyDiagnostics } from '../../src/main/probe/diagnostics';
import type { Diagnostics, ProbeRuleId, RuleOutcome } from '../../src/shared/probe';

function build(diag: Partial<Diagnostics>, hits: Partial<Record<ProbeRuleId, number>> = {}) {
  const entries = Object.entries(hits) as [ProbeRuleId, number][];
  return buildSummary({
    fileName: 'Файл',
    scope: 'page',
    nodesVisited: diag.nodesTotal ?? 0,
    cancelled: false,
    diagnostics: { ...emptyDiagnostics(), ...diag },
    hits: new Map(entries),
    sampled: new Map(entries.map(([rule, n]) => [rule, Math.min(n, 30)])),
  });
}

function outcomeOf(summary: ReturnType<typeof build>, rule: ProbeRuleId): RuleOutcome {
  const found = summary.rules.find((r) => r.rule === rule);
  if (found === undefined) throw new Error(`нет правила ${rule}`);
  return found.outcome;
}

describe('профиль файла', () => {
  it('компоненты и коллекции — источник библиотеки', () => {
    const s = build({ localComponents: 438, localCollections: 8 });
    expect(s.profile).toBe('library-source');
  });

  it('инстансы без локальных компонентов — потребитель', () => {
    const s = build({ localComponents: 0, instancesTotal: 7011 });
    expect(s.profile).toBe('consumer');
  });

  it('ни инстансов, ни переменных — файл без ДС', () => {
    expect(build({ nodesTotal: 500 }).profile).toBe('no-design-system');
  });
});

describe('различение «пусто» и «не применимо»', () => {
  it('layer-violation без переменных — не применимо', () => {
    const s = build({ nodesWithAlias: 0 }, { 'tokens/layer-violation': 0 });
    expect(outcomeOf(s, 'tokens/layer-violation')).toEqual({
      status: 'not-applicable',
      reason: 'в файле нет токенов',
    });
  });

  it('layer-violation без слоёв в именах коллекций — не применимо', () => {
    // Боевой файл ДС: Brand Colors, Mode, Radius, Spacing — по типу свойства,
    // а не по слоям. Размечать нечего.
    const s = build(
      {
        nodesWithAlias: 1619,
        localComponents: 438,
        collectionNames: ['★ Brand Colors', '◐ Mode', '⛶ Radius', 'Ω Spacing'],
      },
      { 'tokens/layer-violation': 0 },
    );

    expect(outcomeOf(s, 'tokens/layer-violation')).toMatchObject({ status: 'not-applicable' });
    expect(s.layersReadable).toBe(false);
  });

  it('layer-violation со слоями, но без локальных компонентов — не применимо', () => {
    const s = build(
      {
        nodesWithAlias: 100,
        localComponents: 0,
        collectionNames: ['Primitives', 'Semantic'],
        layeredCollectionNames: ['Primitives', 'Semantic'],
      },
      { 'tokens/layer-violation': 0 },
    );

    expect(outcomeOf(s, 'tokens/layer-violation')).toMatchObject({
      status: 'not-applicable',
      reason: 'в файле нет своих компонентов',
    });
  });

  it('layer-violation при полном наборе условий и нуле — это «пусто», а не «не применимо»', () => {
    const s = build(
      {
        nodesWithAlias: 100,
        localComponents: 5,
        collectionNames: ['Primitives', 'Semantic'],
        layeredCollectionNames: ['Primitives', 'Semantic'],
        nodesInComponentMaster: 80,
        variablesByLayer: { primitives: 4, semantic: 9, component: 0, unmapped: 2 },
      },
      { 'tokens/layer-violation': 0 },
    );

    expect(outcomeOf(s, 'tokens/layer-violation')).toMatchObject({ status: 'empty' });
  });

  it('broken-alias при нуле называет число разрезолвленных биндингов', () => {
    const s = build({ nodesWithAlias: 1619 }, { 'tokens/broken-alias': 0 });

    const outcome = outcomeOf(s, 'tokens/broken-alias');
    expect(outcome.status).toBe('empty');
    // Без формата числа: toLocaleString('ru') ставит неразрывный пробел.
    if (outcome.status === 'empty') expect(outcome.note).toContain('привязок на месте');
  });

  it('detached-instance без мастеров — не применимо', () => {
    const s = build({ masterNames: 0 }, { 'components/detached-instance': 0 });
    expect(outcomeOf(s, 'components/detached-instance')).toMatchObject({
      status: 'not-applicable',
    });
  });
});

describe('сколько судить', () => {
  it('считает только применимые правила', () => {
    const s = build(
      { nodesWithAlias: 0, masterNames: 0, nodesTotal: 25804 },
      {
        'tokens/raw-fill': 38,
        'structure/default-name': 388,
        'tokens/layer-violation': 0,
        'components/detached-instance': 0,
      },
    );

    // 30 из raw-fill + 30 из default-name; неприменимые не считаются.
    expect(s.toJudge).toBe(60);
  });

  it('ноль к судейству, когда применимых срабатываний нет', () => {
    const s = build({ nodesWithAlias: 0 }, { 'tokens/layer-violation': 0 });
    expect(s.toJudge).toBe(0);
  });
});

describe('layer-violation: ноль обязан быть проверяемым', () => {
  const layered = {
    nodesWithAlias: 20744,
    localComponents: 9790,
    collectionNames: ['Primitives', 'Kit'],
    layeredCollectionNames: ['Primitives'],
    nodesInComponentMaster: 40000,
  };

  it('без примитивных переменных ноль — это «не применимо», а не «чисто»', () => {
    const s = build(
      { ...layered, variablesByLayer: { primitives: 0, semantic: 5, component: 0, unmapped: 90 } },
      { 'tokens/layer-violation': 0 },
    );

    expect(outcomeOf(s, 'tokens/layer-violation')).toEqual({
      status: 'not-applicable',
      reason: 'нет базовых токенов',
    });
  });

  it('без нод в мастерах ноль — тоже «не применимо»', () => {
    const s = build(
      {
        ...layered,
        nodesInComponentMaster: 0,
        variablesByLayer: { primitives: 12, semantic: 5, component: 0, unmapped: 3 },
      },
      { 'tokens/layer-violation': 0 },
    );

    expect(outcomeOf(s, 'tokens/layer-violation')).toMatchObject({ status: 'not-applicable' });
  });

  it('при полном наборе условий ноль — осмысленное «чисто» с цифрами', () => {
    const s = build(
      {
        ...layered,
        variablesByLayer: { primitives: 12, semantic: 40, component: 3, unmapped: 100 },
      },
      { 'tokens/layer-violation': 0 },
    );

    const outcome = outcomeOf(s, 'tokens/layer-violation');
    expect(outcome.status).toBe('empty');
    if (outcome.status === 'empty') {
      // Без формата числа: toLocaleString('ru') ставит неразрывный пробел,
      // и сравнение с обычным пробелом в литерале молча не сойдётся.
      expect(outcome.note).toContain('слоёв в компонентах');
      expect(outcome.note).toContain('прямых привязок к базовым токенам нет');
    }
  });

  it('текст про слои называет конкретные коллекции, а не «намёк есть»', () => {
    const s = build({
      ...layered,
      variablesByLayer: { primitives: 12, semantic: 40, component: 3, unmapped: 100 },
    });

    expect(s.layerNote).toContain('Коллекции: Primitives');
    expect(s.layerNote).toContain('По уровням разложено 55 токенов из 155');
  });
});

describe('layer-violation на боевых цифрах', () => {
  const realDs = {
    nodesWithAlias: 20744,
    localComponents: 9790,
    nodesInComponentMaster: 93114,
    collectionNames: ['Primitives', 'Brand Colors', 'Kit', 'System'],
    layeredCollectionNames: ['Primitives'],
  };

  it('1 размеченная переменная из 796 — не применимо, а не «чисто»', () => {
    // Боевой прогон по всему файлу ДС дал ровно эти цифры и подписал
    // результат как «чисто». Это и есть ложное «у вас всё хорошо».
    const s = build(
      {
        ...realDs,
        variablesByLayer: { primitives: 1, semantic: 0, component: 0, unmapped: 795 },
      },
      { 'tokens/layer-violation': 0 },
    );

    expect(outcomeOf(s, 'tokens/layer-violation')).toEqual({
      status: 'not-applicable',
      reason: 'нет смысловых токенов — не с чем сравнивать',
    });
  });

  it('без семантики правило бессмысленно даже при сотне примитивов', () => {
    const s = build(
      {
        ...realDs,
        variablesByLayer: { primitives: 100, semantic: 0, component: 0, unmapped: 10 },
      },
      { 'tokens/layer-violation': 0 },
    );

    expect(outcomeOf(s, 'tokens/layer-violation')).toMatchObject({ status: 'not-applicable' });
  });

  it('символическое покрытие при живой семантике — тоже не применимо', () => {
    const s = build(
      {
        ...realDs,
        variablesByLayer: { primitives: 3, semantic: 2, component: 0, unmapped: 791 },
      },
      { 'tokens/layer-violation': 0 },
    );

    expect(outcomeOf(s, 'tokens/layer-violation')).toMatchObject({
      status: 'not-applicable',
      reason: 'по уровням разложено 5 токенов из 796 — слишком мало',
    });
  });

  it('живая разметка и ноль нарушений — осмысленное «чисто»', () => {
    const s = build(
      {
        ...realDs,
        variablesByLayer: { primitives: 120, semantic: 300, component: 40, unmapped: 60 },
      },
      { 'tokens/layer-violation': 0 },
    );

    expect(outcomeOf(s, 'tokens/layer-violation')).toMatchObject({ status: 'empty' });
  });
});

describe('текст про слои не врёт', () => {
  it('пустая разметка при похожих именах предлагает проверить TOKEN_LAYERS', () => {
    // Боевой файл-потребитель: «Theme colors» похоже на слой, но точного
    // совпадения нет, и отчёт печатал «На слои легли коллекции: .» с пустым
    // списком.
    const s = build({
      collectionNames: ['Theme colors', 'Collection 1'],
      layeredCollectionNames: [],
      nodesWithAlias: 9220,
    });

    expect(s.layersReadable).toBe(false);
    expect(s.layerNote).toContain('Названия коллекций похожи на уровни');
    expect(s.layerNote).not.toContain('Коллекции: .');
  });

  it('символическое покрытие проговаривается словами', () => {
    const s = build({
      layeredCollectionNames: ['Primitives'],
      variablesByLayer: { primitives: 1, semantic: 0, component: 0, unmapped: 795 },
    });

    expect(s.layerNote).toContain('По уровням разложено 1 токен из 796');
    expect(s.layerNote).toContain('доли процента');
  });
});

describe('склонения', () => {
  it.each([
    [1, '1 токен'],
    [2, '2 токена'],
    [5, '5 токенов'],
    [11, '11 токенов'],
    [21, '21 токен'],
    [104, '104 токена'],
  ])('%i → «%s»', (primitives, expected) => {
    const s = build({
      layeredCollectionNames: ['Primitives'],
      variablesByLayer: { primitives, semantic: 0, component: 0, unmapped: 0 },
    });

    expect(s.layerNote).toContain(`разложено ${expected} из`);
  });
});
