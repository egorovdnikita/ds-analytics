import { describe, expect, it } from 'vitest';
import { VariableUsageIndex } from '../../src/main/analysis/usage';

const place = (nodeId: string, pageId = 'p:1') => ({ nodeId, pageId, name: nodeId });

function resolveAll(id: string) {
  return { name: `token-${id}`, collectionName: 'Brand' };
}

describe('обратный индекс токенов', () => {
  it('считает ноды и страницы, где токен встретился', () => {
    const index = new VariableUsageIndex();
    index.add('V:1', place('a', 'p:1'));
    index.add('V:1', place('b', 'p:2'));
    index.add('V:1', place('c', 'p:2'));

    const [usage] = index.describe(resolveAll, 10);

    expect(usage?.nodes).toBe(3);
    expect(usage?.pages).toBe(2);
  });

  it('хранит примеры мест, а не все — счётчик при этом точный', () => {
    // Все места значат десятки тысяч записей в UI ради списка, который
    // никто не пролистает.
    const index = new VariableUsageIndex();
    for (let i = 0; i < 500; i++) index.add('V:1', place(`n${i}`));

    const [usage] = index.describe(resolveAll, 10);

    expect(usage?.nodes).toBe(500);
    expect(usage?.places.length).toBeLessThan(20);
  });

  it('сортирует по востребованности и режет хвост', () => {
    const index = new VariableUsageIndex();
    index.add('V:rare', place('a'));
    for (let i = 0; i < 5; i++) index.add('V:common', place(`c${i}`));

    const usage = index.describe(resolveAll, 1);

    expect(usage).toHaveLength(1);
    expect(usage[0]?.id).toBe('V:common');
  });

  it('нерезолвящиеся токены пропускаются, а не показываются пустыми', () => {
    const index = new VariableUsageIndex();
    index.add('V:1', place('a'));
    index.add('V:404', place('b'));

    const usage = index.describe((id) => (id === 'V:404' ? null : resolveAll(id)), 10);

    expect(usage.map((item) => item.id)).toEqual(['V:1']);
  });
});

describe('деление нод по локальности токена', () => {
  it('нода с локальной и библиотечной привязкой считается локальной', () => {
    // Иначе сумма долей превысила бы число нод, и покрытие показало
    // больше ста процентов.
    const index = new VariableUsageIndex();
    index.add('V:local', place('shared'));
    index.add('V:lib', place('shared'));

    const split = index.splitByLocality((id) => id === 'V:local');

    expect(split).toEqual({ onLocal: 1, onLibrary: 0 });
  });

  it('одна нода с двумя библиотечными токенами не задваивается', () => {
    const index = new VariableUsageIndex();
    index.add('V:a', place('one'));
    index.add('V:b', place('one'));

    expect(index.splitByLocality(() => false)).toEqual({ onLocal: 0, onLibrary: 1 });
  });

  it('считает точно и за пределами хранимых мест', () => {
    // Мест на токен хранится ограниченное число. Если делить по ним,
    // покрытие занижается — заголовочная цифра отчёта обязана быть точной.
    const index = new VariableUsageIndex();
    for (let i = 0; i < 500; i++) index.add('V:lib', place(`n${i}`));

    expect(index.splitByLocality(() => false)).toEqual({ onLocal: 0, onLibrary: 500 });
  });

  it('пустой индекс не ломает подсчёт', () => {
    expect(new VariableUsageIndex().splitByLocality(() => true)).toEqual({
      onLocal: 0,
      onLibrary: 0,
    });
  });
});
