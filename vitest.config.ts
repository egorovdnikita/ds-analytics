import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/main/rules/**/*.ts'],
      // Правило без теста не мержится (DoD). Порог делает это проверяемым.
      thresholds: { lines: 90, functions: 90, branches: 80, statements: 90 },
    },
  },
});
