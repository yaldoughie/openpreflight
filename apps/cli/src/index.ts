#!/usr/bin/env node
import { access, copyFile, readdir, readFile, rm, statfs } from 'node:fs/promises';
import { constants } from 'node:fs';
import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import { freemem, totalmem } from 'node:os';
import { resolve } from 'node:path';
import { Command } from 'commander';
import { nanoid } from 'nanoid';
import { loadConfig, type OpenPreflightConfig } from '@openpreflight/configuration';
import { OpenPreflightError, exitCodeFor, redactValue } from '@openpreflight/core';
import {
  OpenPreflightDatabase,
  encryptCredential,
  ensureStorage,
  loadOrCreateKey,
} from '@openpreflight/database';
import { parseJourney } from '@openpreflight/journey-schema';
import { createServer } from '@openpreflight/server';
import { ArchiveSourceAdapter, LocalWordPressAdapter } from '@openpreflight/source-adapters';

const VERSION = '1.0.0';
interface GlobalOptions {
  json?: boolean;
  config?: string;
}
function output(value: unknown, human?: string): void {
  const options = program.opts<GlobalOptions>();
  process.stdout.write(
    options.json
      ? `${JSON.stringify(redactValue(value), null, 2)}\n`
      : `${human ?? JSON.stringify(redactValue(value), null, 2)}\n`,
  );
}
function execute(
  file: string,
  args: readonly string[],
  timeout = 10_000,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((done) => {
    const child = spawn(file, [...args], { shell: false, windowsHide: true });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill(), timeout);
    child.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });
    child.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });
    child.once('error', (error) => {
      clearTimeout(timer);
      done({ code: -1, stdout, stderr: error.message });
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      done({ code: code ?? -1, stdout, stderr });
    });
  });
}
async function context(): Promise<{
  config: OpenPreflightConfig;
  db: OpenPreflightDatabase;
  storage: Awaited<ReturnType<typeof ensureStorage>>;
}> {
  const config = await loadConfig(program.opts<GlobalOptions>().config);
  const storage = await ensureStorage(resolve(config.storage.directory));
  const db = new OpenPreflightDatabase(storage.databasePath);
  db.migrate();
  return { config, db, storage };
}
async function withDatabase<T>(
  action: (value: Awaited<ReturnType<typeof context>>) => Promise<T>,
): Promise<T> {
  const value = await context();
  try {
    return await action(value);
  } finally {
    value.db.close();
  }
}
function addJson(command: Command): Command {
  return command.option('--json', 'Emit machine-readable JSON.');
}

const program = new Command()
  .name('openpreflight')
  .description('Test every WordPress update before your users do.')
  .version(VERSION, '-v, --version')
  .option('--json', 'Emit machine-readable JSON.')
  .option('-c, --config <file>', 'Configuration file.', 'openpreflight.config.yaml')
  .showHelpAfterError();

addJson(program.command('init').description('Initialize local configuration and storage.'))
  .option('--force', 'Replace only generated default files.')
  .action(async (options) => {
    const configPath = resolve(program.opts<GlobalOptions>().config ?? 'openpreflight.config.yaml');
    try {
      await access(configPath, constants.F_OK);
      if (!options.force)
        throw new OpenPreflightError(
          `Configuration already exists at ${configPath}.`,
          'input',
          'INIT',
          ['Use --force only if replacing the default is intended.'],
        );
    } catch (error) {
      if (
        !(error instanceof OpenPreflightError) &&
        (error as NodeJS.ErrnoException).code !== 'ENOENT'
      )
        throw error;
      if (error instanceof OpenPreflightError) throw error;
    }
    const example = resolve('openpreflight.config.yaml');
    if (configPath !== example) await copyFile(example, configPath);
    const config = await loadConfig(configPath);
    const storage = await ensureStorage(resolve(config.storage.directory));
    const db = new OpenPreflightDatabase(storage.databasePath);
    db.migrate();
    await loadOrCreateKey(storage.keyPath, process.env.OPENPREFLIGHT_ENCRYPTION_KEY);
    db.close();
    output(
      { configuration: configPath, storage: resolve(config.storage.directory) },
      `Initialized OpenPreflight.\nConfiguration: ${configPath}\nStorage: ${resolve(config.storage.directory)}`,
    );
  });

