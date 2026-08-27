/**
 * История снимков в документе.
 *
 * Живёт в `documentPluginData`, то есть доступна всей команде и уезжает
 * вместе с файлом. Разбор недоверенный: данные мог записать плагин другой
 * версии, поэтому мусор отбрасывается, а не роняет плагин.
 */
import type { Snapshot } from '../../shared/snapshot';

export const SNAPSHOTS_KEY = 'adoption-snapshots';

/** Сколько снимков держим. Дальше история вытесняется по одному. */
export const HISTORY_LIMIT = 40;

/** Лимит pluginData — ~100 KB. Держим запас на служебные поля. */
const MAX_BYTES = 90 * 1024;

export interface SnapshotGateway {
  getPluginData(key: string): string;
  setPluginData(key: string, value: string): void;
}

function isSnapshot(value: unknown): value is Snapshot {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    item['v'] === 1 &&
    typeof item['at'] === 'string' &&
    typeof item['scope'] === 'string' &&
    typeof item['instances'] === 'number' &&
    typeof item['fromLibrary'] === 'number'
  );
}

/**
 * Читает историю.
 *
 * Снимки чужой версии отбрасываются молча — это не ошибка файла, а
 * ожидаемое следствие обновления плагина.
 */
export function loadHistory(gateway: SnapshotGateway): readonly Snapshot[] {
  const stored = gateway.getPluginData(SNAPSHOTS_KEY);
  if (stored === '') return [];

  try {
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSnapshot);
  } catch {
    return [];
  }
}

/** Длина строки в байтах UTF-8. TextEncoder в plugin sandbox не гарантирован. */
function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code <= 0x7f) bytes += 1;
    else if (code <= 0x7ff) bytes += 2;
    else if (code <= 0xffff) bytes += 3;
    else bytes += 4;
  }
  return bytes;
}

/**
 * Сохраняет историю, урезая её, пока не влезет в лимит.
 *
 * Здесь тихое урезание уместно, в отличие от конфига: потерять самые
 * старые точки тренда не страшно, а уронить сохранение — значит потерять
 * и новую точку тоже.
 */
export function saveHistory(gateway: SnapshotGateway, history: readonly Snapshot[]): number {
  let kept: readonly Snapshot[] = history;

  // Урезаем не по одному, а сразу до оценочного размера: снимки примерно
  // одинаковой длины, поэтому доля лимита к текущему размеру даёт хорошую
  // оценку. Отбрасывание по одному было квадратичным — на длинной истории
  // сохранение занимало секунды.
  while (kept.length > 0) {
    const serialized = JSON.stringify(kept);
    const bytes = utf8ByteLength(serialized);
    if (bytes <= MAX_BYTES) {
      gateway.setPluginData(SNAPSHOTS_KEY, serialized);
      return kept.length;
    }

    const estimate = Math.floor((kept.length * MAX_BYTES) / bytes);
    // Гарантируем прогресс: оценка может не уменьшить длину из-за округления.
    const nextLength = Math.min(estimate, kept.length - 1);
    kept = kept.slice(-Math.max(nextLength, 0));
  }

  gateway.setPluginData(SNAPSHOTS_KEY, '[]');
  return 0;
}
