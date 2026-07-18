import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { rm } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { request } from 'undici';
import type { SourceAdapter, SourceInspection } from '@openpreflight/core';

export interface AgentSourceConfig {
  url: string;
  token: string;
  id?: string;
  allowHttpLocal?: boolean;
}

function endpoint(config: AgentSourceConfig, path: string): URL {
  const base = new URL(config.url);
  if (
    base.protocol !== 'https:' &&
    !(config.allowHttpLocal && ['localhost', '127.0.0.1', '::1'].includes(base.hostname))
  )
    throw new Error('Agent sources require HTTPS except explicitly allowed loopback connections.');
  return new URL(`/wp-json/openpreflight/v1/${path}`, base);
}
async function jsonRequest<T>(
  config: AgentSourceConfig,
  path: string,
  method = 'GET',
  signal?: AbortSignal,
): Promise<T> {
  const response = await request(endpoint(config, path), {
    method,
    headers: { authorization: `Bearer ${config.token}`, accept: 'application/json' },
    ...(signal ? { signal } : {}),
  });
  if (response.statusCode === 401 || response.statusCode === 403)
    throw new Error('Agent authentication failed. Revoke and replace the scoped token.');
  if (response.statusCode < 200 || response.statusCode >= 300)
    throw new Error(`Agent request failed with HTTP ${response.statusCode}.`);
  return response.body.json() as Promise<T>;
}

export class AgentSourceAdapter implements SourceAdapter<AgentSourceConfig> {
  readonly type = 'agent' as const;
  validate(value: unknown): AgentSourceConfig {
    if (
      !value ||
      typeof value !== 'object' ||
      typeof (value as { url?: unknown }).url !== 'string' ||
      typeof (value as { token?: unknown }).token !== 'string'
    )
      throw new Error('An agent source requires url and token.');
    return value as AgentSourceConfig;
  }
  async inspect(config: AgentSourceConfig, signal?: AbortSignal): Promise<SourceInspection> {
    signal?.throwIfAborted();
    const manifest = await jsonRequest<{
      wordpressVersion: string;
      siteType: string;
      plugins?: SourceInspection['components'];
    }>(config, 'manifest', 'GET', signal);
    return {
      id: config.id ?? new URL(config.url).hostname,
      type: 'agent',
      wordpressVersion: manifest.wordpressVersion,
      multisite: manifest.siteType !== 'single',
      components: manifest.plugins ?? [],
      warnings:
        manifest.siteType !== 'single' ? ['WordPress multisite is unsupported in v1.0.'] : [],
    };
  }
  async materialize(
    config: AgentSourceConfig,
    destination: string,
    signal?: AbortSignal,
  ): Promise<void> {
    signal?.throwIfAborted();
    const job = await jsonRequest<{ id: string }>(config, 'exports', 'POST', signal);
    try {
      let status: { status: string; checksum?: string; downloadUrl?: string };
      const deadline = Date.now() + 15 * 60_000;
      do {
        await new Promise<void>((accept, reject) => {
          const abort = () => {
            clearTimeout(timer);
            reject(
              signal?.reason instanceof Error ? signal.reason : new Error('Export cancelled.'),
            );
          };
          const timer = setTimeout(() => {
            signal?.removeEventListener('abort', abort);
            accept();
          }, 1000);
          signal?.addEventListener('abort', abort, { once: true });
        });
        if (Date.now() > deadline) throw new Error('Agent export timed out after 15 minutes.');
        status = await jsonRequest(config, `exports/${encodeURIComponent(job.id)}`, 'GET', signal);
      } while (['queued', 'running'].includes(status.status));
      if (status.status !== 'complete' || !status.downloadUrl || !status.checksum)
        throw new Error(`Agent export failed with status ${status.status}.`);
      const download = new URL(status.downloadUrl, config.url);
      const paired = new URL(config.url);
      if (download.origin !== paired.origin)
        throw new Error('Agent download URL does not match the paired site origin.');
      const response = await request(download, {
        headers: { authorization: `Bearer ${config.token}` },
        ...(signal ? { signal } : {}),
      });
      if (response.statusCode !== 200)
        throw new Error(`Agent download failed with HTTP ${response.statusCode}.`);
      const hash = createHash('sha256');
      response.body.on('data', (chunk: Buffer) => hash.update(chunk));
      await pipeline(response.body, createWriteStream(destination, { flags: 'wx', mode: 0o600 }));
      if (hash.digest('hex').toLowerCase() !== status.checksum.toLowerCase())
        throw new Error('Agent export checksum mismatch.');
    } catch (error) {
      await rm(destination, { force: true });
      throw error;
    } finally {
      await jsonRequest(
        config,
        `exports/${encodeURIComponent(job.id)}`,
        'DELETE',
        AbortSignal.timeout(5000),
      ).catch(() => undefined);
    }
  }
  async cleanup(): Promise<void> {
    /* Remote exports are deleted immediately by materialize. */
  }
}
