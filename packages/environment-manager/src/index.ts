import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { OpenPreflightError, redactText } from '@openpreflight/core';

export interface ProcessResult {
  code: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}
export interface EnvironmentOptions {
  runId: string;
  projectRoot?: string;
  artifactsDirectory: string;
  networkMode: 'offline' | 'restricted' | 'custom';
  memoryLimit: string;
  cpuLimit: number;
  timeoutMs: number;
  wordpressVersion?: string;
  phpVersion?: string;
  allowedHosts?: readonly string[];
}

function validatedHosts(mode: EnvironmentOptions['networkMode'], requested: readonly string[]) {
  if (mode === 'offline') return [];
  const defaults = mode === 'restricted' ? ['api.wordpress.org', 'downloads.wordpress.org'] : [];
  return [...new Set([...defaults, ...requested])].map((host) => {
    const normalized = host.toLowerCase().replace(/^\./, '');
    if (
      !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(normalized) ||
      /(?:^|\.)(?:localhost|local|internal)$/.test(normalized)
    )
      throw new Error(`Unsafe external host allowlist entry: ${host}`);
    return normalized;
  });
}

export function createProxyConfig(
  mode: EnvironmentOptions['networkMode'],
  requested: readonly string[] = [],
): string {
  const hosts = validatedHosts(mode, requested);
  return [
    'http_port 3128',
    'visible_hostname openpreflight-egress',
    'acl internal src 172.16.0.0/12',
    'acl localnet dst 10.0.0.0/8 127.0.0.0/8 169.254.0.0/16 172.16.0.0/12 192.168.0.0/16 ::1',
    'acl metadata dst 169.254.169.254',
    ...(hosts.length
      ? [`acl approved dstdomain ${hosts.map((host) => `.${host}`).join(' ')}`]
      : []),
    'acl SSL_ports port 443',
    'acl Safe_ports port 80 443',
    'http_access deny metadata',
    'http_access deny localnet',
    'http_access deny !Safe_ports',
    'http_access deny CONNECT !SSL_ports',
    ...(hosts.length ? ['http_access allow internal approved'] : []),
    'http_access deny all',
    'access_log stdio:/var/log/squid/access.log',
    'cache deny all',
    'request_header_access Authorization deny all',
    'request_header_access Cookie deny all',
    'via off',
    'forwarded_for delete',
    '',
  ].join('\n');
}

export async function runProcess(
  file: string,
  args: readonly string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs: number; signal?: AbortSignal },
): Promise<ProcessResult> {
  return new Promise((resolvePromise, reject) => {
    const started = Date.now();
    const child = spawn(file, [...args], {
      cwd: options.cwd,
      env: options.env,
      shell: false,
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 3_000).unref();
    }, options.timeoutMs);
    const abort = () => child.kill('SIGTERM');
    options.signal?.addEventListener('abort', abort, { once: true });
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.once('error', (error) => {
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', abort);
      reject(error);
    });
    child.once('close', (code) => {
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', abort);
      const result = {
        code: code ?? -1,
        stdout: redactText(stdout),
        stderr: redactText(stderr),
        durationMs: Date.now() - started,
      };
      if (timedOut)
        reject(
          new OpenPreflightError(
            `Process timed out: ${file}`,
            'infrastructure',
            'CREATING_ENVIRONMENT',
            ['Increase the configured timeout only after inspecting the process logs.'],
            result.stderr,
          ),
        );
      else resolvePromise(result);
    });
  });
}

function safeRunId(runId: string): string {
  if (!/^run_[A-Za-z0-9_-]{4,64}$/.test(runId)) throw new Error('Unsafe run identifier.');
  return runId.toLowerCase().replaceAll('_', '-');
}

