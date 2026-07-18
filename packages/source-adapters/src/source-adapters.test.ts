import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ZipArchive } from 'archiver';
import { describe, expect, it } from 'vitest';
import { ArchiveSourceAdapter } from './archive.js';
import { assertSafeArchivePath, safeDestination } from './paths.js';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

describe('archive path safety', () => {
  it.each(['../wp-config.php', '/etc/passwd', 'C:\\Windows\\system.ini', '\\\\server\\share'])(
    'rejects %s',
    (path) => expect(() => assertSafeArchivePath(path)).toThrow(),
  );
  it('allows nested content paths', () =>
    expect(assertSafeArchivePath('wp-content/plugins/example/main.php')).toBe(
      'wp-content/plugins/example/main.php',
    ));
  it('keeps extraction under the destination', () =>
    expect(safeDestination('C:\\safe', 'nested/file')).toMatch(/safe[\\/]nested[\\/]file$/));
  it('extracts only after manifest and file checksums verify', async () => {
    const root = await mkdtemp(join(tmpdir(), 'openpreflight-archive-'));
    const source = join(root, 'source');
    const archivePath = join(root, 'export.zip');
    const destination = join(root, 'destination');
    await mkdir(join(source, 'wp-content', 'plugins', 'fixture'), { recursive: true });
    await writeFile(join(source, 'database.sql.gz'), 'database');
    await writeFile(join(source, 'wp-content', 'plugins', 'fixture', 'fixture.php'), 'plugin');
    const checksums = {
      'database.sql.gz': sha256('database'),
      'wp-content/plugins/fixture/fixture.php': sha256('plugin'),
    };
    const checksumsText = JSON.stringify(checksums);
    await writeFile(join(source, 'checksums.json'), checksumsText);
    await writeFile(
      join(source, 'manifest.json'),
      JSON.stringify({
        schemaVersion: '1.0',
        siteType: 'single',
        archiveChecksum: sha256(checksumsText),
      }),
    );
    await new Promise<void>((done, fail) => {
      const output = createWriteStream(archivePath);
      const archive = new ZipArchive();
      output.once('close', done);
      archive.once('error', fail);
      archive.pipe(output);
      archive.directory(source, false);
      void archive.finalize();
    });
    try {
      await new ArchiveSourceAdapter().materialize({ path: archivePath }, destination);
      expect(
        await readFile(
          join(destination, 'wp-content', 'plugins', 'fixture', 'fixture.php'),
          'utf8',
        ),
      ).toBe('plugin');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it('rejects credential-bearing files even when their archive path is otherwise safe', async () => {
    const root = await mkdtemp(join(tmpdir(), 'openpreflight-sensitive-'));
    const archivePath = join(root, 'export.zip');
    const destination = join(root, 'destination');
    await new Promise<void>((done, fail) => {
      const output = createWriteStream(archivePath);
      const archive = new ZipArchive();
      output.once('close', done);
      archive.once('error', fail);
      archive.pipe(output);
      archive.append('<?php define("DB_PASSWORD", "production");', { name: 'wp-config.php' });
      void archive.finalize();
    });
    try {
      await expect(
        new ArchiveSourceAdapter().materialize({ path: archivePath }, destination),
      ).rejects.toThrow('Sensitive files are not permitted');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
