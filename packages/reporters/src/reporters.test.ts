import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { generateReports, validateReport, type OpenPreflightReport } from './index.js';
const dirs: string[] = [];
afterEach(async () =>
  Promise.all(dirs.splice(0).map((path) => rm(path, { recursive: true, force: true }))),
);
const report: OpenPreflightReport = {
  schemaVersion: '1.0',
  openPreflightVersion: '1.0.0',
  generatedAt: new Date(0).toISOString(),
  run: { id: 'run_test', stage: 'FAILED' },
  site: { name: 'Test' },
  updates: [],
  findings: [],
  verdict: {
    verdict: 'pass',
    reasons: ['No regressions'],
    counts: { info: 0, warning: 0, error: 0, critical: 0 },
  },
  disclaimers: ['Automated accessibility checks do not establish WCAG conformance.'],
};
describe('reporters', () => {
  it('validates and creates four offline formats', async () => {
    validateReport(report);
    const directory = await mkdtemp(join(tmpdir(), 'openpreflight-report-'));
    dirs.push(directory);
    const files = await generateReports(report, directory);
    expect(files.map((item) => item.format)).toEqual(['html', 'json', 'junit', 'sarif']);
    expect(await readFile(join(directory, 'report.html'), 'utf8')).not.toMatch(
      /https?:\/\/(?:cdn|fonts|analytics)/,
    );
  });
});
