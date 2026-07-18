import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { ZipArchive } from 'archiver';
import { parse as parseYaml } from 'yaml';

await import('./build.js');
const out = resolve('dist/release');
const releaseDate = new Date(
  Number(process.env.SOURCE_DATE_EPOCH ?? Math.floor(Date.UTC(2026, 6, 18) / 1000)) * 1000,
);
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
async function zip(
  name: string,
  source: string,
  prefix?: string,
  ignore: string[] = [],
): Promise<string> {
  const target = join(out, name);
  await new Promise<void>((done, fail) => {
    const output = createWriteStream(target);
    const archive = new ZipArchive({ zlib: { level: 9 } });
    output.once('close', done);
    output.once('error', fail);
    archive.once('error', fail);
    archive.pipe(output);
    archive.glob(
      '**/*',
      { cwd: resolve(source), dot: true, ignore },
      { ...(prefix ? { prefix } : {}), date: releaseDate },
    );
    void archive.finalize();
  });
  return target;
}
async function sourceZip(): Promise<string> {
  const target = join(out, 'openpreflight-1.0.0-source.zip');
  await new Promise<void>((done, fail) => {
    const output = createWriteStream(target);
    const archive = new ZipArchive({ zlib: { level: 9 } });
    output.once('close', done);
    output.once('error', fail);
    archive.once('error', fail);
    archive.pipe(output);
    archive.glob(
      '**/*',
      {
        cwd: resolve('.'),
        dot: true,
        ignore: [
          '.git/**',
          '.agents/**',
          '.codex/**',
          '.openpreflight/**',
          '.pnpm-store/**',
          'node_modules/**',
          'vendor/**',
          'coverage/**',
          'dist/**',
          '**/dist/**',
          '**/vendor/**',
        ],
      },
      { prefix: 'openpreflight-1.0.0', date: releaseDate },
    );
    void archive.finalize();
  });
  return target;
}
const artifacts = [
  await zip(
    'openpreflight-agent.zip',
    'wordpress-plugin/openpreflight-agent',
    'openpreflight-agent',
    ['tests/**', 'composer.json', 'composer.lock', 'phpunit.xml.dist'],
  ),
  await zip(
    'openpreflight-github-action.zip',
    'integrations/github-action',
    'openpreflight-action',
  ),
  await zip('openpreflight-cli.zip', 'apps/cli', 'openpreflight-cli'),
  await zip('openpreflight-server.zip', 'apps/server', 'openpreflight-server'),
  await zip('openpreflight-worker.zip', 'apps/worker', 'openpreflight-worker'),
  await zip('openpreflight-dashboard.zip', 'apps/dashboard/dist', 'openpreflight-dashboard'),
  await zip('openpreflight-runner-context.zip', 'docker', 'openpreflight-docker'),
  await sourceZip(),
];

const pnpmLockText = await readFile('pnpm-lock.yaml', 'utf8');
const composerLockText = await readFile('composer.lock', 'utf8');
const pnpmLock = parseYaml(pnpmLockText) as {
  packages?: Record<string, unknown>;
};
const composerLock = JSON.parse(composerLockText) as {
  packages?: Array<{ name: string; version: string }>;
  'packages-dev'?: Array<{ name: string; version: string }>;
};
const components = new Map<string, Record<string, unknown>>();
for (const key of Object.keys(pnpmLock.packages ?? {})) {
  const separator = key.lastIndexOf('@');
  if (separator < 1) continue;
  const name = key.slice(0, separator);
  const version = key.slice(separator + 1).split('(')[0];
  const id = `npm:${name}@${version}`;
  components.set(id, {
    type: 'library',
    name,
    version,
    purl: `pkg:npm/${name.startsWith('@') ? name.slice(1).replace('/', '%2F') : name}@${version}`,
  });
}
for (const dependency of [
  ...(composerLock.packages ?? []),
  ...(composerLock['packages-dev'] ?? []),
]) {
  const version = dependency.version.replace(/^v/, '');
  components.set(`composer:${dependency.name}@${version}`, {
    type: 'library',
    name: dependency.name,
    version,
    purl: `pkg:composer/${dependency.name}@${version}`,
  });
}
const sbom = {
  bomFormat: 'CycloneDX',
  specVersion: '1.6',
  serialNumber: `urn:uuid:${createHash('sha256')
    .update(`${pnpmLockText}\n${composerLockText}`)
    .digest('hex')
    .replace(/^(........)(....)(....)(....)(............).*/, '$1-$2-$3-$4-$5')}`,
  version: 1,
  metadata: {
    timestamp: releaseDate.toISOString(),
    component: {
      type: 'application',
      name: 'OpenPreflight',
      version: '1.0.0',
      licenses: [{ license: { id: 'GPL-2.0-or-later' } }],
    },
  },
  components: [...components.values()],
};
const sbomPath = join(out, 'openpreflight-sbom.cdx.json');
await writeFile(sbomPath, JSON.stringify(sbom, null, 2));
artifacts.push(sbomPath);
const releaseManifest = join(out, 'release-manifest.json');
await writeFile(
  releaseManifest,
  JSON.stringify(
    {
      schemaVersion: '1.0',
      version: '1.0.0',
      createdAt: releaseDate.toISOString(),
      artifacts: artifacts.map((artifact) => artifact.split(/[\\/]/).at(-1)),
      dockerImage: 'ghcr.io/REPLACE_BEFORE_RELEASE/openpreflight:1.0.0',
    },
    null,
    2,
  ),
);
artifacts.push(releaseManifest);
const lines: string[] = [];
for (const artifact of artifacts) {
  const content = await readFile(artifact);
  lines.push(
    `${createHash('sha256').update(content).digest('hex')}  ${artifact.split(/[\\/]/).at(-1)}`,
  );
}
await writeFile(join(out, 'SHA256SUMS'), `${lines.join('\n')}\n`);
process.stdout.write(`Created ${artifacts.length + 1} release artifacts in ${out}.\n`);
