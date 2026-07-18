import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { AxeBuilder } from '@axe-core/playwright';
import {
  chromium,
  firefox,
  webkit,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
  type Response,
} from 'playwright';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { redactText } from '@openpreflight/core';
import { substituteVariables, type Journey, type JourneyStep } from '@openpreflight/journey-schema';

export interface BrowserProfile {
  id: string;
  browser: 'chromium' | 'firefox' | 'webkit';
  viewport: { width: number; height: number };
}
export interface NetworkRecord {
  method: string;
  url: string;
  resourceType: string;
  status?: number;
  durationMs?: number;
  failure?: string;
}
export interface ConsoleRecord {
  type: string;
  text: string;
  location?: string;
}
export interface AccessibilityRecord {
  ruleId: string;
  impact: string | null;
  description: string;
  help: string;
  selector: string;
  html: string;
}
export interface PerformanceRecord {
  ttfb?: number;
  domContentLoaded?: number;
  load?: number;
  fcp?: number;
  lcp?: number;
  cls?: number;
  longTasks?: number;
  transferBytes: number;
  requests: number;
  failedRequests: number;
}
export interface JourneyResult {
  journeyId: string;
  profileId: string;
  startedAt: string;
  completedAt: string;
  status: 'passed' | 'failed' | 'invalid';
  steps: Array<{
    index: number;
    type: string;
    durationMs: number;
    status: 'passed' | 'failed';
    error?: string;
  }>;
  console: ConsoleRecord[];
  pageErrors: string[];
  network: NetworkRecord[];
  accessibility: AccessibilityRecord[];
  performance: PerformanceRecord;
  screenshots: string[];
}
export interface JourneyRunOptions {
  baseUrl: string;
  artifactsDirectory: string;
  profile: BrowserProfile;
  variables?: Record<string, string | number | boolean>;
  secrets?: Record<string, string>;
  timeoutMs?: number;
  ignoredConsole?: RegExp[];
  allowedNetworkFailures?: RegExp[];
  screenshotMasks?: string[];
  signal?: AbortSignal;
}

function safeUrl(input: string): string {
  try {
    const url = new URL(input);
    for (const key of [...url.searchParams.keys()])
      if (/(?:token|key|secret|password|auth|email)/i.test(key))
        url.searchParams.set(key, '[REDACTED]');
    url.username = '';
    url.password = '';
    return redactText(url.toString());
  } catch {
    return redactText(input);
  }
}
function asObject(value: JourneyStep[string]): Record<string, unknown> {
  return value && typeof value === 'object' ? value : { value };
}
function targetLocator(page: Page, target: unknown): Locator {
  if (!target || typeof target !== 'object') throw new Error('Step requires a target locator.');
  const value = target as Record<string, unknown>;
  if (typeof value.role === 'string')
    return page.getByRole(
      value.role as Parameters<Page['getByRole']>[0],
      typeof value.name === 'string' ? { name: value.name } : {},
    );
  if (typeof value.label === 'string') return page.getByLabel(value.label);
  if (typeof value.placeholder === 'string') return page.getByPlaceholder(value.placeholder);
  if (typeof value.text === 'string') return page.getByText(value.text);
  if (typeof value.title === 'string') return page.getByTitle(value.title);
  if (typeof value.alt === 'string') return page.getByAltText(value.alt);
  if (typeof value.testId === 'string') return page.getByTestId(value.testId);
  if (typeof value.name === 'string') return page.locator(`[name=${JSON.stringify(value.name)}]`);
  if (typeof value.css === 'string') return page.locator(value.css);
  if (typeof value.xpath === 'string') return page.locator(`xpath=${value.xpath}`);
  throw new Error('Unsupported target locator.');
}

