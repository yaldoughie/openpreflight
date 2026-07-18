import type { Finding, FindingSeverity, VerdictDecision } from './types.js';

export interface VerdictPolicy {
  readonly failOn: readonly FindingSeverity[];
}

export function calculateVerdict(
  findings: readonly Finding[],
  policy: VerdictPolicy = { failOn: ['critical', 'error'] },
): VerdictDecision {
  const counts: Record<FindingSeverity, number> = { info: 0, warning: 0, error: 0, critical: 0 };
  const actionable = findings.filter(
    (finding) => finding.state === 'new' || finding.state === 'changed',
  );
  for (const finding of actionable) counts[finding.severity] += 1;
  const failures = actionable.filter((finding) => policy.failOn.includes(finding.severity));
  if (failures.length > 0)
    return {
      verdict: 'fail',
      counts,
      reasons: failures.map((finding) => `${finding.ruleId}: ${finding.title}`),
    };
  const warnings = actionable.filter((finding) => finding.severity === 'warning');
  return warnings.length > 0
    ? {
        verdict: 'warn',
        counts,
        reasons: warnings.map((finding) => `${finding.ruleId}: ${finding.title}`),
      }
    : { verdict: 'pass', counts, reasons: ['No new findings exceeded the configured policy.'] };
}
