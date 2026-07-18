import { existsSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import staticPlugin from '@fastify/static';
import { nanoid } from 'nanoid';
import { redactValue } from '@openpreflight/core';
import type { OpenPreflightConfig } from '@openpreflight/configuration';
import { OpenPreflightDatabase, ensureStorage } from '@openpreflight/database';
import {
  JourneyValidationError,
  parseJourneyText,
  validateJourney,
} from '@openpreflight/journey-schema';

const loopback = new Set(['127.0.0.1', '::1', 'localhost']);

export async function createServer(config: OpenPreflightConfig): Promise<FastifyInstance> {
  if (!loopback.has(config.server.host) && !process.env.OPENPREFLIGHT_API_TOKEN)
    throw new Error('OPENPREFLIGHT_API_TOKEN is required when the API binds beyond loopback.');
  const storage = await ensureStorage(resolve(config.storage.directory));
  const db = new OpenPreflightDatabase(storage.databasePath);
  db.migrate();
  const app = Fastify({
    logger: {
      level: process.env.OPENPREFLIGHT_LOG_LEVEL ?? 'info',
      redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers.set-cookie'],
    },
  });
  await app.register(sensible);
  await app.register(cors, {
    origin: loopback.has(config.server.host)
      ? /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/
      : false,
    credentials: false,
  });
  app.addHook('onRequest', async (request, reply) => {
    if (loopback.has(config.server.host) || request.url === '/api/v1/health') return;
    if (request.headers.authorization !== `Bearer ${process.env.OPENPREFLIGHT_API_TOKEN}`)
      return reply.code(401).send({
        error: {
          code: 'AUTHENTICATION_REQUIRED',
          message: 'A valid API bearer token is required.',
          requestId: request.id,
        },
      });
  });
  app.setErrorHandler((error: FastifyError, request, reply) => {
    request.log.error(
      { error: redactValue({ name: error.name, message: error.message }) },
      'Request failed',
    );
    const status =
      error instanceof JourneyValidationError
        ? 400
        : 'statusCode' in error && typeof error.statusCode === 'number'
          ? error.statusCode
          : 500;
    void reply.code(status).send({
      error: {
        code: status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR',
        message:
          status >= 500 && process.env.NODE_ENV === 'production'
            ? 'The request could not be completed.'
            : error.message,
        requestId: request.id,
      },
    });
  });
  app.get(
    '/api/v1/health',
    {
      schema: {
        response: {
          200: {
            type: 'object',
            required: ['status', 'version'],
            properties: { status: { const: 'ok' }, version: { type: 'string' } },
          },
        },
      },
    },
    async () => ({ status: 'ok', version: '1.0.0' }),
  );
  app.get('/api/v1/diagnostics', async () => ({
    version: '1.0.0',
    node: process.version,
    platform: process.platform,
    storage: storage.databasePath,
    networkMode: config.docker.networkMode,
    telemetry: false,
  }));
  app.get('/api/v1/sources', async () =>
    db.raw
      .prepare(
        'SELECT id,type,name,config_json AS config,created_at AS createdAt,updated_at AS updatedAt FROM sources WHERE deleted_at IS NULL ORDER BY created_at DESC',
      )
      .all(),
  );
  app.post(
    '/api/v1/sources',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['type', 'name', 'path'],
          properties: {
            type: { enum: ['local', 'archive'] },
            name: { type: 'string', minLength: 1, maxLength: 200 },
            path: { type: 'string', minLength: 1 },
          },
        },
      },
    },
    async (request, reply) => {
      const body = request.body as { type: 'local' | 'archive'; name: string; path: string };
      const id = `src_${nanoid(12)}`;
      const now = new Date().toISOString();
      db.raw
        .prepare(
          'INSERT INTO sources(id,type,name,config_json,created_at,updated_at) VALUES(?,?,?,?,?,?)',
        )
        .run(id, body.type, body.name, JSON.stringify({ path: body.path }), now, now);
      return reply.code(201).send({ id, type: body.type, name: body.name, createdAt: now });
    },
  );
  app.get('/api/v1/journeys', async () =>
    db.raw
      .prepare(
        'SELECT id,name,active_version_id AS activeVersionId,created_at AS createdAt,updated_at AS updatedAt FROM journeys ORDER BY name',
      )
      .all(),
  );
  app.post(
    '/api/v1/journeys/validate',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['text'],
          properties: {
            text: { type: 'string', minLength: 1, maxLength: 1048576 },
            format: { enum: ['yaml', 'json'] },
          },
        },
      },
    },
    async (request) => {
      const body = request.body as { text: string; format?: 'yaml' | 'json' };
      return {
        valid: true,
        definition: parseJourneyText(body.text, body.format ?? 'yaml'),
      };
    },
  );
  app.post(
    '/api/v1/journeys',
    {
      schema: {
        body: {
          type: 'object',
          required: ['id', 'name', 'definition'],
          properties: {
            id: { type: 'string', pattern: '^[a-z][a-z0-9-]*$' },
            name: { type: 'string', minLength: 1 },
            definition: { type: 'object' },
          },
        },
      },
    },
    async (request, reply) => {
      const body = request.body as { id: string; name: string; definition: unknown };
      const definition = validateJourney(body.definition);
      const versionId = `jv_${nanoid(12)}`;
      const now = new Date().toISOString();
      db.raw.transaction(() => {
        db.raw
          .prepare(
            'INSERT INTO journeys(id,name,active_version_id,created_at,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,active_version_id=excluded.active_version_id,updated_at=excluded.updated_at',
          )
          .run(body.id, body.name, versionId, now, now);
        db.raw
          .prepare(
            'INSERT INTO journey_versions(id,journey_id,schema_version,definition_json,created_at) VALUES(?,?,?,?,?)',
          )
          .run(versionId, body.id, '1.0', JSON.stringify(definition), now);
      })();
      return reply.code(201).send({ id: body.id, versionId });
    },
  );
  app.get('/api/v1/baselines', async () =>
    db.raw
      .prepare(
        'SELECT id,source_id AS sourceId,created_at AS createdAt FROM baselines WHERE deleted_at IS NULL ORDER BY created_at DESC',
      )
      .all(),
  );
  app.post(
    '/api/v1/baselines',
    {
      schema: {
        body: {
          type: 'object',
          required: ['sourceId'],
          properties: { sourceId: { type: 'string', minLength: 1 } },
        },
      },
    },
    async (request, reply) => {
      const { sourceId } = request.body as { sourceId: string };
      const baselineId = `base_${nanoid(12)}`;
      const runId = `run_${nanoid(16)}`;
      const jobId = `job_${nanoid(16)}`;
      db.createRun(runId, sourceId);
      db.enqueue({ id: jobId, runId, payload: { type: 'baseline', sourceId, baselineId } });
      return reply.code(202).send({ id: baselineId, runId, jobId });
    },
  );
  app.get('/api/v1/runs', async () =>
    db.raw
      .prepare(
        'SELECT id,source_id AS sourceId,stage,verdict,created_at AS createdAt,updated_at AS updatedAt FROM runs ORDER BY created_at DESC LIMIT 200',
      )
      .all(),
  );
  app.post(
    '/api/v1/runs',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            sourceId: { type: 'string', minLength: 1 },
            updates: { type: 'array', items: { type: 'string' } },
            journeys: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
    async (request, reply) => {
      const body = request.body as { sourceId?: string; updates?: string[]; journeys?: string[] };
      const runId = `run_${nanoid(16)}`;
      const jobId = `job_${nanoid(16)}`;
      db.createRun(runId, body.sourceId);
      db.enqueue({
        id: jobId,
        runId,
        payload: { type: 'run', ...body },
        deadlineAt: new Date(Date.now() + config.docker.timeoutMinutes * 60_000),
      });
      db.addEvent(jobId, 'queued', { runId });
      return reply.code(202).send({ id: runId, jobId, stage: 'QUEUED' });
    },
  );
  app.get('/api/v1/runs/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const run = db.raw
      .prepare(
        'SELECT id,source_id AS sourceId,stage,outcome_kind AS outcomeKind,verdict,cancel_requested AS cancelRequested,created_at AS createdAt,updated_at AS updatedAt,started_at AS startedAt,completed_at AS completedAt FROM runs WHERE id=?',
      )
      .get(id);
    return run ?? reply.notFound('Run not found.');
  });
  app.post('/api/v1/runs/:id/cancel', async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = db.raw
      .prepare(
        "UPDATE runs SET cancel_requested=1,updated_at=? WHERE id=? AND stage NOT IN ('PASSED','FAILED','ERROR','CANCELLED')",
      )
      .run(new Date().toISOString(), id);
    return result.changes
      ? { id, cancellationRequested: true }
      : reply.conflict('Run is terminal or does not exist.');
  });
  app.get('/api/v1/runs/:id/events', async (request, reply) => {
    const { id } = request.params as { id: string };
    let last = Number(request.headers['last-event-id'] ?? 0);
    reply.hijack();
    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    const send = () => {
      const rows = db.raw
        .prepare(
          'SELECT je.id,je.event_type,je.data_json FROM job_events je JOIN jobs j ON j.id=je.job_id WHERE j.run_id=? AND je.id>? ORDER BY je.id',
        )
        .all(id, last) as Array<{ id: number; event_type: string; data_json: string }>;
      for (const row of rows) {
        reply.raw.write(`id: ${row.id}\nevent: ${row.event_type}\ndata: ${row.data_json}\n\n`);
        last = row.id;
      }
    };
    send();
    const timer = setInterval(() => {
      if (!reply.raw.destroyed) {
        send();
        reply.raw.write(': heartbeat\n\n');
      }
    }, 1_000);
    request.raw.on('close', () => clearInterval(timer));
  });
  app.get('/api/v1/reports', async () =>
    db.raw
      .prepare(
        "SELECT id,run_id AS runId,kind,relative_path AS path,created_at AS createdAt FROM artifacts WHERE kind IN ('report-html','report-json','report-junit','report-sarif') ORDER BY created_at DESC",
      )
      .all(),
  );
  app.get('/api/v1/artifacts/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = db.raw.prepare('SELECT kind,relative_path FROM artifacts WHERE id=?').get(id) as
      { kind: string; relative_path: string } | undefined;
    if (!row) return reply.notFound('Artifact not found.');
    const root = resolve(config.storage.directory);
    const path = resolve(root, row.relative_path);
    if (!path.startsWith(`${root}\\`) && !path.startsWith(`${root}/`))
      return reply.forbidden('Artifact path is outside storage.');
    const content = await readFile(path);
    return reply
      .type(
        row.kind === 'report-html'
          ? 'text/html; charset=utf-8'
          : row.kind === 'report-json' || row.kind === 'report-sarif'
            ? 'application/json'
            : 'application/xml',
      )
      .send(content);
  });
  app.get('/api/v1/settings', async () => ({
    storage: config.storage,
    docker: config.docker,
    browser: config.browser,
    reports: config.reports,
    privacy: config.privacy,
    telemetry: false,
  }));
  const retentionPreview = () => {
    const cutoff = new Date(Date.now() - config.storage.retentionDays * 86_400_000).toISOString();
    const items = db.raw
      .prepare(
        'SELECT id,run_id AS runId,kind,relative_path AS relativePath,size_bytes AS sizeBytes,created_at AS createdAt FROM artifacts WHERE created_at < ? ORDER BY created_at LIMIT 1000',
      )
      .all(cutoff) as Array<{
      id: string;
      runId: string;
      kind: string;
      relativePath: string;
      sizeBytes: number;
      createdAt: string;
    }>;
    return {
      retentionDays: config.storage.retentionDays,
      items,
      bytes: items.reduce((total, item) => total + item.sizeBytes, 0),
    };
  };
  app.get('/api/v1/retention/preview', async () => retentionPreview());
  app.delete(
    '/api/v1/retention',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['confirm'],
          properties: { confirm: { const: true } },
        },
      },
    },
    async () => {
      const preview = retentionPreview();
      const storageRoot = resolve(config.storage.directory);
      const deleted: string[] = [];
      for (const item of preview.items) {
        const target = resolve(storageRoot, item.relativePath);
        if (target === storageRoot || !target.startsWith(`${storageRoot}${sep}`))
          throw new Error(`Unsafe retained artifact path: ${item.relativePath}`);
        await rm(target, { force: true });
        db.raw.transaction(() => {
          db.raw.prepare('DELETE FROM artifacts WHERE id=?').run(item.id);
          db.raw
            .prepare(
              'INSERT INTO retention_records(id,resource_type,resource_id,expires_at,deleted_at,result_json) VALUES(?,?,?,?,?,?)',
            )
            .run(
              `ret_${nanoid(12)}`,
              'artifact',
              item.id,
              item.createdAt,
              new Date().toISOString(),
              JSON.stringify({ path: item.relativePath, deleted: true }),
            );
        })();
        deleted.push(item.id);
      }
      return { deleted, bytes: preview.bytes };
    },
  );
  const dashboard = resolve('apps/dashboard/dist');
  if (existsSync(dashboard)) {
    await app.register(staticPlugin, { root: dashboard, wildcard: false });
    app.setNotFoundHandler((request, reply) =>
      request.url.startsWith('/api/')
        ? reply.code(404).send({
            error: {
              code: 'NOT_FOUND',
              message: 'API resource not found.',
              requestId: request.id,
            },
          })
        : reply.sendFile('index.html'),
    );
  }
  app.addHook('onClose', async () => db.close());
  return app;
}
