import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Ajv2020, type ErrorObject } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { parse as parseYaml } from 'yaml';
import schema from '../schemas/configuration.schema.json' with { type: 'json' };

export interface OpenPreflightConfig {
  schemaVersion: '1.0';
  server: { host: string; port: number };
  storage: { directory: string; retentionDays: number; retainFailedRuns: boolean };
  docker: {
    networkMode: 'offline' | 'restricted' | 'custom';
    memoryLimit: string;
    cpuLimit: number;
    timeoutMinutes: number;
    allowedHosts: string[];
  };
  browser: {
    profiles: Array<{
      id: string;
      browser: 'chromium' | 'firefox' | 'webkit';
      viewport: { width: number; height: number };
    }>;
  };
  reports: { formats: Array<'html' | 'json' | 'junit' | 'sarif'> };
  privacy: {
    redactEmails: boolean;
    redactQuerySecrets: boolean;
    rawExportRetentionMinutes: number;
  };
  policies: { failOn: Array<'info' | 'warning' | 'error' | 'critical'> };
}

export const defaultConfig: OpenPreflightConfig = {
  schemaVersion: '1.0',
  server: { host: '127.0.0.1', port: 4173 },
  storage: { directory: '.openpreflight', retentionDays: 14, retainFailedRuns: true },
  docker: {
    networkMode: 'restricted',
    memoryLimit: '2g',
    cpuLimit: 2,
    timeoutMinutes: 30,
    allowedHosts: ['api.wordpress.org', 'downloads.wordpress.org'],
  },
  browser: {
    profiles: [
      { id: 'desktop', browser: 'chromium', viewport: { width: 1440, height: 1000 } },
      { id: 'mobile', browser: 'chromium', viewport: { width: 390, height: 844 } },
    ],
  },
  reports: { formats: ['html', 'json', 'junit', 'sarif'] },
  privacy: { redactEmails: true, redactQuerySecrets: true, rawExportRetentionMinutes: 0 },
  policies: { failOn: ['critical', 'error'] },
};

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats.default(ajv);
const validate = ajv.compile(schema);

export class ConfigurationError extends Error {
  constructor(readonly validationErrors: readonly ErrorObject[]) {
    super(
      `Configuration is invalid:\n${validationErrors.map((error) => `- ${error.instancePath || '/'} ${error.message ?? 'is invalid'}`).join('\n')}`,
    );
    this.name = 'ConfigurationError';
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function deepMerge<T>(...values: readonly unknown[]): T {
  const output: Record<string, unknown> = {};
  for (const value of values) {
    if (!isObject(value)) continue;
    for (const [key, child] of Object.entries(value))
      output[key] =
        isObject(child) && isObject(output[key]) ? deepMerge(output[key], child) : child;
  }
  return output as T;
}

export function configFromEnvironment(env: NodeJS.ProcessEnv): Partial<OpenPreflightConfig> {
  const result: Record<string, unknown> = {};
  if (env.OPENPREFLIGHT_SERVER_HOST) result.server = { host: env.OPENPREFLIGHT_SERVER_HOST };
  if (env.OPENPREFLIGHT_SERVER_PORT)
    result.server = {
      ...(result.server as object | undefined),
      port: Number(env.OPENPREFLIGHT_SERVER_PORT),
    };
  if (env.OPENPREFLIGHT_STORAGE_DIRECTORY)
    result.storage = { directory: env.OPENPREFLIGHT_STORAGE_DIRECTORY };
  if (env.OPENPREFLIGHT_NETWORK_MODE)
    result.docker = { networkMode: env.OPENPREFLIGHT_NETWORK_MODE };
  return result as Partial<OpenPreflightConfig>;
}

export function validateConfig(value: unknown): OpenPreflightConfig {
  if (!validate(value)) throw new ConfigurationError(validate.errors ?? []);
  return value as unknown as OpenPreflightConfig;
}

export async function loadConfig(
  file = 'openpreflight.config.yaml',
  overrides: Partial<OpenPreflightConfig> = {},
  env = process.env,
): Promise<OpenPreflightConfig> {
  const path = resolve(file);
  let project: unknown = {};
  try {
    project = parseYaml(await readFile(path, 'utf8')) as unknown;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  return validateConfig(deepMerge(defaultConfig, project, configFromEnvironment(env), overrides));
}
