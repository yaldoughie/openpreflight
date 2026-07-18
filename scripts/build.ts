import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build as bundle } from 'esbuild';
import { build as buildVite } from 'vite';

const root = resolve('.');
const targets = [
  { entry: 'apps/cli/src/index.ts', output: 'apps/cli/dist/index.js' },
  { entry: 'apps/server/src/main.ts', output: 'apps/server/dist/server.js' },
  { entry: 'apps/worker/src/index.ts', output: 'apps/worker/dist/worker.js' },
  {
    entry: 'integrations/github-action/src/index.ts',
    output: 'integrations/github-action/dist/index.js',
  },
] as const;

await Promise.all(
  targets.map(async ({ output }) => rm(resolve(output, '..'), { recursive: true, force: true })),
);
for (const target of targets) {
  await bundle({
    absWorkingDir: root,
    entryPoints: [target.entry],
    outfile: target.output,
    bundle: true,
    platform: 'node',
    target: 'node24',
    format: 'esm',
    banner: {
      js: "import { createRequire as __openPreflightCreateRequire } from 'node:module'; const require = __openPreflightCreateRequire(import.meta.url);",
    },
    sourcemap: true,
    legalComments: 'linked',
    external: ['better-sqlite3', 'playwright', '@aws-sdk/client-s3'],
  });
}
await buildVite({
  root: resolve('apps/dashboard'),
  configFile: resolve('apps/dashboard/vite.config.ts'),
});
process.stdout.write('Built CLI, server, worker, GitHub Action, and dashboard.\n');
