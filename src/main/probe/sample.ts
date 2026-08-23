/**
 * Выборка для замера сигнала.
 *
 * Случайность обеспечивает пробник, а не человек: «возьмите штук тридцать»
 * на практике означает «первые тридцать», а они лежат на первой странице и
 * смещают оценку.
 *
 * Генератор seeded — повторный прогон на том же файле даёт ту же выборку.
 * Измерительный прибор обязан быть воспроизводимым, иначе спор о цифре
 * невозможно разрешить пересчётом.
 */

/** mulberry32 — короткий и достаточный для выборки PRNG. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Случайные `size` элементов без повторов. Меньше `size` элементов — вернуть все.
 * Порядок исходного массива не меняется: судить удобнее по документу.
 */
export function sample<T>(items: readonly T[], size: number, seed: number): T[] {
  if (items.length <= size) return [...items];

  const random = mulberry32(seed);
  const indices = items.map((_, i) => i);

  // Частичный Fisher–Yates: перемешиваем только первые size позиций.
  for (let i = 0; i < size; i++) {
    const j = i + Math.floor(random() * (indices.length - i));
    const a = indices[i];
    const b = indices[j];
    if (a === undefined || b === undefined) continue;
    indices[i] = b;
    indices[j] = a;
  }

  return indices
    .slice(0, size)
    .sort((x, y) => x - y)
    .map((i) => items[i])
    .filter((item): item is T => item !== undefined);
}
