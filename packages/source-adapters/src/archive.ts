import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { lstat, mkdir, readFile, rm, stat } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';
import tar from 'tar-stream';
import unzipper from 'unzipper';
import type { SourceAdapter, SourceInspection } from '@openpreflight/core';
import { safeDestination } from './paths.js';

export interface ArchiveLimits {
  maxArchiveBytes: number;
  maxUncompressedBytes: number;
  maxFiles: number;
  maxFileBytes: number;
}
export interface ArchiveSourceConfig {
  path: string;
  id?: string;
  limits?: Partial<ArchiveLimits>;
}
const defaults: ArchiveLimits = {
  maxArchiveBytes: 2 * 1024 ** 3,
  maxUncompressedBytes: 10 * 1024 ** 3,
  maxFiles: 100_000,
  maxFileBytes: 2 * 1024 ** 3,
};

function rejectSensitiveEntry(path: string): void {
  const segments = path.replaceAll('\\', '/').split('/');
  const name = segments.at(-1)?.toLowerCase() ?? '';
  if (
    name === 'wp-config.php' ||
    name === '.env' ||
    name === 'debug.log' ||
    name === '.htpasswd' ||
    /^(?:id_rsa|id_ed25519)$/.test(name) ||
    /\.(?:pem|key|p12|pfx)$/i.test(name)
  )
    throw new Error(`Sensitive files are not permitted in an export: ${path}`);
}

