import { describe, expect, it } from 'vitest';
import { canTransition } from './state-machine.js';
import { calculateVerdict } from './verdict.js';
import { redactText, redactValue } from './redaction.js';
import { exitCodeFor, OpenPreflightError, type ErrorKind } from './errors.js';
import type { Finding } from './types.js';

const finding = (severity: Finding['severity'], state: Finding['state'] = 'new'): Finding => ({
  id: 'finding-1',
  ruleId: 'test',
  ruleVersion: '1.0.0',
  title: 'Regression',
  description: 'Test',
  severity,
  state,
  category: 'test',
  evidence: [],
});

describe('run state machine', () => {
  it('allows only the next normal stage and terminal cleanup verdicts', () => {
    expect(canTransition('QUEUED', 'PREPARING_SOURCE')).toBe(true);
    expect(canTransition('QUEUED', 'RUNNING_BASELINE')).toBe(false);
    expect(canTransition('CLEANING_UP', 'FAILED')).toBe(true);
  });
});

describe('verdict', () => {
  it('fails for new errors but not unchanged errors', () => {
    expect(calculateVerdict([finding('error')]).verdict).toBe('fail');
    expect(calculateVerdict([finding('error', 'existing')]).verdict).toBe('pass');
  });
  it('warns for new warnings and explains configured failures', () => {
    expect(calculateVerdict([finding('warning')]).verdict).toBe('warn');
    const decision = calculateVerdict([finding('critical')]);
    expect(decision.reasons).toEqual(['test: Regression']);
    expect(decision.counts.critical).toBe(1);
  });
});

describe('redaction', () => {
  it('redacts nested secrets, bearer tokens, and emails', () => {
    expect(redactValue({ password: 'x', note: 'Bearer abc user@example.com' })).toEqual({
      password: '[REDACTED]',
      note: 'Bearer [REDACTED] [REDACTED]',
    });
  });
  it('redacts sensitive text while preserving ordinary values', () => {
    expect(redactValue(['plain', 'api_key=top-secret'], { redactEmails: false })).toEqual([
      'plain',
      'api_key=[REDACTED]',
    ]);
    expect(redactText('wp core config --dbpass=production-secret')).toBe(
      'wp core config --dbpass=[REDACTED]',
    );
  });
});

describe('stable exit codes', () => {
  it('maps every error kind to its documented code', () => {
    const expected: Record<ErrorKind, number> = {
      regression: 1,
      input: 2,
      infrastructure: 3,
      authentication: 4,
      cancelled: 5,
    };
    for (const [kind, code] of Object.entries(expected) as Array<[ErrorKind, number]>) {
      const error = new OpenPreflightError('failed', kind, 'QUEUED', ['retry'], 'evidence');
      expect(exitCodeFor(error)).toBe(code);
      expect(error.name).toBe('OpenPreflightError');
    }
  });
});
