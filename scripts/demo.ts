import { createWriteStream } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { ZipArchive } from 'archiver';
import { nanoid } from 'nanoid';
import { loadConfig } from '@openpreflight/configuration';
import { OpenPreflightDatabase, ensureStorage } from '@openpreflight/database';

const root = resolve('.');
const compose = resolve('docker/fixtures/demo.compose.yml');
const demo = resolve('.openpreflight/demo');
const source = join(demo, 'source');
const update = join(demo, 'openpreflight-demo-v2.zip');
function command(file: string, args: string[], allow = [0]): string {
  const result = spawnSync(file, args, {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (!allow.includes(result.status ?? -1))
    throw new Error(`${file} ${args.join(' ')} failed (${result.status}):\n${result.stderr}`);
  return result.stdout;
}
const docker = (args: string[]) =>
  command('docker', [
    'compose',
    '--project-name',
    'openpreflight-demo-source',
    '--file',
    compose,
    ...args,
  ]);
async function zipUpdate(): Promise<void> {
  await new Promise<void>((done, fail) => {
    const output = createWriteStream(update, { mode: 0o600 });
    const archive = new ZipArchive({ zlib: { level: 9 } });
    output.once('close', done);
    output.once('error', fail);
    archive.once('error', fail);
    archive.pipe(output);
    archive.directory(
      resolve('fixtures/plugins/broken-plugin-v2/openpreflight-demo'),
      'openpreflight-demo',
    );
    void archive.finalize();
  });
}

async function main(): Promise<void> {
  command('docker', ['info', '--format', '{{.ServerVersion}}']);
  await rm(demo, { recursive: true, force: true });
  await mkdir(source, { recursive: true });
  try {
    docker(['up', '--detach', '--wait', '--wait-timeout', '120']);
    const wp = (args: string[]) => docker(['run', '--rm', 'wpcli', 'wp', ...args, '--allow-root']);
    wp([
      'core',
      'install',
      '--url=http://127.0.0.1:8089',
      '--title=OpenPreflight Demo Store',
      '--admin_user=openpreflight_admin',
      '--admin_password=OpenPreflight-Local-Only-123!',
      '--admin_email=test@example.invalid',
      '--skip-email',
    ]);
    wp(['plugin', 'install', 'woocommerce', '--version=10.9.4', '--activate']);
    docker([
      'run',
      '--rm',
      '--entrypoint',
      'cp',
      'wpcli',
      '-a',
      '/workspace/fixtures/plugins/safe-plugin-v1/openpreflight-demo',
      '/var/www/html/wp-content/plugins/openpreflight-demo',
    ]);
    wp(['plugin', 'activate', 'openpreflight-demo']);
    wp([
      'eval',
      '$p=new WC_Product_Simple();$p->set_name("OpenPreflight Product");$p->set_slug("openpreflight-product");$p->set_regular_price("10");$p->set_status("publish");$p->set_catalog_visibility("visible");$p->set_stock_status("instock");$p->save();',
    ]);
    wp(['option', 'update', 'woocommerce_store_address', '1 Test Street']);
    wp(['option', 'update', 'woocommerce_store_city', 'Testville']);
    wp(['option', 'update', 'woocommerce_default_country', 'US:CA']);
    wp(['option', 'update', 'permalink_structure', '/%postname%/']);
    wp(['rewrite', 'flush', '--hard']);
    wp(['db', 'export', '/var/www/html/database.sql']);
  } finally {
    docker(['down', '--volumes', '--remove-orphans']);
  }
  await zipUpdate();
  const config = await loadConfig();
  const storage = await ensureStorage(resolve(config.storage.directory));
  const db = new OpenPreflightDatabase(storage.databasePath);
  db.migrate();
  const sourceId = `src_demo_${nanoid(8)}`;
  const runId = `run_demo_${nanoid(8)}`;
  const jobId = `job_demo_${nanoid(8)}`;
  const now = new Date().toISOString();
  db.raw
    .prepare(
      'INSERT INTO sources(id,type,name,config_json,created_at,updated_at) VALUES(?,?,?,?,?,?)',
    )
    .run(sourceId, 'local', 'OpenPreflight Demo Store', JSON.stringify({ path: source }), now, now);
  db.createRun(runId, sourceId);
  db.enqueue({
    id: jobId,
    runId,
    payload: { type: 'run', sourceId, updates: update },
    deadlineAt: new Date(Date.now() + 30 * 60_000),
  });
  db.close();
  const worker = spawn(process.execPath, ['--import', 'tsx', 'apps/worker/src/index.ts'], {
    cwd: root,
    env: {
      ...process.env,
      OPENPREFLIGHT_TEST_EMAIL: 'customer@example.invalid',
      OPENPREFLIGHT_WP_USERNAME: 'openpreflight_admin',
      OPENPREFLIGHT_WP_PASSWORD: 'OpenPreflight-Local-Only-123!',
    },
    windowsHide: true,
    stdio: 'inherit',
  });
  const monitor = new OpenPreflightDatabase(storage.databasePath);
  let stage = 'QUEUED';
  const deadline = Date.now() + 30 * 60_000;
  while (!['PASSED', 'FAILED', 'ERROR', 'CANCELLED'].includes(stage) && Date.now() < deadline) {
    await new Promise((done) => setTimeout(done, 1_000));
    stage = (
      monitor.raw.prepare('SELECT stage FROM runs WHERE id=?').get(runId) as { stage: string }
    ).stage;
    process.stdout.write(`\rDemo run ${runId}: ${stage.padEnd(26)}`);
  }
  process.stdout.write('\n');
  worker.kill('SIGTERM');
  monitor.close();
  const artifacts = join(config.storage.directory, 'runs', runId, 'reports', 'report.html');
  process.stdout.write(`Demo artifacts: ${resolve(artifacts)}\n`);
  if (stage === 'FAILED') {
    process.stdout.write('Expected regressions detected. Demo exits with regression code 1.\n');
    process.exitCode = 1;
  } else
    throw new Error(`Demo did not produce the expected FAILED verdict; final stage was ${stage}.`);
}
main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 3;
});
