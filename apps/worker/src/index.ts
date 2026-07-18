import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import { basename, join, relative, resolve } from 'node:path';
import { hostname } from 'node:os';
import { nanoid } from 'nanoid';
import { loadConfig } from '@openpreflight/configuration';
import {
  calculateVerdict,
  OpenPreflightError,
  type Finding,
  type RunStage,
} from '@openpreflight/core';
import {
  OpenPreflightDatabase,
  decryptCredential,
  ensureStorage,
  loadOrCreateKey,
  type JobRecord,
} from '@openpreflight/database';
import { DockerEnvironment } from '@openpreflight/environment-manager';
import { parseJourney } from '@openpreflight/journey-schema';
import { compareScreenshots, runJourney, type JourneyResult } from '@openpreflight/browser-runner';
import {
  compareObservations,
  detectWordPressDiagnostics,
  observationsFromJourney,
  type Observation,
} from '@openpreflight/rule-engine';
import { generateReports, type OpenPreflightReport } from '@openpreflight/reporters';
import {
  AgentSourceAdapter,
  ArchiveSourceAdapter,
  LocalWordPressAdapter,
} from '@openpreflight/source-adapters';

const config = await loadConfig(process.env.OPENPREFLIGHT_CONFIG);
const storage = await ensureStorage(resolve(config.storage.directory));
const db = new OpenPreflightDatabase(storage.databasePath);
db.migrate();
const workerId = `${hostname()}-${process.pid}-${nanoid(6)}`;
let stopping = false;
process.once('SIGINT', () => {
  stopping = true;
});
process.once('SIGTERM', () => {
  stopping = true;
});
const pause = (ms: number) => new Promise((done) => setTimeout(done, ms));
function transition(job: JobRecord, stage: RunStage, detail?: unknown): void {
  db.transitionRun(job.runId, stage, detail);
  db.addEvent(job.id, 'stage', { runId: job.runId, stage, detail });
}
function cancelled(runId: string): boolean {
  const row = db.raw.prepare('SELECT cancel_requested FROM runs WHERE id=?').get(runId) as
    { cancel_requested: number } | undefined;
  return Boolean(row?.cancel_requested);
}
function assertActive(job: JobRecord, controller: AbortController): void {
  if (cancelled(job.runId)) {
    controller.abort();
    throw new OpenPreflightError('The run was cancelled by the user.', 'cancelled', 'CLEANING_UP');
  }
  if (job.deadlineAt && new Date(job.deadlineAt).getTime() < Date.now()) {
    controller.abort();
    throw new OpenPreflightError(
      'The run exceeded its configured deadline.',
      'infrastructure',
      'CLEANING_UP',
      ['Inspect stage timings and increase docker.timeoutMinutes if justified.'],
    );
  }
}
async function materializeSource(
  job: JobRecord,
  sourceId: string,
  destination: string,
  signal: AbortSignal,
): Promise<{ name: string; wordpressVersion: string }> {
  const row = db.raw
    .prepare('SELECT id,type,name,config_json FROM sources WHERE id=? AND deleted_at IS NULL')
    .get(sourceId) as { id: string; type: string; name: string; config_json: string } | undefined;
  if (!row)
    throw new OpenPreflightError(`Source not found: ${sourceId}`, 'input', 'PREPARING_SOURCE');
  const stored = JSON.parse(row.config_json) as Record<string, unknown>;
  if (row.type === 'local') {
    const adapter = new LocalWordPressAdapter();
    const value = adapter.validate({ ...stored, id: row.id });
    const inspection = await adapter.inspect(value, signal);
    if (inspection.multisite)
      throw new OpenPreflightError(
        'WordPress multisite is unsupported in v1.0.',
        'input',
        'VERIFYING_SOURCE',
        ['See ROADMAP.md.'],
      );
    await adapter.materialize(value, destination, signal);
    return { name: row.name, wordpressVersion: inspection.wordpressVersion };
  }
  if (row.type === 'archive') {
    const adapter = new ArchiveSourceAdapter();
    const value = adapter.validate({ ...stored, id: row.id });
    await adapter.materialize(value, destination, signal);
    return { name: row.name, wordpressVersion: 'from-manifest' };
  }
  const credential = db.raw
    .prepare('SELECT encrypted_value FROM source_credentials WHERE source_id=?')
    .get(row.id) as { encrypted_value: string } | undefined;
  if (!credential)
    throw new OpenPreflightError(
      'Agent credential is missing.',
      'authentication',
      'PREPARING_SOURCE',
    );
  const key = await loadOrCreateKey(storage.keyPath, process.env.OPENPREFLIGHT_ENCRYPTION_KEY);
  const adapter = new AgentSourceAdapter();
  const value = adapter.validate({
    ...stored,
    id: row.id,
    token: decryptCredential(credential.encrypted_value, key, row.id),
  });
  const inspection = await adapter.inspect(value, signal);
  if (inspection.multisite)
    throw new OpenPreflightError(
      'WordPress multisite is unsupported in v1.0.',
      'input',
      'VERIFYING_SOURCE',
    );
  const archive = join(resolve(destination, '..'), 'agent-export.zip');
  await adapter.materialize(value, archive, signal);
  await new ArchiveSourceAdapter().materialize({ path: archive }, destination, signal);
  await rm(archive, { force: true });
  return { name: row.name, wordpressVersion: inspection.wordpressVersion };
}

