import { access, mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import { loadConfig } from '../packages/configuration/src/index.js';
import { createServer } from '../apps/server/src/index.js';

await mkdir('docs/assets', { recursive: true });
const server = await createServer(await loadConfig());
await server.listen({ host: '127.0.0.1', port: 4173 });
const systemChrome =
  process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : '';
const useSystemChrome = systemChrome
  ? await access(systemChrome).then(
      () => true,
      () => false,
    )
  : false;
const browser = await chromium.launch({
  headless: true,
  ...(useSystemChrome ? { executablePath: systemChrome } : {}),
});
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
  await page.getByRole('heading', { level: 1, name: 'Preflight overview' }).waitFor();
  for (const [link, heading] of [
    ['Sources', 'Sources'],
    ['Journeys', 'Journey library'],
    ['Test runs', 'Test runs'],
    ['Settings', 'Settings'],
  ] as const) {
    await page.getByRole('link', { name: link, exact: true }).click();
    await page.getByRole('heading', { level: 1, name: heading }).waitFor();
  }
  await page.getByRole('link', { name: 'Overview', exact: true }).click();
  await page.getByRole('heading', { level: 1, name: 'Preflight overview' }).waitFor();
  await page.goto('http://127.0.0.1:4173/');
  await page.getByRole('heading', { level: 1, name: 'Preflight overview' }).waitFor();
  await page.locator('body').press('Tab');
  const focused = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? '');
  const accessibility = await new AxeBuilder({ page }).analyze();
  await page.goto('http://127.0.0.1:4173/journeys/editor');
  await page.getByRole('button', { name: 'Validate' }).click();
  await page.getByText('Journey is valid.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Save version' }).click();
  await page.getByText('Journey version saved.', { exact: true }).waitFor();
  await page.goto('http://127.0.0.1:4173/settings');
  await page.getByRole('button', { name: 'Review cleanup' }).click();
  const cleanupDialog = page.getByRole('dialog', { name: 'Confirm expired artifact cleanup' });
  await cleanupDialog.waitFor();
  await page.getByRole('button', { name: 'Cancel' }).waitFor();
  if (
    !(await page
      .getByRole('button', { name: 'Cancel' })
      .evaluate((button) => button === document.activeElement))
  )
    throw new Error('Cleanup dialog did not place focus on its safe default action.');
  const dialogAccessibility = await new AxeBuilder({ page }).analyze();
  await page.keyboard.press('Escape');
  await cleanupDialog.waitFor({ state: 'detached' });
  await page.goto('http://127.0.0.1:4173/');
  if (
    focused !== 'Skip to main content' ||
    accessibility.violations.length ||
    dialogAccessibility.violations.length ||
    pageErrors.length ||
    consoleErrors.length
  )
    throw new Error(
      JSON.stringify(
        {
          focused,
          accessibility: accessibility.violations,
          dialogAccessibility: dialogAccessibility.violations,
          pageErrors,
          consoleErrors,
        },
        null,
        2,
      ),
    );
  await page.screenshot({ path: 'docs/assets/dashboard.png', fullPage: true });
  process.stdout.write(
    `Dashboard routes, journey editor, axe accessibility, focus navigation, and console verified; screenshot saved${useSystemChrome ? ' using system Chrome' : ''}.\n`,
  );
} finally {
  await browser.close();
  await server.close();
}
