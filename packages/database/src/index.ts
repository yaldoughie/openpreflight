import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import Database from 'better-sqlite3';
import { assertTransition, type RunStage } from '@openpreflight/core';

const migration = `
CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sources (id TEXT PRIMARY KEY, type TEXT NOT NULL, name TEXT NOT NULL, config_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT);
CREATE TABLE IF NOT EXISTS source_credentials (source_id TEXT PRIMARY KEY REFERENCES sources(id) ON DELETE CASCADE, encrypted_value TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS source_snapshots (id TEXT PRIMARY KEY, source_id TEXT NOT NULL REFERENCES sources(id), manifest_json TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS components (id TEXT PRIMARY KEY, snapshot_id TEXT NOT NULL REFERENCES source_snapshots(id), type TEXT NOT NULL, slug TEXT NOT NULL, version TEXT NOT NULL, active INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS candidate_updates (id TEXT PRIMARY KEY, source_id TEXT NOT NULL REFERENCES sources(id), component_type TEXT NOT NULL, slug TEXT NOT NULL, current_version TEXT NOT NULL, candidate_version TEXT NOT NULL, package_origin TEXT NOT NULL, package_checksum TEXT);
CREATE TABLE IF NOT EXISTS journeys (id TEXT PRIMARY KEY, name TEXT NOT NULL, active_version_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS journey_versions (id TEXT PRIMARY KEY, journey_id TEXT NOT NULL REFERENCES journeys(id), schema_version TEXT NOT NULL, definition_json TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS baselines (id TEXT PRIMARY KEY, source_id TEXT NOT NULL REFERENCES sources(id), snapshot_id TEXT NOT NULL REFERENCES source_snapshots(id), browser_metadata_json TEXT NOT NULL, created_at TEXT NOT NULL, deleted_at TEXT);
CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, source_id TEXT REFERENCES sources(id), baseline_id TEXT REFERENCES baselines(id), stage TEXT NOT NULL, outcome_kind TEXT, verdict TEXT, cancel_requested INTEGER NOT NULL DEFAULT 0, started_at TEXT, completed_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS run_updates (run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE, update_id TEXT NOT NULL REFERENCES candidate_updates(id), status TEXT NOT NULL, output_artifact_id TEXT, PRIMARY KEY(run_id, update_id));
CREATE TABLE IF NOT EXISTS run_stages (id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE, stage TEXT NOT NULL, entered_at TEXT NOT NULL, exited_at TEXT, detail_json TEXT);
CREATE TABLE IF NOT EXISTS browser_profiles (id TEXT PRIMARY KEY, definition_json TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS artifacts (id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE, kind TEXT NOT NULL, relative_path TEXT NOT NULL, sha256 TEXT NOT NULL, size_bytes INTEGER NOT NULL, redacted INTEGER NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS findings (id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE, rule_id TEXT NOT NULL, severity TEXT NOT NULL, state TEXT NOT NULL, data_json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS rule_results (id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE, rule_id TEXT NOT NULL, rule_version TEXT NOT NULL, result_json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS network_requests (id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE, phase TEXT NOT NULL, data_json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS console_messages (id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE, phase TEXT NOT NULL, data_json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS performance_metrics (id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE, phase TEXT NOT NULL, name TEXT NOT NULL, value REAL NOT NULL, unit TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS accessibility_findings (id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE, phase TEXT NOT NULL, rule_id TEXT NOT NULL, data_json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS visual_comparisons (id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE, checkpoint TEXT NOT NULL, changed_percent REAL NOT NULL, data_json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE, status TEXT NOT NULL, available_at TEXT NOT NULL, lease_owner TEXT, lease_expires_at TEXT, attempts INTEGER NOT NULL DEFAULT 0, max_attempts INTEGER NOT NULL DEFAULT 3, deadline_at TEXT, payload_json TEXT NOT NULL, last_error_json TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_jobs_claim ON jobs(status, available_at, lease_expires_at);
CREATE TABLE IF NOT EXISTS job_events (id INTEGER PRIMARY KEY AUTOINCREMENT, job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE, event_type TEXT NOT NULL, data_json TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, sensitive INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS retention_records (id TEXT PRIMARY KEY, resource_type TEXT NOT NULL, resource_id TEXT NOT NULL, expires_at TEXT NOT NULL, deleted_at TEXT, result_json TEXT);
`;

