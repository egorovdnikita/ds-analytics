import { describe, expect, it } from 'vitest';
import {
  HISTORY_LIMIT,
  loadHistory,
  saveHistory,
  SNAPSHOTS_KEY,
  type SnapshotGateway,
} from '../../src/main/storage/snapshots';
import type { Snapshot } from '../../src/shared/snapshot';

function gateway(initial = ''): SnapshotGateway & { stored: string } {
  return {
    stored: initial,
    getPluginData(key) {
      return key === SNAPSHOTS_KEY ? this.stored : '';
    },
    setPluginData(key, value) {
      if (key === SNAPSHOTS_KEY) this.stored = value;
    },
  };
}

function snap(over: Partial<Snapshot> = {}): Snapshot {
  return {
    v: 1,
    at: '2026-08-20T10:00:00.000Z',
    scope: 'страница',
    nodes: 1000,
    instances: 100,
    fromLibrary: 60,
    local: 30,
    unknown: 10,
    fills: 100,
    onTokens: 50,
    masters: 10,
    ...over,
  };
}

describe('хранение истории', () => {
  it('переживает круг сохранение → загрузка', () => {
    const g = gateway();
    saveHistory(g, [snap(), snap({ at: '2026-08-21T10:00:00.000Z' })]);

    expect(loadHistory(g)).toHaveLength(2);
  });

  it('пустой документ даёт пустую историю', () => {
    expect(loadHistory(gateway())).toEqual([]);
  });

  it('повреждённые данные не роняют плагин', () => {
    expect(loadHistory(gateway('{это не json'))).toEqual([]);
  });

  it('снимки чужой версии отбрасываются молча', () => {
    // Не ошибка файла, а ожидаемое следствие обновления плагина.
    const g = gateway(JSON.stringify([snap(), { v: 2, at: '2026-08-21', scope: 'страница' }]));

    expect(loadHistory(g)).toHaveLength(1);
  });

  it('мусор вместо массива не ломает чтение', () => {
    expect(loadHistory(gateway('{"nope":true}'))).toEqual([]);
  });

  it('при переполнении жертвует старыми точками, а не всей записью', () => {
    // В отличие от конфига здесь тихое урезание уместно: потерять старые
    // точки не страшно, уронить сохранение — значит потерять и новую.
    const many = Array.from({ length: 4000 }, (_, i) =>
      snap({ at: `2026-08-${String((i % 28) + 1).padStart(2, '0')}T10:00:00.000Z` }),
    );

    const kept = saveHistory(gateway(), many);

    expect(kept).toBeGreaterThan(0);
    expect(kept).toBeLessThan(many.length);
  });

  it('лимит истории задан и разумен', () => {
    expect(HISTORY_LIMIT).toBeGreaterThanOrEqual(10);
  });
});