async function loadJourneys(
  selected?: string | string[],
): Promise<Array<Awaited<ReturnType<typeof parseJourney>>>> {
  const directory = resolve('examples/journeys');
  const selections = selected ? (Array.isArray(selected) ? selected : [selected]) : [];
  const files = (await readdir(directory, { recursive: true })).filter(
    (file) =>
      /\.ya?ml$|\.json$/i.test(file) &&
      (!selections.length
        ? !/[\\/]/.test(file)
        : selections.some((choice) => file.startsWith(`${choice}.`) || file.includes(choice))),
  );
  if (!files.length)
    throw new OpenPreflightError(
      `No journey matched ${selected ?? 'the default library'}.`,
      'input',
      'RUNNING_BASELINE',
    );
  return Promise.all(files.map((file) => parseJourney(join(directory, file))));
}

async function runPhase(
  phase: 'baseline' | 'candidate',
  journeys: Awaited<ReturnType<typeof loadJourneys>>,
  baseUrl: string,
  runDirectory: string,
  signal: AbortSignal,
  runtimeSecrets: Readonly<Record<string, string>>,
): Promise<{ results: JourneyResult[]; observations: Observation[] }> {
  const results: JourneyResult[] = [];
  for (const journey of journeys)
    for (const profile of config.browser.profiles) {
      if (signal.aborted)
        throw new OpenPreflightError(
          'Run cancelled.',
          'cancelled',
          `RUNNING_${phase.toUpperCase()}`,
        );
      const result = await runJourney(journey, {
        baseUrl,
        artifactsDirectory: join(runDirectory, phase, journey.id, profile.id),
        profile,
        timeoutMs: 10_000,
        ...(journey.mask ? { screenshotMasks: journey.mask.map(String) } : {}),
        signal,
        secrets: Object.fromEntries(
          Object.entries(journey.secrets ?? {}).map(([name, envName]) => {
            const value = runtimeSecrets[envName] ?? process.env[envName];
            if (!value)
              throw new OpenPreflightError(
                `Missing journey secret ${envName}.`,
                'input',
                `RUNNING_${phase.toUpperCase()}`,
              );
            return [name, value];
          }),
        ),
      });
      results.push(result);
    }
  return { results, observations: results.flatMap(observationsFromJourney) };
}

