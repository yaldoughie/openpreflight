import { createHash } from 'node:crypto';
import type { Finding, FindingSeverity } from '@openpreflight/core';

export const BUILT_IN_RULE_IDS = [
  'http-status',
  'php-fatal',
  'php-error',
  'wordpress-debug-log',
  'database-error',
  'console-error',
  'page-error',
  'failed-network-request',
  'new-external-request',
  'visual-difference',
  'dom-assertion',
  'accessibility-violation',
  'aria-snapshot-difference',
  'performance-budget',
  'missing-payment-method',
  'missing-shipping-method',
  'cart-count-mismatch',
  'unexpected-email',
  'update-installation-failure',
  'plugin-activation-failure',
  'shortcode-rendered-as-text',
  'blank-page',
  'login-failure',
  'rest-api-failure',
] as const;
export type BuiltInRuleId = (typeof BUILT_IN_RULE_IDS)[number];
export interface Observation {
  ruleId: BuiltInRuleId;
  key: string;
  title: string;
  description: string;
  severity?: FindingSeverity;
  category: string;
  evidence?: Finding['evidence'];
  remediation?: string;
  value?: number;
}

const defaultSeverities: Record<BuiltInRuleId, FindingSeverity> = {
  'http-status': 'error',
  'php-fatal': 'critical',
  'php-error': 'error',
  'wordpress-debug-log': 'warning',
  'database-error': 'critical',
  'console-error': 'error',
  'page-error': 'error',
  'failed-network-request': 'error',
  'new-external-request': 'warning',
  'visual-difference': 'warning',
  'dom-assertion': 'error',
  'accessibility-violation': 'error',
  'aria-snapshot-difference': 'warning',
  'performance-budget': 'warning',
  'missing-payment-method': 'error',
  'missing-shipping-method': 'error',
  'cart-count-mismatch': 'error',
  'unexpected-email': 'critical',
  'update-installation-failure': 'critical',
  'plugin-activation-failure': 'critical',
  'shortcode-rendered-as-text': 'error',
  'blank-page': 'critical',
  'login-failure': 'error',
  'rest-api-failure': 'error',
};
function idFor(observation: Observation): string {
  return `finding_${createHash('sha256').update(`${observation.ruleId}\0${observation.key}`).digest('hex').slice(0, 20)}`;
}

export function compareObservations(
  baseline: readonly Observation[],
  candidate: readonly Observation[],
): Finding[] {
  const before = new Map(baseline.map((item) => [`${item.ruleId}:${item.key}`, item]));
  const after = new Map(candidate.map((item) => [`${item.ruleId}:${item.key}`, item]));
  const findings: Finding[] = [];
  for (const [key, item] of after) {
    const previous = before.get(key);
    const changed = previous && JSON.stringify(previous) !== JSON.stringify(item);
    findings.push({
      id: idFor(item),
      ruleId: item.ruleId,
      ruleVersion: '1.0.0',
      title: item.title,
      description: item.description,
      severity: item.severity ?? defaultSeverities[item.ruleId],
      state: previous ? (changed ? 'changed' : 'existing') : 'new',
      category: item.category,
      ...(item.remediation ? { remediation: item.remediation } : {}),
      evidence: item.evidence ?? [],
    });
  }
  for (const [key, item] of before)
    if (!after.has(key))
      findings.push({
        id: idFor(item),
        ruleId: item.ruleId,
        ruleVersion: '1.0.0',
        title: item.title,
        description: item.description,
        severity: item.severity ?? defaultSeverities[item.ruleId],
        state: 'resolved',
        category: item.category,
        ...(item.remediation ? { remediation: item.remediation } : {}),
        evidence: item.evidence ?? [],
      });
  return findings;
}

export function observationsFromJourney(result: {
  console: Array<{ type: string; text: string }>;
  pageErrors: string[];
  network: Array<{ url: string; status?: number; failure?: string }>;
  accessibility: Array<{
    ruleId: string;
    impact: string | null;
    description: string;
    selector: string;
  }>;
  performance: { failedRequests: number };
  steps: Array<{ index: number; type: string; status: string; error?: string }>;
}): Observation[] {
  const observations: Observation[] = [];
  for (const [index, message] of result.console.entries())
    if (message.type === 'error')
      observations.push({
        ruleId: 'console-error',
        key: `${index}:${message.text}`,
        title: 'JavaScript console error',
        description: message.text,
        category: 'runtime',
      });
  for (const [index, message] of result.pageErrors.entries())
    observations.push({
      ruleId: 'page-error',
      key: `${index}:${message}`,
      title: 'Unhandled page error',
      description: message,
      category: 'runtime',
    });
  for (const request of result.network)
    if (request.failure || (request.status ?? 0) >= 400)
      observations.push({
        ruleId: (request.status ?? 0) >= 500 ? 'http-status' : 'failed-network-request',
        key: request.url,
        title: `Request failed${request.status ? ` with HTTP ${request.status}` : ''}`,
        description: request.failure ?? request.url,
        category: 'network',
        evidence: [{ type: 'network', title: 'Sanitized URL', value: request.url }],
      });
  for (const finding of result.accessibility)
    observations.push({
      ruleId: 'accessibility-violation',
      key: `${finding.ruleId}:${finding.selector}`,
      title: `Accessibility: ${finding.ruleId}`,
      description: finding.description,
      severity:
        finding.impact === 'critical'
          ? 'critical'
          : finding.impact === 'serious'
            ? 'error'
            : 'warning',
      category: 'accessibility',
    });
  for (const step of result.steps)
    if (step.status === 'failed')
      observations.push({
        ruleId: 'dom-assertion',
        key: `${step.index}:${step.type}`,
        title: `Journey step failed: ${step.type}`,
        description: step.error ?? 'The step did not complete.',
        category: 'functional',
      });
  return observations;
}

export function detectWordPressDiagnostics(log: string): Observation[] {
  const patterns: Array<[RegExp, BuiltInRuleId, string, FindingSeverity]> = [
    [/PHP Fatal error|Uncaught (?:Error|Exception)/i, 'php-fatal', 'PHP fatal error', 'critical'],
    [/PHP Parse error/i, 'php-error', 'PHP parse error', 'critical'],
    [/WordPress database error/i, 'database-error', 'WordPress database error', 'critical'],
    [/\bDeprecated\b/i, 'wordpress-debug-log', 'PHP deprecation', 'warning'],
    [/doing_it_wrong/i, 'wordpress-debug-log', 'WordPress doing_it_wrong notice', 'warning'],
  ];
  return log.split(/\r?\n/).flatMap((line, index) =>
    patterns
      .filter(([pattern]) => pattern.test(line))
      .map(([, ruleId, title, severity]) => ({
        ruleId,
        key: `${index}:${line}`,
        title,
        description: line,
        severity,
        category: 'wordpress',
      })),
  );
}