async function executeStep(
  page: Page,
  context: BrowserContext,
  type: string,
  raw: JourneyStep[string],
  options: JourneyRunOptions,
  state: {
    console: ConsoleRecord[];
    pageErrors: string[];
    network: NetworkRecord[];
    screenshots: string[];
  },
): Promise<void> {
  const value = asObject(raw);
  const target = 'target' in value ? targetLocator(page, value.target) : undefined;
  const timeout = typeof value.timeout === 'number' ? value.timeout : (options.timeoutMs ?? 10_000);
  switch (type) {
    case 'visit': {
      const path = typeof raw === 'string' ? raw : String(value.path ?? '/');
      await page.goto(new URL(path, options.baseUrl).toString(), {
        waitUntil:
          (value.waitUntil as 'load' | 'domcontentloaded' | 'networkidle' | 'commit' | undefined) ??
          'networkidle',
        timeout,
      });
      break;
    }
    case 'click':
      await target?.click({ timeout });
      break;
    case 'doubleClick':
      await target?.dblclick({ timeout });
      break;
    case 'fill': {
      const text = typeof value.secret === 'string' ? options.secrets?.[value.secret] : value.value;
      if (text === undefined) throw new Error('Fill step is missing value or resolved secret.');
      await target?.fill(String(text), { timeout });
      break;
    }
    case 'clear':
      await target?.clear({ timeout });
      break;
    case 'select':
      await target?.selectOption(String(value.value), { timeout });
      break;
    case 'check':
      await target?.check({ timeout });
      break;
    case 'uncheck':
      await target?.uncheck({ timeout });
      break;
    case 'press':
      await target?.press(String(value.key ?? value.value), { timeout });
      break;
    case 'hover':
      await target?.hover({ timeout });
      break;
    case 'focus':
      await target?.focus();
      break;
    case 'upload':
      await target?.setInputFiles(String(value.path));
      break;
    case 'waitFor':
      if (target)
        await target.waitFor({
          state:
            (value.state as 'attached' | 'detached' | 'visible' | 'hidden' | undefined) ??
            'visible',
          timeout,
        });
      else await page.waitForTimeout(Number(value.milliseconds ?? value.value ?? 100));
      break;
    case 'waitForResponse':
      await page.waitForResponse(
        (response) => response.url().includes(String(value.url ?? value.value)),
        { timeout },
      );
      break;
    case 'waitForRequest':
      await page.waitForRequest(
        (request) => request.url().includes(String(value.url ?? value.value)),
        { timeout },
      );
      break;
    case 'expect': {
      if (typeof value.cartItems === 'number') {
        const cart = page.locator('.cart-contents-count, .count, [data-cart-count]').first();
        const text = await cart.textContent({ timeout });
        if (Number(text?.replace(/\D/g, '')) !== value.cartItems)
          throw new Error(
            `Expected ${value.cartItems} cart items, received ${text ?? 'no count'}.`,
          );
        break;
      }
      if (!target) throw new Error('Expect step requires target or a supported domain assertion.');
      const stateName = String(value.state ?? 'visible');
      if (stateName === 'visible' && !(await target.isVisible()))
        throw new Error('Expected target to be visible.');
      if (stateName === 'hidden' && (await target.isVisible()))
        throw new Error('Expected target to be hidden.');
      if (stateName === 'enabled' && !(await target.isEnabled()))
        throw new Error('Expected target to be enabled.');
      if (typeof value.text === 'string' && !(await target.textContent())?.includes(value.text))
        throw new Error(`Expected target text to contain ${value.text}.`);
      break;
    }
    case 'screenshot': {
      const name = String(value.name ?? `checkpoint-${state.screenshots.length + 1}`).replace(
        /[^A-Za-z0-9_-]/g,
        '-',
      );
      const path = resolve(options.artifactsDirectory, `${name}.png`);
      const masks = [
        ...(options.screenshotMasks ?? []),
        ...(Array.isArray(value.mask) ? value.mask.map(String) : []),
      ].map((selector) => page.locator(selector));
      if (target) await target.screenshot({ path, animations: 'disabled', mask: masks });
      else
        await page.screenshot({
          path,
          fullPage: Boolean(value.fullPage),
          animations: 'disabled',
          mask: masks,
        });
      state.screenshots.push(path);
      break;
    }
    case 'setCookie':
      await context.addCookies([
        { name: String(value.name), value: String(value.value), url: options.baseUrl },
      ]);
      break;
    case 'clearCookies':
      await context.clearCookies();
      break;
    case 'loginAsWordPressUser': {
      await page.goto(new URL('/wp-login.php', options.baseUrl).toString());
      const username =
        typeof value.usernameSecret === 'string'
          ? options.secrets?.[value.usernameSecret]
          : value.username;
      const password =
        typeof value.passwordSecret === 'string'
          ? options.secrets?.[value.passwordSecret]
          : value.password;
      if (!username || !password)
        throw new Error('WordPress login requires secret-backed username and password.');
      await page.getByLabel(/username|email/i).fill(String(username));
      await page.getByLabel(/password/i).fill(String(password));
      await page.getByRole('button', { name: /log in/i }).click();
      await page.waitForURL(/wp-admin|profile/);
      break;
    }
    case 'logout':
      await page.goto(new URL('/wp-login.php?action=logout', options.baseUrl).toString());
      {
        const link = page.getByRole('link', { name: /log out/i });
        if (await link.isVisible()) await link.click();
      }
      break;
    case 'addWooCommerceProductToCart': {
      const path = String(value.path ?? '/');
      await page.goto(new URL(path, options.baseUrl).toString());
      await page.getByRole('button', { name: /add to cart/i }).click();
      break;
    }
    case 'assertCartCount': {
      const expected = Number(value.value ?? raw);
      const locator = page.locator('.cart-contents-count, .count, [data-cart-count]').first();
      const actual = Number((await locator.textContent())?.replace(/\D/g, ''));
      if (actual !== expected)
        throw new Error(`Expected cart count ${expected}, received ${actual}.`);
      break;
    }
    case 'assertNoPhpFatal': {
      const response = await page.request.get(
        new URL('/?openpreflight_health=1', options.baseUrl).toString(),
      );
      if (response.status() >= 500)
        throw new Error(`Health request returned HTTP ${response.status()}.`);
      break;
    }
    case 'assertNoConsoleErrors': {
      const errors = state.console.filter(
        (item) =>
          item.type === 'error' &&
          !(options.ignoredConsole ?? []).some((pattern) => pattern.test(item.text)),
      );
      if (errors.length) throw new Error(`${errors.length} unexpected console errors occurred.`);
      break;
    }
    case 'assertNoFailedRequests': {
      const failures = state.network.filter(
        (item) =>
          (item.failure || (item.status ?? 0) >= 400) &&
          !(options.allowedNetworkFailures ?? []).some((pattern) => pattern.test(item.url)),
      );
      if (failures.length)
        throw new Error(`${failures.length} unexpected failed requests occurred.`);
      break;
    }
    case 'assertPaymentMethodsAvailable':
      if (
        (await page.locator('.woocommerce-checkout-payment input[name="payment_method"]').count()) <
        Number(value.minimum ?? 1)
      )
        throw new Error('No WooCommerce payment method is available.');
      break;
    case 'assertShippingMethodsAvailable':
      if (
        (await page.locator('input[name^="shipping_method"]').count()) < Number(value.minimum ?? 1)
      )
        throw new Error('No WooCommerce shipping method is available.');
      break;
    default:
      throw new Error(`Unsupported journey step: ${type}`);
  }
}

