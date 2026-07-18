import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import {
  OpenPreflightDatabase,
  decryptCredential,
  encryptCredential,
  loadOrCreateKey,
} from './index.js';

const directories: string[] = [];
afterEach(async () =>
  Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true }))),
);

describe('database', () => {
  it('migrates, persists transitions, and leases jobs once', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'openpreflight-'));
    directories.push(directory);
    const db = new OpenPreflightDatabase(join(directory, 'test.sqlite'));
    db.migrate();
    db.createRun('run_1');
    db.transitionRun('run_1', 'PREPARING_SOURCE');
    db.enqueue({ id: 'job_1', runId: 'run_1', payload: { action: 'run' } });
    expect(db.claim('worker-1')?.id).toBe('job_1');
    expect(db.claim('worker-2')).toBeUndefined();
    expect(db.heartbeat('job_1', 'worker-1')).toBe(true);
    expect(db.addEvent('job_1', 'progress', { percent: 10 })).toBeGreaterThan(0);
    db.completeJob('job_1', 'worker-1');
    expect(() => db.completeJob('job_1', 'worker-1')).toThrow(/lease lost/);
    db.close();
  });
  it('encrypts credentials with authenticated context', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'openpreflight-'));
    directories.push(directory);
    const key = await loadOrCreateKey(join(directory, 'key'));
    const encrypted = encryptCredential('secret', key, 'source_1');
    expect(encrypted).not.toContain('secret');
    expect(decryptCredential(encrypted, key, 'source_1')).toBe('secret');
    expect(() => decryptCredential(encrypted, key, 'source_2')).toThrow();
    expect(() => decryptCredential('not-an-envelope', key, 'source_1')).toThrow();
    const supplied = Buffer.alloc(32, 7);
    expect(await loadOrCreateKey(join(directory, 'unused'), supplied.toString('base64'))).toEqual(
      supplied,
    );
    await expect(loadOrCreateKey(join(directory, 'unused'), 'bad')).rejects.toThrow(/32 bytes/);
  });
});
