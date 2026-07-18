import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Ajv2020, type ErrorObject } from 'ajv/dist/2020.js';
import { redactValue, type Finding, type VerdictDecision } from '@openpreflight/core';
import schema from '../schemas/report.schema.json' with { type: 'json' };

export interface OpenPreflightReport {
  schemaVersion: '1.0';
  openPreflightVersion: string;
  generatedAt: string;
  run: { id: string; stage: string; baselineAt?: string; candidateAt?: string };
  site: { name: string; sourceId?: string; wordpressVersion?: string; phpVersion?: string };
  updates: Array<Record<string, unknown>>;
  findings: Finding[];
  verdict: VerdictDecision;
  journeys?: Array<Record<string, unknown>>;
  diagnostics?: Record<string, unknown>;
  sanitization?: Array<Record<string, unknown>>;
  artifacts?: Array<Record<string, unknown>>;
  skipped?: Array<Record<string, unknown>>;
  disclaimers: string[];
}
export interface GeneratedReport {
  format: 'json' | 'html' | 'junit' | 'sarif';
  path: string;
  sha256: string;
  size: number;
}

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validate = ajv.compile(schema);
export function validateReport(value: unknown): OpenPreflightReport {
  if (!validate(value))
    throw new Error(
      `Report schema validation failed:\n${(validate.errors ?? []).map((error: ErrorObject) => `${error.instancePath} ${error.message}`).join('\n')}`,
    );
  return value as unknown as OpenPreflightReport;
}
const xml = (value: unknown) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
const html = (value: unknown) => xml(value);
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