export interface JobRecord {
  id: string;
  runId: string;
  status: string;
  payload: unknown;
  attempts: number;
  deadlineAt: string | null;
}

export class OpenPreflightDatabase {
  readonly raw: Database.Database;
  constructor(path: string) {
    this.raw = new Database(path);
    this.raw.pragma('foreign_keys = ON');
    this.raw.pragma('journal_mode = WAL');
    this.raw.pragma('busy_timeout = 5000');
  }
  migrate(): void {
    this.raw.transaction(() => {
      this.raw.exec(migration);
      this.raw
        .prepare('INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES(1, ?)')
        .run(new Date().toISOString());
    })();
  }
  close(): void {
    this.raw.close();
  }
  createRun(id: string, sourceId?: string): void {
    const now = new Date().toISOString();
    this.raw.transaction(() => {
      this.raw
        .prepare(
          'INSERT INTO runs(id, source_id, stage, created_at, updated_at) VALUES(?, ?, ?, ?, ?)',
        )
        .run(id, sourceId ?? null, 'QUEUED', now, now);
      this.raw
        .prepare('INSERT INTO run_stages(run_id, stage, entered_at) VALUES(?, ?, ?)')
        .run(id, 'QUEUED', now);
    })();
  }
  transitionRun(id: string, to: RunStage, detail?: unknown): void {
    const row = this.raw.prepare('SELECT stage FROM runs WHERE id = ?').get(id) as
      { stage: RunStage } | undefined;
    if (!row) throw new Error(`Run not found: ${id}`);
    assertTransition(row.stage, to);
    const now = new Date().toISOString();
    this.raw.transaction(() => {
      this.raw
        .prepare(
          'UPDATE run_stages SET exited_at = ? WHERE id = (SELECT id FROM run_stages WHERE run_id = ? ORDER BY id DESC LIMIT 1)',
        )
        .run(now, id);
      this.raw
        .prepare(
          "UPDATE runs SET stage = ?, updated_at = ?, completed_at = CASE WHEN ? IN ('PASSED','FAILED','ERROR','CANCELLED') THEN ? ELSE completed_at END WHERE id = ?",
        )
        .run(to, now, to, now, id);
      this.raw
        .prepare(
          'INSERT INTO run_stages(run_id, stage, entered_at, detail_json) VALUES(?, ?, ?, ?)',
        )
        .run(id, to, now, detail === undefined ? null : JSON.stringify(detail));
    })();
  }
  enqueue(job: {
    id: string;
    runId: string;
    payload: unknown;
    availableAt?: Date;
    deadlineAt?: Date;
    maxAttempts?: number;
  }): void {
    const now = new Date().toISOString();
    this.raw
      .prepare(
        "INSERT INTO jobs(id, run_id, status, available_at, max_attempts, deadline_at, payload_json, created_at, updated_at) VALUES(?, ?, 'queued', ?, ?, ?, ?, ?, ?)",
      )
      .run(
        job.id,
        job.runId,
        (job.availableAt ?? new Date()).toISOString(),
        job.maxAttempts ?? 3,
        job.deadlineAt?.toISOString() ?? null,
        JSON.stringify(job.payload),
        now,
        now,
      );
  }
  claim(owner: string, leaseMs = 30_000): JobRecord | undefined {
    const now = new Date();
    const expires = new Date(now.getTime() + leaseMs);
    return this.raw.transaction(() => {
      const row = this.raw
        .prepare(
          `SELECT id FROM jobs WHERE status IN ('queued','running') AND available_at <= ? AND (lease_expires_at IS NULL OR lease_expires_at < ?) AND attempts < max_attempts ORDER BY created_at LIMIT 1`,
        )
        .get(now.toISOString(), now.toISOString()) as { id: string } | undefined;
      if (!row) return undefined;
      this.raw
        .prepare(
          "UPDATE jobs SET status='running', lease_owner=?, lease_expires_at=?, attempts=attempts+1, updated_at=? WHERE id=?",
        )
        .run(owner, expires.toISOString(), now.toISOString(), row.id);
      const claimed = this.raw
        .prepare(
          'SELECT id, run_id, status, payload_json, attempts, deadline_at FROM jobs WHERE id=?',
        )
        .get(row.id) as {
        id: string;
        run_id: string;
        status: string;
        payload_json: string;
        attempts: number;
        deadline_at: string | null;
      };
      return {
        id: claimed.id,
        runId: claimed.run_id,
        status: claimed.status,
        payload: JSON.parse(claimed.payload_json) as unknown,
        attempts: claimed.attempts,
        deadlineAt: claimed.deadline_at,
      };
    })();
  }
  heartbeat(id: string, owner: string, leaseMs = 30_000): boolean {
    const result = this.raw
      .prepare(
        "UPDATE jobs SET lease_expires_at=?, updated_at=? WHERE id=? AND lease_owner=? AND status='running'",
      )
      .run(new Date(Date.now() + leaseMs).toISOString(), new Date().toISOString(), id, owner);
    return result.changes === 1;
  }
  completeJob(id: string, owner: string): void {
    const result = this.raw
      .prepare(
        "UPDATE jobs SET status='completed', lease_owner=NULL, lease_expires_at=NULL, updated_at=? WHERE id=? AND lease_owner=?",
      )
      .run(new Date().toISOString(), id, owner);
    if (result.changes !== 1) throw new Error(`Job lease lost: ${id}`);
  }
  addEvent(jobId: string, type: string, data: unknown): number {
    return Number(
      this.raw
        .prepare(
          'INSERT INTO job_events(job_id, event_type, data_json, created_at) VALUES(?,?,?,?)',
        )
        .run(jobId, type, JSON.stringify(data), new Date().toISOString()).lastInsertRowid,
    );
  }
}

