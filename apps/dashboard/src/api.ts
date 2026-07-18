export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set('accept', 'application/json');
  if (init?.body) headers.set('content-type', 'application/json');
  const response = await fetch(`/api/v1${path}`, {
    ...init,
    headers,
  });
  const body = (await response.json()) as T | { error?: { message?: string } };
  if (!response.ok)
    throw new ApiError(
      response.status,
      'error' in (body as object)
        ? ((body as { error?: { message?: string } }).error?.message ?? `HTTP ${response.status}`)
        : `HTTP ${response.status}`,
    );
  return body as T;
}