function htmlReport(report: OpenPreflightReport): string {
  const groups = ['critical', 'error', 'warning', 'info']
    .map((severity) => {
      const findings = report.findings.filter((finding) => finding.severity === severity);
      return findings.length
        ? `<section aria-labelledby="${severity}-title"><h2 id="${severity}-title">${html(severity.charAt(0).toUpperCase() + severity.slice(1))} <span class="count">${findings.length}</span></h2>${findings.map((finding) => `<article class="finding ${html(finding.state)}"><h3>${html(finding.title)}</h3><p><span class="badge">${html(finding.state)}</span> <code>${html(finding.ruleId)}</code></p><p>${html(finding.description)}</p>${finding.remediation ? `<p><strong>Suggested remediation:</strong> ${html(finding.remediation)}</p>` : ''}${finding.evidence.length ? `<details><summary>Evidence</summary><ul>${finding.evidence.map((evidence) => `<li>${html(evidence.title)}${evidence.value === undefined ? '' : `: ${html(evidence.value)}`}</li>`).join('')}</ul></details>` : ''}</article>`).join('')}</section>`
        : '';
    })
    .join('');
  const updates = report.updates.length
    ? `<ul>${report.updates.map((update) => `<li>${html(update.type)} ${html(update.slug)}: ${html(update.currentVersion)} → ${html(update.candidateVersion)}</li>`).join('')}</ul>`
    : '<p>No component updates were recorded.</p>';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>OpenPreflight ${html(report.run.id)} — ${html(report.verdict.verdict.toUpperCase())}</title><style>:root{font-family:system-ui,-apple-system,sans-serif;line-height:1.55;color-scheme:light dark;--accent:#2563eb;--danger:#b91c1c;--surface:color-mix(in srgb,Canvas 94%,CanvasText 6%)}*{box-sizing:border-box}body{margin:0;background:Canvas;color:CanvasText}a{color:LinkText}.skip{position:absolute;inset-inline-start:-9999px}.skip:focus{inset:1rem auto auto 1rem;background:Canvas;padding:.7rem;z-index:2}header,main,footer{max-width:72rem;margin:auto;padding:1.25rem}.verdict{border-inline-start:.5rem solid ${report.verdict.verdict === 'fail' || report.verdict.verdict === 'error' ? 'var(--danger)' : 'var(--accent)'};background:var(--surface);padding:1rem;border-radius:.4rem}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(14rem,1fr));gap:1rem}.card,.finding{background:var(--surface);padding:1rem;border-radius:.5rem;margin-block:1rem}.badge,.count{display:inline-block;border:1px solid currentColor;border-radius:999px;padding:.1rem .5rem;font-size:.8em}.resolved{opacity:.8}code{overflow-wrap:anywhere}:focus-visible{outline:.2rem solid var(--accent);outline-offset:.2rem}@media(prefers-reduced-motion:no-preference){details{scroll-margin-top:1rem}}@media print{.skip{display:none}}</style></head><body><a class="skip" href="#main">Skip to report</a><header><p>OpenPreflight ${html(report.openPreflightVersion)}</p><h1>Run ${html(report.run.id)}</h1><div class="verdict" role="status"><h2>${html(report.verdict.verdict.toUpperCase())}</h2><p>${html(report.verdict.reasons.join(' '))}</p></div></header><main id="main"><section aria-labelledby="summary"><h2 id="summary">Summary</h2><div class="grid"><div class="card"><strong>Site</strong><br>${html(report.site.name)}</div><div class="card"><strong>Generated</strong><br><time datetime="${html(report.generatedAt)}">${html(report.generatedAt)}</time></div><div class="card"><strong>Stage</strong><br>${html(report.run.stage)}</div></div></section><section aria-labelledby="updates"><h2 id="updates">Updates tested</h2>${updates}</section>${groups || '<p>No findings.</p>'}<section aria-labelledby="limitations"><h2 id="limitations">Important limitations</h2><ul>${report.disclaimers.map((item) => `<li>${html(item)}</li>`).join('')}</ul></section></main><footer><p>This self-contained report loads no external resources. Review clone privacy obligations before sharing it.</p></footer></body></html>`;
}

function junitReport(report: OpenPreflightReport): string {
  const actionable = report.findings.filter(
    (finding) => finding.state === 'new' || finding.state === 'changed',
  );
  const failures = actionable.filter(
    (finding) => finding.severity === 'critical' || finding.severity === 'error',
  );
  return `<?xml version="1.0" encoding="UTF-8"?><testsuites name="OpenPreflight" tests="${actionable.length || 1}" failures="${failures.length}"><testsuite name="${xml(report.run.id)}" tests="${actionable.length || 1}" failures="${failures.length}">${actionable.length ? actionable.map((finding) => `<testcase classname="${xml(finding.category)}" name="${xml(finding.ruleId)}">${finding.severity === 'critical' || finding.severity === 'error' ? `<failure message="${xml(finding.title)}" type="${xml(finding.severity)}">${xml(finding.description)}</failure>` : `<system-out>${xml(finding.description)}</system-out>`}</testcase>`).join('') : '<testcase classname="openpreflight" name="no-regressions" />'}</testsuite></testsuites>`;
}
function sarifReport(report: OpenPreflightReport): string {
  const suitable = report.findings.filter((finding) =>
    ['accessibility', 'runtime', 'wordpress', 'configuration', 'network'].includes(
      finding.category,
    ),
  );
  return JSON.stringify(
    {
      version: '2.1.0',
      $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
      runs: [
        {
          tool: {
            driver: {
              name: 'OpenPreflight',
              version: report.openPreflightVersion,
              informationUri: 'https://github.com/yaldoughie/openpreflight',
              rules: [
                ...new Map(
                  suitable.map((finding) => [
                    finding.ruleId,
                    {
                      id: finding.ruleId,
                      shortDescription: { text: finding.title },
                      help: { text: finding.remediation ?? finding.description },
                    },
                  ]),
                ).values(),
              ],
            },
          },
          results: suitable.map((finding) => ({
            ruleId: finding.ruleId,
            level:
              finding.severity === 'critical' || finding.severity === 'error'
                ? 'error'
                : finding.severity === 'warning'
                  ? 'warning'
                  : 'note',
            message: { text: finding.description },
            properties: { state: finding.state, category: finding.category },
          })),
        },
      ],
    },
    null,
    2,
  );
}

export async function generateReports(
  input: OpenPreflightReport,
  directory: string,
  formats: readonly GeneratedReport['format'][] = ['html', 'json', 'junit', 'sarif'],
): Promise<GeneratedReport[]> {
  const report = validateReport(redactValue(input) as OpenPreflightReport);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const generated: GeneratedReport[] = [];
  for (const format of formats) {
    const contents =
      format === 'json'
        ? JSON.stringify(report, null, 2)
        : format === 'html'
          ? htmlReport(report)
          : format === 'junit'
            ? junitReport(report)
            : sarifReport(report);
    const extension = format === 'junit' ? 'xml' : format;
    const path = join(directory, `report.${extension}`);
    await writeFile(path, contents, { mode: 0o600 });
    generated.push({ format, path, sha256: hash(contents), size: Buffer.byteLength(contents) });
  }
  return generated;
}
