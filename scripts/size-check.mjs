import { statSync } from 'node:fs';

/**
 * Целевой размер UI-бандла из паспорта проекта — 500 KB.
 * Без автопроверки бюджет не соблюдается никогда, поэтому сборка падает.
 */
const LIMIT_BYTES = 500 * 1024;
const TARGET = 'dist/index.html';

const size = statSync(TARGET).size;
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

if (size > LIMIT_BYTES) {
  console.error(`✗ ${TARGET}: ${kb(size)} — превышен бюджет ${kb(LIMIT_BYTES)}`);
  process.exit(1);
}
console.log(`✓ ${TARGET}: ${kb(size)} из ${kb(LIMIT_BYTES)}`);
