/**
 * Хелпер проверки идемпотентности фикса — требование DoD (пункт 4).
 *
 * Проверка ручной быть не может: её забудут. Поэтому готовый хелпер
 * появляется раньше первого фикса.
 */
import { expect } from 'vitest';

/**
 * Применяет фикс дважды и требует, чтобы второй прогон ничего не изменил.
 *
 * @param snapshot сериализация состояния, по которой сравниваем
 * @param applyFix применение фикса к целевому объекту
 */
export function expectIdempotent<T>(
  target: T,
  applyFix: (t: T) => void,
  snapshot: (t: T) => unknown,
): void {
  applyFix(target);
  const afterFirst = structuredClone(snapshot(target));

  applyFix(target);
  const afterSecond = snapshot(target);

  expect(afterSecond).toEqual(afterFirst);
}