export class DockerEnvironment {
  readonly project: string;
  readonly root: string;
  readonly composeFile: string;
  constructor(readonly options: EnvironmentOptions) {
    this.project = `openpreflight-${safeRunId(options.runId)}`;
    this.root = resolve(options.projectRoot ?? '.');
    this.composeFile = resolve(this.root, 'docker/run.compose.yml');
  }
  private env(): NodeJS.ProcessEnv {
    return {
      ...process.env,
      OPENPREFLIGHT_RUN_ID: this.options.runId,
      OPENPREFLIGHT_ARTIFACTS: resolve(this.options.artifactsDirectory),
      OPENPREFLIGHT_NETWORK_MODE: this.options.networkMode,
      OPENPREFLIGHT_MEMORY_LIMIT: this.options.memoryLimit,
      OPENPREFLIGHT_CPU_LIMIT: String(this.options.cpuLimit),
      OPENPREFLIGHT_PROXY_CONFIG: resolve(this.options.artifactsDirectory, 'network', 'squid.conf'),
      OPENPREFLIGHT_ALLOWED_HOSTS: validatedHosts(
        this.options.networkMode,
        this.options.allowedHosts ?? [],
      ).join(','),
      OPENPREFLIGHT_WORDPRESS_TAG: this.options.wordpressVersion ?? '7.0.1-php8.3-apache',
    };
  }
  private async compose(args: readonly string[], signal?: AbortSignal): Promise<ProcessResult> {
    return runProcess(
      'docker',
      ['compose', '--project-name', this.project, '--file', this.composeFile, ...args],
      {
        cwd: this.root,
        env: this.env(),
        timeoutMs: this.options.timeoutMs,
        ...(signal ? { signal } : {}),
      },
    );
  }
  async create(signal?: AbortSignal): Promise<void> {
    await mkdir(this.options.artifactsDirectory, { recursive: true, mode: 0o700 });
    await mkdir(resolve(this.options.artifactsDirectory, 'network'), {
      recursive: true,
      mode: 0o700,
    });
    await writeFile(
      resolve(this.options.artifactsDirectory, 'network', 'squid.conf'),
      createProxyConfig(this.options.networkMode, this.options.allowedHosts),
      { mode: 0o600 },
    );
    const result = await this.compose(['up', '--detach', '--wait', '--wait-timeout', '90'], signal);
    await writeFile(
      resolve(this.options.artifactsDirectory, 'environment-create.log'),
      `${result.stdout}\n${result.stderr}`,
      { mode: 0o600 },
    );
    if (result.code !== 0)
      throw new OpenPreflightError(
        'The disposable WordPress environment failed to become healthy.',
        'infrastructure',
        'CREATING_ENVIRONMENT',
        [
          'Run openpreflight doctor.',
          `Inspect ${resolve(this.options.artifactsDirectory, 'environment-create.log')}.`,
        ],
        result.stderr,
      );
  }
  async wp(args: readonly string[], signal?: AbortSignal): Promise<ProcessResult> {
    const result = await this.compose(
      ['run', '--rm', '--no-deps', 'wpcli', 'wp', ...args, '--allow-root'],
      signal,
    );
    if (result.code !== 0)
      throw new OpenPreflightError(
        `WP-CLI failed: wp ${args.join(' ')}`,
        'infrastructure',
        'IMPORTING_SITE',
        ['Inspect the run WP-CLI log.'],
        result.stderr,
      );
    return result;
  }
  async importSource(signal?: AbortSignal): Promise<void> {
    const copy = await this.compose(
      [
        'run',
        '--rm',
        '--no-deps',
        '--entrypoint',
        'cp',
        'wpcli',
        '-a',
        '/source/wp-content/.',
        '/var/www/html/wp-content/',
      ],
      signal,
    );
    if (copy.code !== 0)
      throw new OpenPreflightError(
        'WordPress files could not be copied into the disposable volume.',
        'infrastructure',
        'IMPORTING_SITE',
        [],
        copy.stderr,
      );
  }
  async baseUrl(): Promise<string> {
    const result = await this.compose(['port', 'wordpress', '80']);
    if (result.code !== 0) throw new Error(result.stderr);
    const match = /(?:127\.0\.0\.1|0\.0\.0\.0|\[::\]):(\d+)/.exec(result.stdout);
    if (!match?.[1]) throw new Error(`Could not determine WordPress port: ${result.stdout}`);
    return `http://127.0.0.1:${match[1]}`;
  }
  async restoreDatabase(path = '/artifacts/baseline.sql', signal?: AbortSignal): Promise<void> {
    await this.wp(['db', 'import', path], signal);
  }
  async snapshot(label: 'baseline' | 'candidate', signal?: AbortSignal): Promise<void> {
    const result = await this.compose(
      ['exec', '-T', 'db', 'mariadb-dump', '-uopenpreflight', '-popenpreflight', 'openpreflight'],
      signal,
    );
    if (result.code !== 0)
      throw new OpenPreflightError(
        `Could not snapshot ${label} database.`,
        'infrastructure',
        'SNAPSHOTTING_BASELINE',
        [],
        result.stderr,
      );
    await writeFile(resolve(this.options.artifactsDirectory, `${label}.sql`), result.stdout, {
      mode: 0o600,
    });
  }
  async logs(): Promise<string> {
    const result = await this.compose(['logs', '--no-color']);
    return `${result.stdout}\n${result.stderr}`;
  }
  async destroy(): Promise<void> {
    const result = await this.compose(['down', '--volumes', '--remove-orphans', '--timeout', '10']);
    if (result.code !== 0)
      throw new OpenPreflightError(
        'Disposable environment cleanup failed.',
        'infrastructure',
        'CLEANING_UP',
        [`Run docker compose --project-name ${this.project} down --volumes --remove-orphans.`],
        result.stderr,
      );
  }
}
