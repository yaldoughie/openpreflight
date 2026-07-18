import { describe, expect, it } from 'vitest';
import { BUILT_IN_RULE_IDS, compareObservations, detectWordPressDiagnostics } from './index.js';
describe('rules', () => {
  it('registers every v1 built-in rule', () => expect(BUILT_IN_RULE_IDS).toHaveLength(24));
  it('classifies new, existing, changed, and resolved observations', () => {
    const old = [
      {
        ruleId: 'console-error' as const,
        key: 'a',
        title: 'Old',
        description: 'same',
        category: 'runtime',
      },
      {
        ruleId: 'page-error' as const,
        key: 'gone',
        title: 'Gone',
        description: 'gone',
        category: 'runtime',
      },
    ];
    const current = [
      { ...old[0]!, title: 'Changed' },
      {
        ruleId: 'php-fatal' as const,
        key: 'new',
        title: 'Fatal',
        description: 'fatal',
        category: 'php',
      },
    ];
    expect(
      compareObservations(old, current)
        .map((finding) => finding.state)
        .sort(),
    ).toEqual(['changed', 'new', 'resolved']);
  });
  it('recognizes fatal and database logs', () =>
    expect(
      detectWordPressDiagnostics('PHP Fatal error: boom\nWordPress database error nope').map(
        (item) => item.ruleId,
      ),
    ).toEqual(['php-fatal', 'database-error']));
});