export async function runJourney(
  journey: Journey,
  options: JourneyRunOptions,
): Promise<JourneyResult> {
  await mkdir(options.artifactsDirectory, { recursive: true, mode: 0o700 });
  const launcher = { chromium, firefox, webkit }[options.profile.browser];
  options.signal?.throwIfAborted();
  const browser: Browser = await launcher.launch({ headless: true });
  const closeOnAbort = () => void browser.close();
  options.signal?.addEventListener('abort', closeOnAbort, { once: true });
  const startedAt = new Date().toISOString();
  const context = await browser.newContext({
    viewport: options.profile.viewport,
    locale: String(journey.environment?.locale ?? 'en-US'),
    timezoneId: String(journey.environment?.timezone ?? 'UTC'),
    colorScheme:
      (journey.environment?.colorScheme as 'light' | 'dark' | 'no-preference' | undefined) ??
      'light',
    reducedMotion: 'reduce',
    deviceScaleFactor: 1,
    recordVideo: { dir: join(options.artifactsDirectory, 'video') },
  });
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  await context.addInitScript(() => {
    const metrics = { lcp: 0, cls: 0, longTasks: 0 };
    Object.defineProperty(globalThis, '__openPreflightMetrics', {
      value: metrics,
      configurable: true,
    });
    try {
      new PerformanceObserver((list) => {
        const last = list.getEntries().at(-1);
        if (last) metrics.lcp = last.startTime;
      }).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const shift = entry as PerformanceEntry & { value?: number; hadRecentInput?: boolean };
          if (!shift.hadRecentInput) metrics.cls += shift.value ?? 0;
        }
      }).observe({ type: 'layout-shift', buffered: true });
      new PerformanceObserver((list) => {
        metrics.longTasks += list.getEntries().length;
      }).observe({ type: 'longtask', buffered: true });
    } catch {
      // Older optional browser profiles can omit individual observer entry types.
    }
  });
  const page = await context.newPage();
  page.setDefaultTimeout(
    options.timeoutMs ??
      (typeof journey.defaults?.timeout === 'number' ? journey.defaults.timeout : 10_000),
  );
  const state = {
    console: [] as ConsoleRecord[],
    pageErrors: [] as string[],
    network: [] as NetworkRecord[],
    screenshots: [] as string[],
  };
  const requestStarted = new Map<string, number>();
  page.on('console', (message) =>
    state.console.push({
      type: message.type(),
      text: redactText(message.text()),
      location: safeUrl(message.location().url),
    }),
  );
  page.on('pageerror', (error) => state.pageErrors.push(redactText(error.message)));
  page.on('request', (request) => requestStarted.set(request.url(), performance.now()));
  page.on('response', (response: Response) =>
    state.network.push({
      method: response.request().method(),
      url: safeUrl(response.url()),
      resourceType: response.request().resourceType(),
      status: response.status(),
      durationMs: Math.round(
        performance.now() - (requestStarted.get(response.url()) ?? performance.now()),
      ),
    }),
  );
  page.on('requestfailed', (request) =>
    state.network.push({
      method: request.method(),
      url: safeUrl(request.url()),
      resourceType: request.resourceType(),
      failure: redactText(request.failure()?.errorText ?? 'unknown'),
    }),
  );
  page.on('dialog', (dialog) => void dialog.dismiss());
  const steps: JourneyResult['steps'] = [];
  let status: JourneyResult['status'] = 'passed';
  const expanded = substituteVariables(journey.steps, {
    ...(journey.variables ?? {}),
    ...(options.variables ?? {}),
  }) as JourneyStep[];
  for (const [index, step] of expanded.entries()) {
    const [type, value] = Object.entries(step)[0] ?? [];
    const started = performance.now();
    if (!type || value === undefined) continue;
    try {
      await executeStep(page, context, type, value, options, state);
      steps.push({
        index,
        type,
        durationMs: Math.round(performance.now() - started),
        status: 'passed',
      });
    } catch (error) {
      status = 'failed';
      steps.push({
        index,
        type,
        durationMs: Math.round(performance.now() - started),
        status: 'failed',
        error: redactText(error instanceof Error ? error.message : String(error)),
      });
      break;
    }
  }
  const axe = await new AxeBuilder({ page }).analyze();
  const accessibility = axe.violations.flatMap((violation) =>
    violation.nodes.map((node) => ({
      ruleId: violation.id,
      impact: violation.impact ?? null,
      description: violation.description,
      help: violation.help,
      selector: node.target.join(' '),
      html: redactText(node.html).slice(0, 1000),
    })),
  );
  const timing = await page.evaluate(() => {
    const navigation = performance.getEntriesByType('navigation')[0] as
      PerformanceNavigationTiming | undefined;
    const paints = performance.getEntriesByType('paint');
    const observed = (
      globalThis as typeof globalThis & {
        __openPreflightMetrics?: { lcp: number; cls: number; longTasks: number };
      }
    ).__openPreflightMetrics;
    const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    return {
      ttfb: navigation?.responseStart,
      domContentLoaded: navigation?.domContentLoadedEventEnd,
      load: navigation?.loadEventEnd,
      fcp: paints.find((entry) => entry.name === 'first-contentful-paint')?.startTime,
      lcp: observed?.lcp,
      cls: observed?.cls,
      longTasks: observed?.longTasks,
      transferBytes:
        (navigation?.transferSize ?? 0) +
        resources.reduce((total, resource) => total + resource.transferSize, 0),
    };
  });
  const performanceRecord: PerformanceRecord = {
    transferBytes: timing.transferBytes,
    requests: state.network.length,
    failedRequests: state.network.filter((item) => item.failure || (item.status ?? 0) >= 400)
      .length,
  };
  if (typeof timing.ttfb === 'number') performanceRecord.ttfb = timing.ttfb;
  if (typeof timing.domContentLoaded === 'number')
    performanceRecord.domContentLoaded = timing.domContentLoaded;
  if (typeof timing.load === 'number') performanceRecord.load = timing.load;
  if (typeof timing.fcp === 'number') performanceRecord.fcp = timing.fcp;
  if (typeof timing.lcp === 'number') performanceRecord.lcp = timing.lcp;
  if (typeof timing.cls === 'number') performanceRecord.cls = timing.cls;
  if (typeof timing.longTasks === 'number') performanceRecord.longTasks = timing.longTasks;
  await context.tracing.stop({ path: join(options.artifactsDirectory, 'trace.zip') });
  await context.close();
  await browser.close();
  options.signal?.removeEventListener('abort', closeOnAbort);
  const result: JourneyResult = {
    journeyId: journey.id,
    profileId: options.profile.id,
    startedAt,
    completedAt: new Date().toISOString(),
    status,
    steps,
    console: state.console,
    pageErrors: state.pageErrors,
    network: state.network,
    accessibility,
    performance: performanceRecord,
    screenshots: state.screenshots,
  };
  await writeFile(
    join(options.artifactsDirectory, 'journey-result.json'),
    JSON.stringify(result, null, 2),
    { mode: 0o600 },
  );
  return result;
}

export async function compareScreenshots(
  baselinePath: string,
  candidatePath: string,
  diffPath: string,
  threshold = 0.1,
): Promise<{ changedPixels: number; changedPercent: number; compatible: boolean }> {
  const baseline = PNG.sync.read(await readFile(baselinePath));
  const candidate = PNG.sync.read(await readFile(candidatePath));
  if (baseline.width !== candidate.width || baseline.height !== candidate.height)
    return {
      changedPixels: baseline.width * baseline.height,
      changedPercent: 100,
      compatible: false,
    };
  const diff = new PNG({ width: baseline.width, height: baseline.height });
  const changedPixels = pixelmatch(
    baseline.data,
    candidate.data,
    diff.data,
    baseline.width,
    baseline.height,
    { threshold, includeAA: false },
  );
  await writeFile(diffPath, PNG.sync.write(diff));
  return {
    changedPixels,
    changedPercent: (changedPixels / (baseline.width * baseline.height)) * 100,
    compatible: true,
  };
}
