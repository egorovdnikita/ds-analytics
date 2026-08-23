import { describe, expect, it, beforeEach } from 'vitest';
import { IncrementalCache } from '../../src/main/scanner/cache';
import { frame, page, rectangle, resetIds, tree } from '../factories/node';

function propertyChange(id: string): NodeChange {
  return {
    type: 'PROPERTY_CHANGE',
    id,
    origin: 'LOCAL',
    node: rectangle({ id }),
    properties: ['fills'],
  } as unknown as NodeChange;
}

function createChange(node: SceneNode): NodeChange {
  return { type: 'CREATE', id: node.id, origin: 'LOCAL', node } as unknown as NodeChange;
}

function deleteChange(id: string): NodeChange {
  return {
    type: 'DELETE',
    id,
    origin: 'LOCAL',
    node: { removed: true, type: 'RECTANGLE', id },
  } as unknown as NodeChange;
}

describe('IncrementalCache', () => {
  beforeEach(resetIds);

  it('до первого полного скана требует полный скан', () => {
    const cache = new IncrementalCache();
    expect(cache.needsFullScan).toBe(true);

    cache.seed();
    expect(cache.needsFullScan).toBe(false);
  });

  it('помечает грязной изменённую ноду', () => {
    const cache = new IncrementalCache();
    cache.seed();
    cache.applyChanges([propertyChange('1:1')]);

    expect(cache.take()).toEqual({ dirty: ['1:1'], removed: [] });
  });

  it('при создании ноды помечает грязным и родителя', () => {
    const child = rectangle({ id: '2:2' });
    tree(frame({ id: '1:1' }), [child]);

    const cache = new IncrementalCache();
    cache.seed();
    cache.applyChanges([createChange(child)]);

    expect([...cache.take().dirty].sort()).toEqual(['1:1', '2:2']);
  });

  it('удалённая нода попадает в removed, а не в dirty', () => {
    const cache = new IncrementalCache();
    cache.seed();
    cache.applyChanges([propertyChange('1:1'), deleteChange('1:1')]);

    expect(cache.take()).toEqual({ dirty: [], removed: ['1:1'] });
  });

  it('take очищает накопленное', () => {
    const cache = new IncrementalCache();
    cache.seed();
    cache.applyChanges([propertyChange('1:1')]);

    cache.take();
    expect(cache.pendingCount).toBe(0);
    expect(cache.take()).toEqual({ dirty: [], removed: [] });
  });

  it('дедуплицирует повторные изменения одной ноды', () => {
    const cache = new IncrementalCache();
    cache.seed();
    cache.applyChanges([propertyChange('1:1'), propertyChange('1:1'), propertyChange('1:1')]);

    expect(cache.take().dirty).toEqual(['1:1']);
  });

  it('подписывается на страницу и ловит её изменения', () => {
    const listeners: Array<(e: NodeChangeEvent) => void> = [];
    const target = page({ id: '5:5' });
    (target as unknown as Record<string, unknown>)['on'] = (
      _type: string,
      cb: (e: NodeChangeEvent) => void,
    ) => listeners.push(cb);
    (target as unknown as Record<string, unknown>)['off'] = (
      _type: string,
      cb: (e: NodeChangeEvent) => void,
    ) => {
      const i = listeners.indexOf(cb);
      if (i >= 0) listeners.splice(i, 1);
    };

    const cache = new IncrementalCache();
    cache.seed();
    cache.observe(target);
    cache.observe(target); // повторная подписка не должна дублироваться

    expect(listeners).toHaveLength(1);
    expect(cache.trackedPageIds.has('5:5')).toBe(true);

    listeners[0]?.({ nodeChanges: [propertyChange('9:9')] });
    expect(cache.take().dirty).toEqual(['9:9']);

    cache.dispose();
    expect(listeners).toHaveLength(0);
  });

  it('reset снимает подписки и возвращает требование полного скана', () => {
    const listeners: Array<(e: NodeChangeEvent) => void> = [];
    const target = page({ id: '5:5' });
    (target as unknown as Record<string, unknown>)['on'] = (
      _t: string,
      cb: (e: NodeChangeEvent) => void,
    ) => listeners.push(cb);
    (target as unknown as Record<string, unknown>)['off'] = () => listeners.pop();

    const cache = new IncrementalCache();
    cache.seed();
    cache.observe(target);
    cache.applyChanges([propertyChange('1:1')]);

    cache.reset();

    expect(cache.needsFullScan).toBe(true);
    expect(cache.pendingCount).toBe(0);
    expect(cache.trackedPageIds.size).toBe(0);
    expect(listeners).toHaveLength(0);
  });
});