addJson(
  program.command('doctor').description('Check every local prerequisite and print exact remedies.'),
).action(async () => {
  const checks: Array<{ id: string; ok: boolean; detail: string; remedy?: string }> = [];
  const commandCheck = async (id: string, file: string, args: string[], remedy: string) => {
    const result = await execute(file, args);
    const lines = `${result.stdout}\n${result.stderr}`
      .trim()
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    checks.push({
      id,
      ok: result.code === 0,
      detail: lines.find((line) => !/^Warning:/i.test(line)) ?? lines[0] ?? 'Unavailable',
      ...(result.code === 0 ? {} : { remedy }),
    });
  };
  await commandCheck(
    'node',
    process.execPath,
    ['--version'],
    'Install Node.js 24 LTS from nodejs.org.',
  );
  await commandCheck('docker', 'docker', ['--version'], 'Install Docker Desktop or Docker Engine.');
  await commandCheck('compose', 'docker', ['compose', 'version'], 'Install Docker Compose v2.');
  await commandCheck(
    'daemon',
    'docker',
    ['info', '--format', '{{.ServerVersion}}'],
    'Start Docker Desktop or the Docker daemon.',
  );
  await commandCheck(
    'php',
    'php',
    ['-r', 'echo PHP_VERSION;'],
    'Install PHP 8.1+ for plugin development.',
  );
  if (process.platform === 'win32') {
    await commandCheck(
      'pnpm',
      process.env.ComSpec ?? 'cmd.exe',
      ['/d', '/s', '/c', 'corepack pnpm --version'],
      'Enable Corepack and install the pnpm version pinned in package.json.',
    );
    await commandCheck(
      'composer',
      process.env.ComSpec ?? 'cmd.exe',
      ['/d', '/s', '/c', 'composer --version'],
      'Install Composer 2 for WordPress Agent development.',
    );
  } else {
    await commandCheck(
      'pnpm',
      'pnpm',
      ['--version'],
      'Enable Corepack and install the pnpm version pinned in package.json.',
    );
    await commandCheck(
      'composer',
      'composer',
      ['--version'],
      'Install Composer 2 for WordPress Agent development.',
    );
  }
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  checks.push({
    id: 'node-lts',
    ok: nodeMajor >= 24,
    detail: process.version,
    ...(nodeMajor >= 24
      ? {}
      : { remedy: 'Upgrade to Node.js 24 LTS before release verification.' }),
  });
  try {
    const { config, db } = await context();
    db.raw.prepare('SELECT sqlite_version() AS version').get();
    db.close();
    await access(resolve(config.storage.directory), constants.W_OK);
    checks.push({ id: 'storage', ok: true, detail: resolve(config.storage.directory) });
    checks.push({ id: 'sqlite', ok: true, detail: 'migration and query succeeded' });
    const disk = await statfs(resolve(config.storage.directory));
    const availableBytes = Number(disk.bavail) * Number(disk.bsize);
    checks.push({
      id: 'disk',
      ok: availableBytes >= 5 * 1024 ** 3,
      detail: `${(availableBytes / 1024 ** 3).toFixed(1)} GiB available`,
      ...(availableBytes >= 5 * 1024 ** 3
        ? {}
        : { remedy: 'Free at least 5 GiB or move storage.directory to a larger volume.' }),
    });
  } catch (error) {
    checks.push({
      id: 'storage',
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
      remedy: 'Run openpreflight init in a writable directory.',
    });
  }
  const availableMemory = freemem();
  checks.push({
    id: 'memory',
    ok: availableMemory >= 2 * 1024 ** 3,
    detail: `${(availableMemory / 1024 ** 3).toFixed(1)} GiB available of ${(totalmem() / 1024 ** 3).toFixed(1)} GiB`,
    ...(availableMemory >= 2 * 1024 ** 3
      ? {}
      : { remedy: 'Close memory-intensive applications or reduce docker.memoryLimit.' }),
  });
  try {
    const { chromium } = await import('playwright');
    await access(chromium.executablePath(), constants.X_OK);
    checks.push({ id: 'browser', ok: true, detail: chromium.executablePath() });
  } catch (error) {
    checks.push({
      id: 'browser',
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
      remedy: 'Run pnpm exec playwright install chromium.',
    });
  }
  const port = await new Promise<boolean>((done) => {
    const socket = createConnection({ host: '127.0.0.1', port: 4173 });
    socket.once('connect', () => {
      socket.destroy();
      done(false);
    });
    socket.once('error', () => done(true));
  });
  checks.push({
    id: 'port-4173',
    ok: port,
    detail: port ? 'available' : 'already in use',
    ...(port ? {} : { remedy: 'Change server.port or stop the process using port 4173.' }),
  });
  const ok = checks.every((check) => check.ok);
  output(
    { ok, checks },
    checks
      .map(
        (check) =>
          `${check.ok ? '✓' : '✗'} ${check.id}: ${check.detail}${check.remedy ? `\n  Remedy: ${check.remedy}` : ''}`,
      )
      .join('\n'),
  );
  if (!ok) process.exitCode = 3;
});

