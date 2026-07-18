import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { defaultConfig } from '@openpreflight/configuration';
import { OpenPreflightDatabase } from '@openpreflight/database';
import { createServer } from './index.js';

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function server() {
  const directory = await mkdtemp(join(tmpdir(), 'openpreflight-server-'));
  directories.push(directory);
  const config = structuredClone(defaultConfig);
  config.storage.directory = directory;
  return createServer(config);
}

describe('versioned local API', () => {
  it('serves health and validates then persists a journey version', async () => {
    const app = await server();
    try {
      const health = await app.inject({ method: 'GET', url: '/api/v1/health' });
      expect(health.statusCode).toBe(200);
      const validation = await app.inject({
        method: 'POST',
        url: '/api/v1/journeys/validate',
        payload: {
          text: 'schemaVersion: "1.0"\nid: smoke\nname: Smoke\nsteps:\n  - visit:\n      path: /',
        },
      });
      expect(validation.statusCode).toBe(200);
      const definition = validation.json().definition as object;
      const saved = await app.inject({
        method: 'POST',
        url: '/api/v1/journeys',
        payload: { id: 'smoke', name: 'Smoke', definition },
      });
      expect(saved.statusCode).toBe(201);
      expect((await app.inject({ method: 'GET', url: '/api/v1/journeys' })).json()).toHaveLength(1);
    } finally {
      await app.close();
    }
  });
  it('returns structured client errors without a stack trace', async () => {
    const app = await server();
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/journeys/validate',
        payload: { text: 'schemaVersion: "2"' },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ error: { code: 'REQUEST_ERROR' } });
      expect(response.body).not.toContain('stack');
    } finally {
      await app.close();
    }
  });
  it('previews and confirms bounded retention cleanup', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'openpreflight-retention-'));
    directories.push(directory);
    const reports = join(directory, 'reports');
    const artifact = join(reports, 'old.html');
    await mkdir(reports, { recursive: true });
    await writeFile(artifact, 'expired report');
    const database = new OpenPreflightDatabase(join(directory, 'openpreflight.sqlite'));
    database.migrate();
    database.createRun('run_retention', undefined);
    database.raw
      .prepare(
        'INSERT INTO artifacts(id,run_id,kind,relative_path,sha256,size_bytes,redacted,created_at) VALUES(?,?,?,?,?,?,?,?)',
      )
      .run(
        'artifact_old',
        'run_retention',
        'report-html',
        'reports/old.html',
        '0'.repeat(64),
        14,
        1,
        '2020-01-01T00:00:00.000Z',
      );
    database.close();
    const config = structuredClone(defaultConfig);
    config.storage.directory = directory;
    const app = await createServer(config);
    try {
      const preview = await app.inject({ method: 'GET', url: '/api/v1/retention/preview' });
      expect(preview.json()).toMatchObject({ bytes: 14, items: [{ id: 'artifact_old' }] });
      const deletion = await app.inject({
        method: 'DELETE',
        url: '/api/v1/retention',
        payload: { confirm: true },
      });
      expect(deletion.json()).toEqual({ deleted: ['artifact_old'], bytes: 14 });
      await expect(access(artifact)).rejects.toThrow();
    } finally {
      await app.close();
    }
  });
});
