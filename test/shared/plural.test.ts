import { describe, expect, it } from 'vitest';
import { plural, withCount } from '../../src/shared/plural';
import { plain } from '../helpers/text';

describe('склонения', () => {
  it.each([
    [1, 'копия'],
    [2, 'копии'],
    [4, 'копии'],
    [5, 'копий'],
    [11, 'копий'],
    [14, 'копий'],
    [21, 'копия'],
    [22, 'копии'],
    [101, 'копия'],
    [111, 'копий'],
    [222, 'копии'],
    [0, 'копий'],
  ])('%i → «%s»', (count, expected) => {
    expect(plural(count, 'копия', 'копии', 'копий')).toBe(expected);
  });

  it('склеивает число со словом', () => {
    expect(withCount(1, 'слой', 'слоя', 'слоёв')).toBe('1 слой');
    expect(withCount(3, 'слой', 'слоя', 'слоёв')).toBe('3 слоя');
  });

  it('форматирует крупные числа по-русски', () => {
    expect(plain(withCount(20622, 'слой', 'слоя', 'слоёв'))).toBe('20 622 слоя');
  });
});