program
  .command('serve')
  .description('Start the local API and dashboard.')
  .option('--host <host>')
  .option('--port <port>')
  .action(async (options) => {
    const overrides = {
      server: {
        ...(options.host ? { host: options.host } : {}),
        ...(options.port ? { port: Number(options.port) } : {}),
      },
    } as Partial<OpenPreflightConfig>;
    const config = await loadConfig(program.opts<GlobalOptions>().config, overrides);
    const server = await createServer(config);
    await server.listen(config.server);
    output(
      { url: `http://${config.server.host}:${config.server.port}` },
      `OpenPreflight is listening on http://${config.server.host}:${config.server.port}`,
    );
  });

const source = program.command('source').description('Manage WordPress sources.');
addJson(source.command('list').description('List configured sources.')).action(async () =>
  withDatabase(async ({ db }) => {
    const rows = db.raw
      .prepare(
        'SELECT id,type,name,created_at AS createdAt FROM sources WHERE deleted_at IS NULL ORDER BY name',
      )
      .all();
    output(
      rows,
      rows.length
        ? rows
            .map((row) => {
              const value = row as { id: string; type: string; name: string };
              return `${value.id}\t${value.type}\t${value.name}`;
            })
            .join('\n')
        : 'No sources configured. Run openpreflight source add --type local --path <wordpress-path>.',
    );
  }),
);
addJson(source.command('add').description('Add a source without modifying it.'))
  .requiredOption('--type <type>', 'local, archive, or agent')
  .option('--path <path>')
  .option('--url <url>')
  .option('--token <token>')
  .option('--name <name>')
  .option('--allow-http-local')
  .action(async (options) =>
    withDatabase(async ({ db, storage }) => {
      if (!['local', 'archive', 'agent'].includes(options.type))
        throw new OpenPreflightError(
          'Source type must be local, archive, or agent.',
          'input',
          'SOURCE_ADD',
        );
      const id = `src_${nanoid(12)}`;
      const name = options.name ?? options.path ?? options.url ?? id;
      const config =
        options.type === 'agent'
          ? { url: options.url, allowHttpLocal: Boolean(options.allowHttpLocal) }
          : { path: options.path };
      if (
        (options.type === 'agent' && (!options.url || !options.token)) ||
        (options.type !== 'agent' && !options.path)
      )
        throw new OpenPreflightError(
          'The selected source type is missing required flags.',
          'input',
          'SOURCE_ADD',
          ['Local/archive: --path. Agent: --url and --token.'],
        );
      const now = new Date().toISOString();
      db.raw
        .prepare(
          'INSERT INTO sources(id,type,name,config_json,created_at,updated_at) VALUES(?,?,?,?,?,?)',
        )
        .run(id, options.type, name, JSON.stringify(config), now, now);
      if (options.token) {
        const key = await loadOrCreateKey(
          storage.keyPath,
          process.env.OPENPREFLIGHT_ENCRYPTION_KEY,
        );
        db.raw
          .prepare(
            'INSERT INTO source_credentials(source_id,encrypted_value,updated_at) VALUES(?,?,?)',
          )
          .run(id, encryptCredential(options.token, key, id), now);
      }
      output({ id, type: options.type, name }, `Added source ${id} (${name}).`);
    }),
  );
addJson(source.command('inspect <source>').description('Validate and inspect a source.')).action(
  async (id) =>
    withDatabase(async ({ db }) => {
      const row = db.raw
        .prepare('SELECT id,type,config_json FROM sources WHERE id=? AND deleted_at IS NULL')
        .get(id) as { id: string; type: string; config_json: string } | undefined;
      if (!row) throw new OpenPreflightError(`Source not found: ${id}`, 'input', 'SOURCE_INSPECT');
      if (row.type === 'agent')
        throw new OpenPreflightError(
          'Agent inspection requires decrypting its stored credential and is available through a run.',
          'authentication',
          'SOURCE_INSPECT',
        );
      const adapter =
        row.type === 'local' ? new LocalWordPressAdapter() : new ArchiveSourceAdapter();
      const config = adapter.validate({ ...(JSON.parse(row.config_json) as object), id: row.id });
      const result = await adapter.inspect(config as never);
      if (result.multisite)
        throw new OpenPreflightError(
          'WordPress multisite is unsupported in v1.0.',
          'input',
          'VERIFYING_SOURCE',
          ['See ROADMAP.md for planned multisite support.'],
        );
      output(result);
    }),
);

