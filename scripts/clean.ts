import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
const targets = [
  'coverage',
  'dist',
  'artifacts',
  'playwright-report',
  'test-results',
  'apps/dashboard/dist',
];
for (const target of targets) {
  const path = resolve(target);
  if (!path.startsWith(`${resolve('.')}\\`) && !path.startsWith(`${resolve('.')}/`))
    throw new Error(`Unsafe clean target: ${path}`);
  await rm(path, { recursive: true, force: true });
}
process.stdout.write(`Removed generated build/test targets: ${targets.join(', ')}\n`);
