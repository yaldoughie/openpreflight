import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  configFromEnvironment,
  deepMerge,
  defaultConfig,
  loadConfig,
  validateConfig,
} from './index.js';

describe('configuration', () => {
  it('applies higher precedence values without dropping siblings', () => {
    const value = deepMerge<typeof defaultConfig>(
      defaultConfig,
      { server: { port: 9999 } },
      configFromEnvironment({ OPENPREFLIGHT_SERVER_HOST: '127.0.0.2' }),
    );
    expect(value.server).toEqual({ host: '127.0.0.2', port: 9999 });
  });
  it('returns all validation failures', () => {
    expect(() =>
      validateConfig({ schemaVersion: '2', server: { port: 70000, extra: true } }),
    ).toThrow(/must NOT have additional properties/);
  });
  it('loads YAML with environment and CLI precedence', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'openpreflight-config-'));
    const path = join(directory, 'config.yaml');
    await writeFile(path, 'schemaVersion: "1.0"\nserver:\n  port: 4000\n');
    try {
      const config = await loadConfig(
        path,
        { server: { host: '127.0.0.1', port: 4300 } },
        {
          OPENPREFLIGHT_SERVER_HOST: '127.0.0.2',
          OPENPREFLIGHT_STORAGE_DIRECTORY: '.private',
          OPENPREFLIGHT_NETWORK_MODE: 'offline',
        },
      );
      expect(config.server).toEqual({ host: '127.0.0.1', port: 4300 });
      expect(config.storage.directory).toBe('.private');
      expect(config.docker.networkMode).toBe('offline');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  it('uses defaults when the project file does not exist', async () => {
    const config = await loadConfig('definitely-not-an-openpreflight-file.yaml', {}, {});
    expect(config).toEqual(defaultConfig);
  });
});
