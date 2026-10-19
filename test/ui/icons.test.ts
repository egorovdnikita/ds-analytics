import { describe, expect, it } from 'vitest';
import bodies from '../../src/ui/vendor/box-ui/icons.json';
import { ICON_NAMES } from '../../src/ui/icons';

const vendored: Record<string, string> = bodies;

describe('иконки Box UI', () => {
  it('каждая объявленная иконка завезена — и ничего лишнего', () => {
    // Расхождение значит, что список правили без `npm run sync:box-ui`:
    // в первом случае иконка отрисуется пустотой, во втором бандл везёт мёртвый груз.
    expect(Object.keys(vendored).sort()).toEqual([...ICON_NAMES].sort());
  });

  it('геометрия не зашивает цвет — красится токеном текста вокруг', () => {
    for (const [name, body] of Object.entries(vendored)) {
      expect(body, name).not.toMatch(/(fill|stroke)="#/i);
    }
  });

  it('у каждой иконки есть геометрия', () => {
    for (const [name, body] of Object.entries(vendored)) {
      expect(body.length, name).toBeGreaterThan(20);
    }
  });
});
