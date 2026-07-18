import { appendFileSync } from 'node:fs';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';

const source = process.env.INPUT_SOURCE;
const config = process.env.INPUT_CONFIG || 'openpreflight.config.yaml';
const updates = process.env.INPUT_UPDATES || 'all';
if (!source) {
  process.stderr.write('::error::OpenPreflight action input "source" is required.\n');
  process.exit(2);
}
const invoke = (args: string[]): SpawnSyncReturns<Buffer> =>
  spawnSync(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', args, {
    stdio: 'inherit',
    shell: false,
    env: { ...process.env, CI: 'true' },
  });
let result = invoke([
  'openpreflight',
  '--config',
  config,
  'source',
  'add',
  '--type',
  'local',
  '--path',
  source,
  '--name',
  'GitHub Actions source',
  '--json',
]);
if (result.status !== 0) process.exit(result.status ?? 3);
result = invoke(['openpreflight', '--config', config, 'run', '--updates', updates, '--json']);
if (process.env.GITHUB_OUTPUT)
  appendFileSync(process.env.GITHUB_OUTPUT, 'report-directory=.openpreflight/runs\n');
process.exit(result.status ?? 3);
