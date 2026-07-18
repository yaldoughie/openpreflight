import { access, readFile, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
const roots = ['README.md', 'CONTRIBUTING.md', 'SECURITY.md', 'docs'];
const files: string[] = [];
async function walk(path: string): Promise<void> {
  const entries = await readdir(path, { withFileTypes: true });
  for (const entry of entries) {
    const child = resolve(path, entry.name);
    if (entry.isDirectory()) await walk(child);
    else if (entry.name.endsWith('.md')) files.push(child);
  }
}
for (const root of roots) {
  const path = resolve(root);
  if (root.endsWith('.md')) files.push(path);
  else await walk(path);
}
const broken: string[] = [];
for (const file of files) {
  const content = await readFile(file, 'utf8');
  for (const match of content.matchAll(/\[[^\]]+\]\((?!https?:|mailto:|#)([^)]+)\)/g)) {
    const target = match[1]?.split('#')[0];
    if (!target) continue;
    try {
      await access(resolve(dirname(file), decodeURIComponent(target)));
    } catch {
      broken.push(`${file}: ${target}`);
    }
  }
}
if (broken.length) {
  process.stderr.write(`Broken local documentation links:\n${broken.join('\n')}\n`);
  process.exitCode = 1;
} else process.stdout.write(`Checked ${files.length} documentation files.\n`);
