import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('dashboard navigation and automated accessibility baseline', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Preflight overview' })).toBeVisible();
  await page.getByRole('link', { name: 'Sources', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Sources' })).toBeVisible();
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  await page.goto('/settings');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test('journey editor validates and saves a real version', async ({ page }) => {
  await page.goto('/journeys/editor');
  const editor = page.getByLabel('Journey YAML');
  await expect(editor).toBeVisible();
  await page.getByRole('button', { name: 'Validate' }).click();
  await expect(page.getByRole('status')).toContainText('Journey is valid.');
  await page.getByRole('button', { name: 'Save version' }).click();
  await expect(page.getByRole('status')).toContainText('Journey version saved.');
});

test('retention confirmation uses modal focus management', async ({ page }) => {
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Review cleanup' }).click();
  const dialog = page.getByRole('dialog', { name: 'Confirm expired artifact cleanup' });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancel' })).toBeFocused();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});
