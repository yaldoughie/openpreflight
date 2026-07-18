import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { DockerEnvironment } from '../../packages/environment-manager/src/index.js';

const dockerAvailable =
  spawnSync('docker', ['info'], { stdio: 'ignore', shell: false }).status === 0;
const directories: string[] = [];

afterAll(async () => {
  await Promise.all(
    directories.map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe.runIf(dockerAvailable)('disposable Docker environment', () => {
  it('starts WordPress, enforces clone HTTP policy, and destroys every resource', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'openpreflight-integration-'));
    directories.push(directory);
    await mkdir(join(directory, 'source'));
    const environment = new DockerEnvironment({
      runId: 'run_integration',
      artifactsDirectory: directory,
      networkMode: 'offline',
      memoryLimit: '2g',
      cpuLimit: 2,
      timeoutMs: 180_000,
    });
    try {
      await environment.create();
      const version = await environment.wp(['core', 'version']);
      expect(version.stdout).toMatch(/^\d+\.\d+/);
      const network = await environment.wp([
        'eval',
        "$result=wp_remote_get('https://example.com'); echo is_wp_error($result) ? $result->get_error_code() : 'unexpected-success';",
      ]);
      expect(network.stdout).toContain('openpreflight_network_blocked');
    } finally {
      await environment.destroy();
    }
    const project = spawnSync(
      'docker',
      [
        'ps',
        '--filter',
        'label=com.docker.compose.project=openpreflight-run-integration',
        '--quiet',
      ],
      { encoding: 'utf8', shell: false },
    );
    expect(project.stdout.trim()).toBe('');
  });
});

describe.skipIf(dockerAvailable)('disposable Docker environment', () => {
  it('is skipped with an explicit local prerequisite when the daemon is unavailable', () => {
    expect(dockerAvailable).toBe(false);
  });
});