const journey = program.command('journey').description('Manage test journeys.');
addJson(journey.command('list').description('List bundled journeys.')).action(async () => {
  const directory = resolve('examples/journeys');
  let files: string[] = [];
  try {
    files = (await readdir(directory, { recursive: true }))
      .filter((file) => /\.ya?ml$|\.json$/i.test(file))
      .sort();
  } catch {
    /* empty library */
  }
  output(files, files.length ? files.join('\n') : 'No journeys found.');
});
addJson(
  journey.command('validate <file>').description('Validate a journey and show all errors.'),
).action(async (file) => {
  const value = await parseJourney(resolve(file));
  output(
    { valid: true, id: value.id, steps: value.steps.length },
    `Journey ${value.id} is valid (${value.steps.length} steps).`,
  );
});

const baseline = program.command('baseline').description('Manage baselines.');
addJson(baseline.command('create').description('Create a queued baseline job.'))
  .requiredOption('--source <id>')
  .action(async ({ source: sourceId }) =>
    withDatabase(async ({ db }) => {
      const id = `base_${nanoid(12)}`;
      const runId = `run_${nanoid(12)}`;
      const jobId = `job_${nanoid(12)}`;
      db.createRun(runId, sourceId);
      db.enqueue({ id: jobId, runId, payload: { type: 'baseline', baselineId: id, sourceId } });
      output({ id, runId, jobId, status: 'queued' }, `Baseline ${id} queued as run ${runId}.`);
    }),
  );
addJson(baseline.command('list').description('List baselines.')).action(async () =>
  withDatabase(async ({ db }) => {
    const rows = db.raw
      .prepare(
        'SELECT id,source_id AS sourceId,created_at AS createdAt FROM baselines WHERE deleted_at IS NULL ORDER BY created_at DESC',
      )
      .all();
    output(rows, rows.length ? JSON.stringify(rows, null, 2) : 'No baselines exist.');
  }),
);
addJson(baseline.command('delete <id>').description('Delete baseline metadata after confirmation.'))
  .option('--yes')
  .action(async (id, options) =>
    withDatabase(async ({ db }) => {
      if (!options.yes && process.stdin.isTTY)
        throw new OpenPreflightError('Confirmation is required.', 'input', 'BASELINE_DELETE', [
          'Re-run with --yes after reviewing the baseline ID.',
        ]);
      const result = db.raw
        .prepare('UPDATE baselines SET deleted_at=? WHERE id=? AND deleted_at IS NULL')
        .run(new Date().toISOString(), id);
      if (!result.changes)
        throw new OpenPreflightError(`Baseline not found: ${id}`, 'input', 'BASELINE_DELETE');
      output({ id, deleted: true }, `Deleted baseline ${id}.`);
    }),
  );

const run = addJson(
  program.command('run').description('Queue an isolated baseline/candidate test.'),
)
  .option('--source <id>')
  .option('--updates <selection>', 'all or comma-separated update selectors')
  .option('--update <selector>', 'Single update selector')
  .option('--journey <id>', 'Journey ID')
  .action(async (options) =>
    withDatabase(async ({ db, config }) => {
      const id = `run_${nanoid(16)}`;
      const jobId = `job_${nanoid(16)}`;
      db.createRun(id, options.source);
      db.enqueue({
        id: jobId,
        runId: id,
        payload: {
          type: 'run',
          sourceId: options.source,
          updates: options.updates ?? options.update,
          journey: options.journey,
        },
        deadlineAt: new Date(Date.now() + config.docker.timeoutMinutes * 60_000),
      });
      output(
        { id, jobId, stage: 'QUEUED' },
        `Run ${id} queued. Start openpreflight serve and the worker to process it.`,
      );
    }),
  );
addJson(run.command('status <id>').description('Show persisted run status.')).action(async (id) =>
  withDatabase(async ({ db }) => {
    const row = db.raw
      .prepare(
        'SELECT id,stage,outcome_kind AS outcomeKind,verdict,created_at AS createdAt,updated_at AS updatedAt FROM runs WHERE id=?',
      )
      .get(id);
    if (!row) throw new OpenPreflightError(`Run not found: ${id}`, 'input', 'RUN_STATUS');
    output(row);
  }),
);
addJson(run.command('cancel <id>').description('Request cancellation.')).action(async (id) =>
  withDatabase(async ({ db }) => {
    const result = db.raw
      .prepare('UPDATE runs SET cancel_requested=1,updated_at=? WHERE id=?')
      .run(new Date().toISOString(), id);
    if (!result.changes)
      throw new OpenPreflightError(`Run not found: ${id}`, 'input', 'RUN_CANCEL');
    output({ id, cancellationRequested: true }, `Cancellation requested for ${id}.`);
  }),
);

