import { describe, expect, it, beforeEach } from 'vitest';
import {
  frame,
  instance,
  rectangle,
  resetIds,
  solidPaint,
  text,
  tree,
  variableAlias,
} from './node';
import { expectIdempotent } from './idempotency';

describe('фабрика моков нод', () => {
  beforeEach(resetIds);

  it('выдаёт предсказуемые id после сброса', () => {
    expect(rectangle().id).toBe('1:1');
    expect(rectangle().id).toBe('2:2');
  });

  it('заполняет дефолты и принимает переопределения', () => {
    const node = text({ name: 'Заголовок', characters: 'TODO' });
    expect(node.type).toBe('TEXT');
    expect(node.name).toBe('Заголовок');
    expect(node.characters).toBe('TODO');
    expect(node.visible).toBe(true);
  });

  it('поддерживает сырые заливки и биндинг переменной', () => {
    const raw = rectangle({ fills: [solidPaint(1, 0, 0)] });
    expect(raw.fills).toEqual([expect.objectContaining({ type: 'SOLID' })]);

    const bound = rectangle({ boundVariables: { fills: [variableAlias('VariableID:1:2')] } });
    expect(bound.boundVariables?.fills?.[0]?.id).toBe('VariableID:1:2');
  });

  it('связывает дерево в обе стороны', () => {
    const child = rectangle({ name: 'Rectangle 12' });
    const parent = tree(frame({ name: 'Card', layoutMode: 'VERTICAL' }), [child]);

    expect(parent.children).toHaveLength(1);
    expect(child.parent).toBe(parent);
  });

  it('отдаёт мастер инстанса через async-API', async () => {
    const node = instance({ mainComponentId: '10:10' });
    await expect(node.getMainComponentAsync()).resolves.toMatchObject({ id: '10:10' });
  });
});

describe('хелпер идемпотентности', () => {
  it('пропускает фикс, который стабилен при повторе', () => {
    const node = { name: '  Card  ' };
    expectIdempotent(
      node,
      (n) => (n.name = n.name.trim()),
      (n) => n.name,
    );
  });

  it('ловит фикс, который меняет состояние при повторе', () => {
    const node = { name: 'Card' };
    expect(() =>
      expectIdempotent(
        node,
        (n) => (n.name = `${n.name}!`),
        (n) => n.name,
      ),
    ).toThrow();
  });
});
