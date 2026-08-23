import { describe, expect, it, beforeEach } from 'vitest';
import { UndoJournal } from '../../src/main/fixes/journal';
import type { FixAction } from '../../src/shared/types';
import { rectangle, resetIds, solidPaint } from '../factories/node';

function action(over: Partial<FixAction> & Pick<FixAction, 'nodeId' | 'property'>): FixAction {
  return {
    issueRuleId: 'tokens/raw-fill',
    previousValue: null,
    nextValue: null,
    description: 'test',
    ...over,
  };
}

/** Резолвер по карте — заменяет figma.getNodeByIdAsync в тестах. */
function resolverFor(nodes: Record<string, unknown>) {
  return (id: string) => Promise.resolve((nodes[id] ?? null) as BaseNode | null);
}

describe('UndoJournal', () => {
  beforeEach(resetIds);

  it('возвращает свойство к предыдущему значению', async () => {
    const node = rectangle({ id: '1:1', fills: [solidPaint(1, 0, 0)] });
    const previous = node.fills;
    (node as { fills: unknown }).fills = [solidPaint(0, 0, 1)];

    const journal = new UndoJournal();
    journal.record(action({ nodeId: '1:1', property: 'fills', previousValue: previous }));

    const report = await journal.revert(resolverFor({ '1:1': node }));

    expect(report).toEqual({ reverted: 1, skipped: 0, skippedNodeIds: [] });
    expect(node.fills).toBe(previous);
  });

  it('откатывает в обратном порядке — побеждает самое раннее значение', async () => {
    const node = rectangle({ id: '1:1', name: 'третье' });

    const journal = new UndoJournal();
    journal.recordAll([
      action({ nodeId: '1:1', property: 'name', previousValue: 'первое' }),
      action({ nodeId: '1:1', property: 'name', previousValue: 'второе' }),
    ]);

    await journal.revert(resolverFor({ '1:1': node }));

    expect(node.name).toBe('первое');
  });

  it('пропускает удалённую ноду, но откатывает остальные', async () => {
    const alive = rectangle({ id: '1:1', name: 'после' });
    const dead = rectangle({ id: '2:2', name: 'после' });
    (dead as { removed: boolean }).removed = true;

    const journal = new UndoJournal();
    journal.recordAll([
      action({ nodeId: '1:1', property: 'name', previousValue: 'до' }),
      action({ nodeId: '2:2', property: 'name', previousValue: 'до' }),
      action({ nodeId: '3:3', property: 'name', previousValue: 'до' }),
    ]);

    const report = await journal.revert(resolverFor({ '1:1': alive, '2:2': dead }));

    expect(alive.name).toBe('до');
    expect(dead.name).toBe('после');
    expect(report.reverted).toBe(1);
    expect(report.skippedNodeIds).toEqual(['3:3', '2:2']);
  });

  it('очищается после отката — повторный откат ничего не делает', async () => {
    const node = rectangle({ id: '1:1', name: 'после' });
    const journal = new UndoJournal();
    journal.record(action({ nodeId: '1:1', property: 'name', previousValue: 'до' }));

    await journal.revert(resolverFor({ '1:1': node }));
    expect(journal.size).toBe(0);

    (node as { name: string }).name = 'изменено вручную';
    const second = await journal.revert(resolverFor({ '1:1': node }));

    expect(second.reverted).toBe(0);
    expect(node.name).toBe('изменено вручную');
  });

  it('пустой журнал откатывается без ошибок', async () => {
    const report = await new UndoJournal().revert(resolverFor({}));
    expect(report).toEqual({ reverted: 0, skipped: 0, skippedNodeIds: [] });
  });
});
