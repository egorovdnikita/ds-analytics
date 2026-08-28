/**
 * Длина строки в байтах UTF-8.
 *
 * Считаем вручную: `TextEncoder` — часть DOM и Node, а plugin sandbox не
 * даёт гарантий на его наличие, и в `lib: ES2020` его типа тоже нет.
 *
 * Нужно везде, где данные упираются в лимит `pluginData`: длина строки в
 * символах там ничего не значит, кириллица весит вдвое больше латиницы.
 */
export function utf8ByteLength(value: string): number {
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