export async function ensureStorage(
  directory: string,
): Promise<{ databasePath: string; keyPath: string }> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  return {
    databasePath: join(directory, 'openpreflight.sqlite'),
    keyPath: join(directory, 'credentials.key'),
  };
}

export async function loadOrCreateKey(keyPath: string, supplied?: string): Promise<Buffer> {
  if (supplied) {
    const key = Buffer.from(supplied, 'base64');
    if (key.length !== 32) throw new Error('OPENPREFLIGHT_ENCRYPTION_KEY must decode to 32 bytes.');
    return key;
  }
  try {
    const key = Buffer.from((await readFile(keyPath, 'utf8')).trim(), 'base64');
    if (key.length !== 32) throw new Error('Credential key has invalid length.');
    return key;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    await mkdir(dirname(keyPath), { recursive: true, mode: 0o700 });
    const key = randomBytes(32);
    await writeFile(keyPath, key.toString('base64'), { mode: 0o600, flag: 'wx' });
    await chmod(keyPath, 0o600);
    return key;
  }
}

export function encryptCredential(value: string, key: Buffer, context: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(context));
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [
    'v1',
    iv.toString('base64'),
    cipher.getAuthTag().toString('base64'),
    ciphertext.toString('base64'),
  ].join('.');
}

export function decryptCredential(value: string, key: Buffer, context: string): string {
  const [version, iv, tag, ciphertext] = value.split('.');
  if (version !== 'v1' || !iv || !tag || !ciphertext)
    throw new Error('Unsupported encrypted credential format.');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}