async function visualObservations(
  runDirectory: string,
  baseline: JourneyResult[],
  candidate: JourneyResult[],
): Promise<Observation[]> {
  const output: Observation[] = [];
  for (const before of baseline) {
    const after = candidate.find(
      (item) => item.journeyId === before.journeyId && item.profileId === before.profileId,
    );
    if (!after) continue;
    for (const [index, baselinePath] of before.screenshots.entries()) {
      const candidatePath = after.screenshots[index];
      if (!candidatePath) {
        output.push({
          ruleId: 'visual-difference',
          key: `${before.journeyId}:${before.profileId}:${index}`,
          title: 'Candidate screenshot is missing',
          description: basename(baselinePath),
          severity: 'error',
          category: 'visual',
        });
        continue;
      }
      const diffPath = join(
        runDirectory,
        'visual',
        `${before.journeyId}-${before.profileId}-${index}.png`,
      );
      await mkdir(resolve(diffPath, '..'), { recursive: true });
      const comparison = await compareScreenshots(baselinePath, candidatePath, diffPath);
      if (!comparison.compatible || comparison.changedPercent > 1)
        output.push({
          ruleId: 'visual-difference',
          key: `${before.journeyId}:${before.profileId}:${index}`,
          title: 'Visual checkpoint changed',
          description: comparison.compatible
            ? `${comparison.changedPercent.toFixed(2)}% of pixels changed.`
            : 'Browser viewport metadata was incompatible.',
          severity: comparison.changedPercent > 10 ? 'error' : 'warning',
          category: 'visual',
          evidence: [
            { type: 'metric', title: 'Changed pixels percent', value: comparison.changedPercent },
            {
              type: 'artifact',
              title: 'Difference image',
              value: relative(runDirectory, diffPath),
            },
          ],
        });
    }
  }
  return output;
}

