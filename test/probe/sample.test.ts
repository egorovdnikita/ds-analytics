import { describe, expect, it } from 'vitest';
import { sample } from '../../src/main/probe/sample';

const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i);

describe('sample', () => {
  it('меньше запрошенного — отдаёт всё', () => {
    expect(sample([1, 2, 3], 30, 1)).toEqual([1, 2, 3]);
  });

  it('отдаёт ровно запрошенное количество', () => {
    expect(sample(range(1000), 30, 1)).toHaveLength(30);
  });

  it('не повторяет элементы', () => {
    const picked = sample(range(1000), 30, 7);
    expect(new Set(picked).size).toBe(30);
  });

  it('воспроизводим при том же seed', () => {
    expect(sample(range(1000), 30, 42)).toEqual(sample(range(1000), 30, 42));
  });

  it('разный seed даёт разную выборку', () => {
    expect(sample(range(1000), 30, 1)).not.toEqual(sample(range(1000), 30, 2));
  });

  it('сохраняет порядок документа', () => {
    const picked = sample(range(1000), 30, 3);
    expect([...picked].sort((a, b) => a - b)).toEqual(picked);
  });

  it('берёт не только начало массива', () => {
    // Ровно то смещение, ради устранения которого выборка и делается:
    // «возьмите тридцать штук» на практике значит «первые тридцать».
    const picked = sample(range(1000), 30, 5);
    expect(Math.max(...picked)).toBeGreaterThan(500);
  });

  it('распределён по всему массиву, а не сгруппирован', () => {
    // Грубая проверка равномерности: при честном разбросе примерно половина
    // выборки должна лежать во второй половине массива.
    const picked = sample(range(1000), 100, 11);
    const inSecondHalf = picked.filter((v) => v >= 500).length;
    expect(inSecondHalf).toBeGreaterThan(30);
    expect(inSecondHalf).toBeLessThan(70);
  });
});