async function digest(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

async function verifyExport(destination: string): Promise<void> {
  const manifestPath = safeDestination(destination, 'manifest.json');
  const checksumsPath = safeDestination(destination, 'checksums.json');
  const [manifestStat, checksumStat] = await Promise.all([stat(manifestPath), stat(checksumsPath)]);
  if (manifestStat.size > 1024 ** 2 || checksumStat.size > 16 * 1024 ** 2)
    throw new Error('Export metadata exceeds its safety limit.');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<string, unknown>;
  if (manifest.schemaVersion !== '1.0') throw new Error('Unsupported export schema version.');
  if (manifest.siteType !== 'single')
    throw new Error('WordPress multisite exports are unsupported in OpenPreflight v1.0.');
  if (
    typeof manifest.archiveChecksum !== 'string' ||
    (await digest(checksumsPath)) !== manifest.archiveChecksum
  )
    throw new Error('The export checksum manifest does not match manifest.json.');
  const rawChecksums = JSON.parse(await readFile(checksumsPath, 'utf8')) as unknown;
  if (!rawChecksums || typeof rawChecksums !== 'object' || Array.isArray(rawChecksums))
    throw new Error('checksums.json must be an object.');
  for (const [relativePath, expected] of Object.entries(rawChecksums)) {
    if (typeof expected !== 'string' || !/^[a-f0-9]{64}$/i.test(expected))
      throw new Error(`Invalid checksum for ${relativePath}.`);
    const target = safeDestination(destination, relativePath);
    const file = await lstat(target);
    if (!file.isFile() || file.isSymbolicLink())
      throw new Error(`Checksum target is not a regular file: ${relativePath}`);
    if ((await digest(target)).toLowerCase() !== expected.toLowerCase())
      throw new Error(`Checksum verification failed: ${relativePath}`);
  }
  const databaseGzip = safeDestination(destination, 'database.sql.gz');
  const databaseSql = safeDestination(destination, 'database.sql');
  const hasDatabase = await stat(databaseGzip)
    .then((value) => value.isFile())
    .catch(() =>
      stat(databaseSql)
        .then((value) => value.isFile())
        .catch(() => false),
    );
  if (!hasDatabase) throw new Error('The export does not contain database.sql or database.sql.gz.');
  if (
    !(await stat(safeDestination(destination, 'wp-content')).catch(() => undefined))?.isDirectory()
  )
    throw new Error('The export does not contain wp-content/.');
}

function count(limits: ArchiveLimits) {
  let files = 0;
  let total = 0;
  return (size: number) => {
    files += 1;
    total += size;
    if (files > limits.maxFiles) throw new Error('Archive file-count limit exceeded.');
    if (size > limits.maxFileBytes) throw new Error('Archive individual-file limit exceeded.');
    if (total > limits.maxUncompressedBytes)
      throw new Error('Archive uncompressed-size limit exceeded.');
  };
}

async function extractZip(path: string, destination: string, limits: ArchiveLimits): Promise<void> {
  const account = count(limits);
  const parser = createReadStream(path).pipe(unzipper.Parse({ forceStream: true }));
  for await (const entry of parser) {
    const zipEntry = entry as unzipper.Entry;
    const variables = zipEntry.vars as typeof zipEntry.vars & {
      uncompressedSize?: number;
      externalFileAttributes?: number;
    };
    const size = Number(variables.uncompressedSize ?? 0);
    account(size);
    rejectSensitiveEntry(zipEntry.path);
    const target = safeDestination(destination, zipEntry.path);
    const mode = Number(variables.externalFileAttributes ?? 0) >>> 16;
    if ((mode & 0o170000) === 0o120000) {
      zipEntry.autodrain();
      throw new Error(`Archive symlinks are not allowed: ${zipEntry.path}`);
    }
    if (zipEntry.type === 'Directory') {
      await mkdir(target, { recursive: true, mode: 0o750 });
      zipEntry.autodrain();
      continue;
    }
    if (zipEntry.type !== 'File') {
      zipEntry.autodrain();
      throw new Error(`Unsupported archive entry: ${zipEntry.path}`);
    }
    await mkdir(resolve(target, '..'), { recursive: true, mode: 0o750 });
    await pipeline(zipEntry, createWriteStream(target, { mode: 0o640, flags: 'wx' }));
  }
}

async function extractTarGz(
  path: string,
  destination: string,
  limits: ArchiveLimits,
): Promise<void> {
  const account = count(limits);
  const extract = tar.extract();
  extract.on('entry', (header, stream, next) => {
    void (async () => {
      account(header.size ?? 0);
      rejectSensitiveEntry(header.name);
      const target = safeDestination(destination, header.name);
      if (header.type === 'directory') {
        await mkdir(target, { recursive: true, mode: 0o750 });
        stream.resume();
        stream.once('end', next);
        return;
      }
      if (header.type !== 'file') {
        stream.resume();
        throw new Error(`Tar links and special entries are not allowed: ${header.name}`);
      }
      await mkdir(resolve(target, '..'), { recursive: true, mode: 0o750 });
      await pipeline(stream, createWriteStream(target, { mode: 0o640, flags: 'wx' }));
      next();
    })().catch((error: unknown) =>
      extract.destroy(error instanceof Error ? error : new Error(String(error))),
    );
  });
  await pipeline(createReadStream(path), createGunzip(), extract);
}

export class ArchiveSourceAdapter implements SourceAdapter<ArchiveSourceConfig> {
  readonly type = 'archive' as const;
  validate(value: unknown): ArchiveSourceConfig {
    if (
      !value ||
      typeof value !== 'object' ||
      typeof (value as { path?: unknown }).path !== 'string'
    )
      throw new Error('An archive source requires a path.');
    return value as ArchiveSourceConfig;
  }
  async inspect(config: ArchiveSourceConfig, signal?: AbortSignal): Promise<SourceInspection> {
    signal?.throwIfAborted();
    return {
      id: config.id ?? 'archive',
      type: 'archive',
      wordpressVersion: 'from-manifest',
      multisite: false,
      components: [],
      warnings: ['Full manifest inspection occurs after safe extraction.'],
    };
  }
  async materialize(
    config: ArchiveSourceConfig,
    destination: string,
    signal?: AbortSignal,
  ): Promise<void> {
    signal?.throwIfAborted();
    const limits = { ...defaults, ...config.limits };
    const path = resolve(config.path);
    const archiveSize = (await stat(path)).size;
    if (archiveSize > limits.maxArchiveBytes)
      throw new Error('Archive compressed-size limit exceeded.');
    await mkdir(destination, { recursive: false, mode: 0o700 });
    try {
      if (extname(path).toLowerCase() === '.zip') await extractZip(path, destination, limits);
      else if (/\.(?:tar\.gz|tgz)$/i.test(path)) await extractTarGz(path, destination, limits);
      else throw new Error('Supported archive formats are .zip, .tar.gz, and .tgz.');
      await verifyExport(destination);
    } catch (error) {
      await rm(destination, { recursive: true, force: true });
      throw error;
    }
  }
  async cleanup(): Promise<void> {
    /* Local archive sources allocate no remote resource. */
  }
}