async function processJob(job: JobRecord): Promise<void> {
  const payload = job.payload as {
    type: string;
    sourceId?: string;
    journey?: string;
    journeys?: string[];
    updates?: string | string[];
    baselineId?: string;
  };
  if (!payload.sourceId)
    throw new OpenPreflightError('A run requires a source ID.', 'input', 'PREPARING_SOURCE');
  const runDirectory = resolve(config.storage.directory, 'runs', job.runId);
  const sourceDirectory = join(runDirectory, 'source');
  await mkdir(runDirectory, { recursive: true, mode: 0o700 });
  const controller = new AbortController();
  const heartbeat = setInterval(() => db.heartbeat(job.id, workerId), 10_000);
  let environment: DockerEnvironment | undefined;
  let terminal: 'PASSED' | 'FAILED' | 'ERROR' | 'CANCELLED' = 'ERROR';
  let outcomeError: unknown;
  try {
    assertActive(job, controller);
    transition(job, 'PREPARING_SOURCE');
    const site = await materializeSource(job, payload.sourceId, sourceDirectory, controller.signal);
    transition(job, 'VERIFYING_SOURCE', site);
    assertActive(job, controller);
    transition(job, 'CREATING_ENVIRONMENT');
    environment = new DockerEnvironment({
      runId: job.runId,
      artifactsDirectory: runDirectory,
      networkMode: config.docker.networkMode,
      memoryLimit: config.docker.memoryLimit,
      cpuLimit: config.docker.cpuLimit,
      timeoutMs: config.docker.timeoutMinutes * 60_000,
      allowedHosts: config.docker.allowedHosts,
    });
    await environment.create(controller.signal);
    transition(job, 'IMPORTING_SITE');
    await environment.importSource(controller.signal);
    const baseUrl = await environment.baseUrl();
    await environment.wp(
      [
        'core',
        'config',
        '--dbname=openpreflight',
        '--dbuser=openpreflight',
        '--dbpass=openpreflight',
        '--dbhost=db',
        '--skip-check',
        '--force',
      ],
      controller.signal,
    );
    const databaseFile = await stat(join(sourceDirectory, 'database.sql'))
      .then(() => 'database.sql')
      .catch(() =>
        stat(join(sourceDirectory, 'database.sql.gz'))
          .then(() => 'database.sql.gz')
          .catch(() => undefined),
      );
    if (databaseFile)
      await environment.wp(['db', 'import', `/source/${databaseFile}`], controller.signal);
    else
      await environment.wp(
        [
          'core',
          'install',
          `--url=${baseUrl}`,
          '--title=OpenPreflight Fixture',
          '--admin_user=openpreflight_admin',
          '--admin_password=OpenPreflight-Local-Only-123!',
          '--admin_email=test@example.invalid',
          '--skip-email',
        ],
        controller.signal,
      );
    transition(job, 'SANITIZING_SITE');
    const originalUrl = (
      await environment.wp(['option', 'get', 'home'], controller.signal)
    ).stdout.trim();
    await environment.wp(['option', 'update', 'home', baseUrl], controller.signal);
    await environment.wp(['option', 'update', 'siteurl', baseUrl], controller.signal);
    if (originalUrl && originalUrl !== baseUrl)
      await environment.wp(
        [
          'search-replace',
          originalUrl,
          baseUrl,
          '--all-tables-with-prefix',
          '--skip-columns=guid',
          '--precise',
        ],
        controller.signal,
      );
    await environment.wp(['option', 'update', 'blog_public', '0'], controller.signal);
    await environment.wp(['user', 'session', 'destroy', '--all'], controller.signal);
    await environment.wp(['transient', 'delete', '--all'], controller.signal);
    const sanitizer = await environment.wp(
      ['eval-file', '/opt/openpreflight/sanitize.php'],
      controller.signal,
    );
    const sanitizerReport = JSON.parse(sanitizer.stdout.trim().split(/\r?\n/).at(-1) ?? '{}') as {
      warning?: string;
      actions?: unknown[];
    };
    const syntheticPassword = randomBytes(24).toString('base64url');
    await environment.wp(
      ['user', 'update', 'openpreflight_admin', `--user_pass=${syntheticPassword}`],
      controller.signal,
    );
    const runtimeSecrets = {
      OPENPREFLIGHT_WP_USERNAME: 'openpreflight_admin',
      OPENPREFLIGHT_WP_PASSWORD: syntheticPassword,
      OPENPREFLIGHT_TEST_EMAIL: 'test@example.invalid',
    };
    const sanitization = [
      { action: 'url-rewrite', status: 'completed', from: originalUrl, to: baseUrl },
      { action: 'search-indexing-disabled', status: 'completed' },
      { action: 'sessions-destroyed', status: 'completed' },
      { action: 'outgoing-mail-blocked', status: 'enforced-by-mu-plugin' },
      { action: 'external-http-restricted', status: 'enforced-by-network-and-mu-plugin' },
      { action: 'payment-gateways-disabled', status: 'enforced-by-mu-plugin' },
      ...(sanitizerReport.actions ?? []).filter(
        (action): action is Record<string, unknown> =>
          Boolean(action) && typeof action === 'object' && !Array.isArray(action),
      ),
    ];
    await (
      await import('node:fs/promises')
    ).writeFile(
      join(runDirectory, 'sanitization-report.json'),
      JSON.stringify(
        {
          warning:
            sanitizerReport.warning ??
            'Arbitrary plugins may store secrets in unknown locations; complete sanitization cannot be guaranteed.',
          actions: sanitization,
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
    const journeys = await loadJourneys(payload.journeys ?? payload.journey);
    transition(job, 'WARMING_BASELINE');
    await fetch(baseUrl, { signal: controller.signal });
    transition(job, 'RUNNING_BASELINE');
    const baseline = await runPhase(
      'baseline',
      journeys,
      baseUrl,
      runDirectory,
      controller.signal,
      runtimeSecrets,
    );
    transition(job, 'SNAPSHOTTING_BASELINE');
    const baselineLogs = await environment.logs();
    await environment.snapshot('baseline', controller.signal);
    transition(job, 'RESTORING_CANDIDATE');
    await environment.restoreDatabase('/artifacts/baseline.sql', controller.signal);
    transition(job, 'APPLYING_UPDATES');
    const updateSelectors = (
      Array.isArray(payload.updates) ? payload.updates : payload.updates ? [payload.updates] : []
    ).filter((selector) => selector !== 'none');
    if (updateSelectors.length) {
      try {
        for (const [index, selector] of updateSelectors.entries()) {
          if (selector === 'all') {
            await environment.wp(['core', 'update'], controller.signal);
            await environment.wp(['plugin', 'update', '--all'], controller.signal);
            await environment.wp(['theme', 'update', '--all'], controller.signal);
          } else if (selector === 'core') {
            await environment.wp(['core', 'update'], controller.signal);
          } else if (/^(?:plugin|theme):[^/\\]+$/.test(selector)) {
            const [type, slug] = selector.split(':') as ['plugin' | 'theme', string];
            await environment.wp([type, 'update', slug], controller.signal);
          } else {
            const themePackage = selector.startsWith('theme-file:');
            const update = resolve(selector.replace(/^(?:file:|plugin-file:|theme-file:)/, ''));
            const artifactName = `update-${index}.zip`;
            const target = join(runDirectory, artifactName);
            await (await import('node:fs/promises')).copyFile(update, target);
            await environment.wp(
              [
                themePackage ? 'theme' : 'plugin',
                'install',
                `/artifacts/${artifactName}`,
                '--force',
                ...(themePackage ? [] : ['--activate']),
              ],
              controller.signal,
            );
          }
        }
      } catch (error) {
        throw new OpenPreflightError(
          `The candidate update could not be installed: ${error instanceof Error ? error.message : String(error)}`,
          'regression',
          'APPLYING_UPDATES',
        );
      }
    }
    transition(job, 'WARMING_CANDIDATE');
    await fetch(baseUrl, { signal: controller.signal });
    transition(job, 'RUNNING_CANDIDATE');
    const candidate = await runPhase(
      'candidate',
      journeys,
      baseUrl,
      runDirectory,
      controller.signal,
      runtimeSecrets,
    );
    transition(job, 'COMPARING_RESULTS');
    const candidateLogs = await environment.logs();
    const visual = await visualObservations(runDirectory, baseline.results, candidate.results);
    const findings: Finding[] = compareObservations(
      [...baseline.observations, ...detectWordPressDiagnostics(baselineLogs)],
      [...candidate.observations, ...detectWordPressDiagnostics(candidateLogs), ...visual],
    );
    const verdict = calculateVerdict(findings, config.policies);
    transition(job, 'GENERATING_REPORT');
    const report: OpenPreflightReport = {
      schemaVersion: '1.0',
      openPreflightVersion: '1.0.0',
      generatedAt: new Date().toISOString(),
      run: { id: job.runId, stage: verdict.verdict === 'fail' ? 'FAILED' : 'PASSED' },
      site: {
        name: site.name,
        sourceId: payload.sourceId,
        wordpressVersion: site.wordpressVersion,
      },
      updates: updateSelectors.map((selector) => ({
        type: selector === 'core' ? 'core' : selector.startsWith('theme') ? 'theme' : 'plugin',
        slug: /^(?:plugin|theme):/.test(selector)
          ? selector.slice(selector.indexOf(':') + 1)
          : basename(selector.replace(/^(?:file:|plugin-file:|theme-file:)/, '')),
        packageOrigin: /^(?:file:|plugin-file:|theme-file:)/.test(selector)
          ? 'local'
          : 'wordpress.org',
        candidateVersion: 'resolved-by-wp-cli',
      })),
      findings,
      verdict,
      journeys: candidate.results.map((item) => ({
        id: item.journeyId,
        profile: item.profileId,
        status: item.status,
      })),
      sanitization,
      disclaimers: [
        'Automated accessibility checks do not establish WCAG conformance; manual review is still required.',
        'Lab performance measurements are not real-user monitoring.',
        'Arbitrary plugins may store secrets in unknown locations.',
      ],
    };
    const generated = await generateReports(
      report,
      join(runDirectory, 'reports'),
      config.reports.formats,
    );
    for (const item of generated) {
      const id = `artifact_${nanoid(12)}`;
      db.raw
        .prepare(
          'INSERT INTO artifacts(id,run_id,kind,relative_path,sha256,size_bytes,redacted,created_at) VALUES(?,?,?,?,?,?,1,?)',
        )
        .run(
          id,
          job.runId,
          `report-${item.format}`,
          relative(resolve(config.storage.directory), item.path),
          item.sha256,
          item.size,
          new Date().toISOString(),
        );
    }
    for (const finding of findings)
      db.raw
        .prepare(
          'INSERT INTO findings(id,run_id,rule_id,severity,state,data_json) VALUES(?,?,?,?,?,?)',
        )
        .run(
          finding.id,
          job.runId,
          finding.ruleId,
          finding.severity,
          finding.state,
          JSON.stringify(finding),
        );
    db.raw
      .prepare('UPDATE runs SET verdict=?, outcome_kind=? WHERE id=?')
      .run(verdict.verdict, 'application', job.runId);
    terminal = verdict.verdict === 'fail' ? 'FAILED' : 'PASSED';
  } catch (error) {
    outcomeError = error;
    terminal =
      error instanceof OpenPreflightError
        ? error.kind === 'cancelled'
          ? 'CANCELLED'
          : error.kind === 'regression'
            ? 'FAILED'
            : 'ERROR'
        : 'ERROR';
    db.raw
      .prepare('UPDATE runs SET outcome_kind=? WHERE id=?')
      .run(error instanceof OpenPreflightError ? error.kind : 'infrastructure', job.runId);
  } finally {
    clearInterval(heartbeat);
    const current = db.raw.prepare('SELECT stage FROM runs WHERE id=?').get(job.runId) as {
      stage: RunStage;
    };
    if (!['CLEANING_UP', 'PASSED', 'FAILED', 'ERROR', 'CANCELLED'].includes(current.stage))
      transition(
        job,
        'CLEANING_UP',
        outcomeError instanceof Error ? { error: outcomeError.message } : undefined,
      );
    try {
      if (environment) await environment.destroy();
    } catch (cleanupError) {
      terminal = 'ERROR';
      outcomeError ??= cleanupError;
    }
    const after = db.raw.prepare('SELECT stage FROM runs WHERE id=?').get(job.runId) as {
      stage: RunStage;
    };
    if (after.stage === 'CLEANING_UP')
      transition(
        job,
        terminal,
        outcomeError instanceof Error ? { error: outcomeError.message } : undefined,
      );
  }
  if (outcomeError) {
    throw outcomeError instanceof Error ? outcomeError : new Error(String(outcomeError));
  }
}

while (!stopping) {
  const job = db.claim(workerId, 30_000);
  if (!job) {
    await pause(1_000);
    continue;
  }
  try {
    await processJob(job);
    db.completeJob(job.id, workerId);
  } catch (error) {
    db.raw
      .prepare(
        "UPDATE jobs SET status=CASE WHEN attempts>=max_attempts THEN 'failed' ELSE 'queued' END,lease_owner=NULL,lease_expires_at=NULL,last_error_json=?,updated_at=? WHERE id=?",
      )
      .run(
        JSON.stringify({ message: error instanceof Error ? error.message : String(error) }),
        new Date().toISOString(),
        job.id,
      );
    db.addEvent(job.id, 'error', {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
db.close();
import { randomBytes } from 'node:crypto';
