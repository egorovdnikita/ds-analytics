/**
 * Русские склонения по числу.
 *
 * Без них отчёт выглядит машинным: «222 копий», «1 токенов». Мелочь,
 * которую замечают все и никто не называет вслух.
 */
export function plural(count: number, one: string, few: string, many: string): string {
  const mod100 = Math.abs(count) % 100;
  if (mod100 >= 11 && mod100 <= 14) return many;

  const mod10 = mod100 % 10;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

/** Число с правильным словом: «222 копии». Число форматируется по-русски. */
export function withCount(count: number, one: string, few: string, many: string): string {
  return `${count.toLocaleString('ru')} ${plural(count, one, few, many)}`;
}
