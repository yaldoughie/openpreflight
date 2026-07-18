import { isAbsolute, posix, resolve, sep } from 'node:path';

export function assertSafeArchivePath(name: string): string {
  if (
    !name ||
    name.includes('\0') ||
    isAbsolute(name) ||
    /^[A-Za-z]:/.test(name) ||
    name.startsWith('\\\\')
  )
    throw new Error(`Unsafe archive path: ${name}`);
  const normalized = posix.normalize(name.replaceAll('\\', '/'));
  if (normalized === '..' || normalized.startsWith('../') || normalized.includes('/../'))
    throw new Error(`Archive path escapes destination: ${name}`);
  return normalized.replace(/^\.\//, '');
}

export function safeDestination(root: string, entry: string): string {
  const base = resolve(root);
  const target = resolve(base, assertSafeArchivePath(entry));
  if (target !== base && !target.startsWith(`${base}${sep}`))
    throw new Error(`Archive path escapes destination: ${entry}`);
  return target;
}
