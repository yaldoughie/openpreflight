import { execFile } from 'node:child_process';
import { access, cp, readdir, readFile, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { basename, join, resolve, sep } from 'node:path';
import type { SourceAdapter, SourceInspection } from '@openpreflight/core';

export interface LocalSourceConfig {
  path: string;
  id?: string;
}

async function readable(path: string): Promise<void> {
  await access(path, constants.R_OK);
}

function runWp(path: string, args: string[], signal?: AbortSignal): Promise<string> {
  const executable = process.env.OPENPREFLIGHT_WP_CLI ?? 'wp';
  return new Promise((accept, reject) => {
    execFile(
      executable,
      [...args, `--path=${path}`, '--skip-plugins', '--skip-themes'],
      { encoding: 'utf8', maxBuffer: 8 * 1024 ** 2, signal, windowsHide: true },
      (error, stdout, stderr) => {
        if (error) {
          reject(
            new Error(
              `WP-CLI could not inspect the local source: ${stderr.trim() || error.message}. ` +
                'Set OPENPREFLIGHT_WP_CLI to the WP-CLI executable and verify database access.',
            ),
          );
          return;
        }
        accept(stdout);
      },
    );
  });
}

function safeLocalCopy(source: string, path: string): boolean {
  const relative = path
    .slice(source.length)
    .replace(/^[\\/]+/, '')
    .replaceAll('\\', '/');
  if (!relative) return true;
  const segments = relative.split('/');
  const name = segments.at(-1)?.toLowerCase() ?? '';
  if (
    segments.some((segment) =>
      /^(?:\.git|node_modules|cache|backup|backups|logs?|tmp)$/i.test(segment),
    )
  )
    return false;
  return !(
    name === 'wp-config.php' ||
    name === '.env' ||
    name === 'debug.log' ||
    name === '.htpasswd' ||
    /^(?:id_rsa|id_ed25519)$/.test(name) ||
    /\.(?:pem|key|p12|pfx)$/i.test(name)
  );
}
async function componentDirectories(
  root: string,
  type: 'plugin' | 'theme',
): Promise<SourceInspection['components']> {
  const directory = join(root, 'wp-content', `${type}s`);
  try {
    return (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => ({ type, slug: entry.name, version: 'unknown', active: false }));
  } catch {
    return [];
  }
}

export class LocalWordPressAdapter implements SourceAdapter<LocalSourceConfig> {
  readonly type = 'local' as const;
  validate(value: unknown): LocalSourceConfig {
    if (
      !value ||
      typeof value !== 'object' ||
      typeof (value as { path?: unknown }).path !== 'string'
    )
      throw new Error('A local source requires a path.');
    return {
      path: resolve((value as { path: string }).path),
      ...((value as { id?: string }).id ? { id: (value as { id: string }).id } : {}),
    };
  }
  async inspect(config: LocalSourceConfig, signal?: AbortSignal): Promise<SourceInspection> {
    signal?.throwIfAborted();
    const root = resolve(config.path);
    await readable(join(root, 'wp-config.php'));
    await readable(join(root, 'wp-includes', 'version.php'));
    await readable(join(root, 'wp-admin'));
    if (!(await stat(root)).isDirectory())
      throw new Error(`Local source is not a directory: ${root}`);
    const versionFile = await readFile(join(root, 'wp-includes', 'version.php'), 'utf8');
    const version = /\$wp_version\s*=\s*['"]([^'"]+)['"]/.exec(versionFile)?.[1] ?? 'unknown';
    const configText = await readFile(join(root, 'wp-config.php'), 'utf8');
    const multisite = /define\s*\(\s*['"]MULTISITE['"]\s*,\s*true\s*\)/i.test(configText);
    if (!multisite) {
      await runWp(root, ['core', 'is-installed'], signal);
      await runWp(root, ['db', 'check'], signal);
    }
    return {
      id: config.id ?? basename(root),
      type: 'local',
      wordpressVersion: version,
      multisite,
      components: [
        ...(await componentDirectories(root, 'plugin')),
        ...(await componentDirectories(root, 'theme')),
      ],
      warnings: multisite ? ['WordPress multisite is unsupported in OpenPreflight v1.0.'] : [],
    };
  }
  async materialize(
    config: LocalSourceConfig,
    destination: string,
    signal?: AbortSignal,
  ): Promise<void> {
    signal?.throwIfAborted();
    const source = resolve(config.path);
    const target = resolve(destination);
    if (
      target === source ||
      target.startsWith(`${source}${sep}`) ||
      source.startsWith(`${target}${sep}`)
    )
      throw new Error('Source and destination must not contain one another.');
    await cp(source, target, {
      recursive: true,
      errorOnExist: true,
      force: false,
      filter: (path) => safeLocalCopy(source, path),
    });
    await runWp(
      source,
      ['db', 'export', join(target, 'database.sql'), '--single-transaction'],
      signal,
    );
  }
  async cleanup(): Promise<void> {
    /* Local sources allocate no remote resource. */
  }
}
