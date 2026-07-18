import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts', 'tests/unit/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      include: ['packages/{core,configuration,database,journey-schema}/src/**/*.ts'],
      thresholds: { statements: 80, functions: 80, lines: 80, branches: 75 },
    },
  },
});