const report = program.command('report').description('Inspect generated reports.');
addJson(report.command('list')).action(async () =>
  withDatabase(async ({ db }) =>
    output(
      db.raw
        .prepare(
          "SELECT id,run_id AS runId,kind,relative_path AS path FROM artifacts WHERE kind LIKE 'report-%' ORDER BY created_at DESC",
        )
        .all(),
    ),
  ),
);
addJson(report.command('show <id>')).action(async (id) =>
  withDatabase(async ({ db, config }) => {
    const row = db.raw
      .prepare("SELECT relative_path FROM artifacts WHERE id=? AND kind LIKE 'report-%'")
      .get(id) as { relative_path: string } | undefined;
    if (!row) throw new OpenPreflightError(`Report not found: ${id}`, 'input', 'REPORT_SHOW');
    const path = resolve(config.storage.directory, row.relative_path);
    output(JSON.parse(await readFile(path, 'utf8')) as unknown);
  }),
);
report
  .command('open <id>')
  .description('Open an HTML report in the system browser; use latest for the newest report.')
  .action(async (id) =>
    withDatabase(async ({ db, config }) => {
      const row = (
        id === 'latest'
          ? db.raw
              .prepare(
                "SELECT relative_path FROM artifacts WHERE kind='report-html' ORDER BY created_at DESC LIMIT 1",
              )
              .get()
          : db.raw
              .prepare("SELECT relative_path FROM artifacts WHERE id=? AND kind='report-html'")
              .get(id)
      ) as { relative_path: string } | undefined;
      if (!row) throw new OpenPreflightError('HTML report not found.', 'input', 'REPORT_OPEN');
      const path = resolve(config.storage.directory, row.relative_path);
      const command =
        process.platform === 'win32'
          ? (['cmd', ['/c', 'start', '', path]] as const)
          : process.platform === 'darwin'
            ? (['open', [path]] as const)
            : (['xdg-open', [path]] as const);
      const child = spawn(command[0], [...command[1]], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
        shell: false,
      });
      child.unref();
      output({ path }, `Opened ${path}`);
    }),
  );

addJson(program.command('cleanup').description('Remove expired artifacts and metadata.'))
  .option('--older-than <duration>', 'Example: 7d')
  .option('--all')
  .option('--yes')
  .action(async (options) =>
    withDatabase(async ({ db, config }) => {
      const days = options.all
        ? 0
        : options.olderThan
          ? Number(/^([0-9]+)d$/.exec(options.olderThan)?.[1])
          : config.storage.retentionDays;
      if (!Number.isFinite(days))
        throw new OpenPreflightError('--older-than must use the form 7d.', 'input', 'CLEANUP');
      const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
      const rows = db.raw
        .prepare('SELECT id,relative_path FROM artifacts WHERE created_at < ?')
        .all(cutoff) as Array<{ id: string; relative_path: string }>;
      if (!options.yes) {
        output(
          { wouldDelete: rows, cutoff },
          `Would delete ${rows.length} artifacts older than ${cutoff}. Re-run with --yes.`,
        );
        return;
      }
      for (const row of rows) {
        const root = resolve(config.storage.directory);
        const path = resolve(root, row.relative_path);
        if (!path.startsWith(`${root}\\`) && !path.startsWith(`${root}/`))
          throw new Error('Refusing cleanup outside storage directory.');
        await rm(path, { recursive: true, force: true });
        db.raw.prepare('DELETE FROM artifacts WHERE id=?').run(row.id);
      }
      output({ deleted: rows.length }, `Deleted ${rows.length} artifacts.`);
    }),
  );

const config = program.command('config').description('Validate project configuration.');
addJson(config.command('validate')).action(async () => {
  const file = resolve(program.opts<GlobalOptions>().config ?? 'openpreflight.config.yaml');
  await loadConfig(file);
  output({ valid: true, file }, `Configuration is valid: ${file}`);
});
program
  .command('version')
  .description('Print version information.')
  .action(() => output({ version: VERSION }, VERSION));

program.parseAsync().catch((error: unknown) => {
  if (error instanceof OpenPreflightError) {
    process.stderr.write(
      `${error.message}\nStage: ${error.stage}${error.evidence ? `\nEvidence: ${error.evidence}` : ''}${error.remedies.length ? `\nSuggested actions:\n${error.remedies.map((item) => `- ${item}`).join('\n')}` : ''}\n`,
    );
    process.exitCode = exitCodeFor(error);
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = /invalid|unknown|required|missing/i.test(message) ? 2 : 3;
});
