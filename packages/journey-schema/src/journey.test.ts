import { describe, expect, it } from 'vitest';
import { resolveSecrets, substituteVariables, validateJourney } from './index.js';

describe('journey schema', () => {
  const journey = validateJourney({
    schemaVersion: '1.0',
    id: 'home',
    name: 'Home',
    secrets: { email: 'TEST_EMAIL' },
    steps: [{ visit: { path: '/' } }],
  });
  it('validates and substitutes variables recursively', () =>
    expect(
      substituteVariables({ path: '/${slug}', values: ['${n}'] }, { slug: 'shop', n: 2 }),
    ).toEqual({ path: '/shop', values: ['2'] }));
  it('resolves secrets without changing the journey', () =>
    expect(resolveSecrets(journey, { TEST_EMAIL: 'test@example.invalid' })).toEqual({
      email: 'test@example.invalid',
    }));
  it('fails closed when a declared secret is unavailable', () =>
    expect(() => resolveSecrets(journey, {})).toThrow(/TEST_EMAIL/));
  it('rejects arbitrary JavaScript steps', () =>
    expect(() =>
      validateJourney({
        schemaVersion: '1.0',
        id: 'x',
        name: 'X',
        steps: [{ evaluate: 'alert(1)' }],
      }),
    ).toThrow());
});
