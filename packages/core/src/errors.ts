export type ErrorKind = 'input' | 'infrastructure' | 'authentication' | 'cancelled' | 'regression';

export class OpenPreflightError extends Error {
  constructor(
    message: string,
    readonly kind: ErrorKind,
    readonly stage: string,
    readonly remedies: readonly string[] = [],
    readonly evidence?: string,
  ) {
    super(message);
    this.name = 'OpenPreflightError';
  }
}

export function exitCodeFor(error: OpenPreflightError): number {
  return { regression: 1, input: 2, infrastructure: 3, authentication: 4, cancelled: 5 }[
    error.kind
  ];
}
