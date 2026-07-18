import { createHash } from 'node:crypto';

const sensitiveName =
  /(?:password|passwd|dbpass|user[_-]?pass|secret|token|authorization|api[_-]?key|private[_-]?key|consumer[_-]?secret|client[_-]?secret|stripe|paypal|cookie|salt)/i;
const bearer = /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi;
const privateKey = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;
const email = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const assignedSecret =
  /(\b(?:password|passwd|dbpass|user[_-]?pass|secret|token|authorization|api[_-]?key|private[_-]?key|consumer[_-]?secret|client[_-]?secret|stripe|paypal|cookie|salt)\b\s*[:=]\s*)[^\s&,;]+/gi;

export interface RedactionOptions {
  readonly redactEmails?: boolean;
  readonly sensitivePatterns?: readonly RegExp[];
}
export const REDACTED = '[REDACTED]';

export function redactText(value: string, options: RedactionOptions = {}): string {
  let result = value
    .replace(bearer, `Bearer ${REDACTED}`)
    .replace(privateKey, REDACTED)
    .replace(assignedSecret, `$1${REDACTED}`);
  if (options.redactEmails ?? true) result = result.replace(email, REDACTED);
  for (const pattern of options.sensitivePatterns ?? []) result = result.replace(pattern, REDACTED);
  return result;
}

export function redactValue(
  value: unknown,
  options: RedactionOptions = {},
  seen = new WeakSet<object>(),
): unknown {
  if (typeof value === 'string') return redactText(value, options);
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return '[CIRCULAR]';
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => redactValue(item, options, seen));
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, child]) => [
      key,
      sensitiveName.test(key) ? REDACTED : redactValue(child, options, seen),
    ]),
  );
}

export function secretFingerprint(secret: string): string {
  return createHash('sha256').update(secret).digest('hex').slice(0, 12);
}
