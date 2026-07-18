import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { Ajv2020, type ErrorObject } from 'ajv/dist/2020.js';
import { parse as parseYaml } from 'yaml';
import schema from '../schemas/journey.schema.json' with { type: 'json' };

export type LocatorType =
  'role' | 'label' | 'placeholder' | 'text' | 'title' | 'alt' | 'testId' | 'name' | 'css' | 'xpath';
export type JourneyStep = Record<string, string | number | boolean | Record<string, unknown>>;
export interface Journey {
  schemaVersion: '1.0';
  id: string;
  name: string;
  description?: string;
  variables?: Record<string, string | number | boolean>;
  secrets?: Record<string, string>;
  environment?: Record<string, unknown>;
  defaults?: Record<string, unknown>;
  mask?: string[];
  steps: JourneyStep[];
}

const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
const validate = ajv.compile(schema);

export class JourneyValidationError extends Error {
  constructor(readonly validationErrors: readonly ErrorObject[]) {
    super(
      `Journey is invalid:\n${validationErrors.map((error) => `- ${error.instancePath || '/'} ${error.message ?? 'is invalid'}`).join('\n')}`,
    );
    this.name = 'JourneyValidationError';
  }
}

export function validateJourney(value: unknown): Journey {
  if (!validate(value)) throw new JourneyValidationError(validate.errors ?? []);
  return value as unknown as Journey;
}

export async function parseJourney(file: string): Promise<Journey> {
  const text = await readFile(file, 'utf8');
  return parseJourneyText(text, extname(file).toLowerCase() === '.json' ? 'json' : 'yaml');
}

export function parseJourneyText(text: string, format: 'yaml' | 'json' = 'yaml'): Journey {
  if (text.length > 1024 * 1024) throw new Error('Journey definitions are limited to 1 MiB.');
  const parsed: unknown = format === 'json' ? JSON.parse(text) : parseYaml(text);
  return validateJourney(parsed);
}

export function substituteVariables(
  value: unknown,
  variables: Readonly<Record<string, string | number | boolean>>,
): unknown {
  if (typeof value === 'string')
    return value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, name: string) => {
      if (!(name in variables)) throw new Error(`Unknown journey variable: ${name}`);
      return String(variables[name]);
    });
  if (Array.isArray(value)) return value.map((item) => substituteVariables(item, variables));
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, substituteVariables(child, variables)]),
    );
  return value;
}

export function resolveSecrets(journey: Journey, env: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(
    Object.entries(journey.secrets ?? {}).map(([name, environmentName]) => {
      const value = env[environmentName];
      if (!value)
        throw new Error(`Missing journey secret environment variable: ${environmentName}`);
      return [name, value];
    }),
  );
}
