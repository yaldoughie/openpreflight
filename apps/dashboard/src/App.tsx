import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { NavLink, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { api } from './api.js';

type Run = {
  id: string;
  sourceId?: string;
  stage: string;
  verdict?: string;
  createdAt: string;
  updatedAt: string;
};
type Source = { id: string; type: string; name: string; createdAt: string };
type Baseline = { id: string; sourceId: string; createdAt: string };
const navigation = [
  ['/', 'Overview'],
  ['/diagnostics', 'Diagnostics'],
  ['/sources', 'Sources'],
  ['/journeys', 'Journeys'],
  ['/baselines', 'Baselines'],
  ['/runs', 'Test runs'],
  ['/reports', 'Reports'],
  ['/settings', 'Settings'],
  ['/privacy', 'Privacy'],
  ['/about', 'About'],
] as const;

function useApi<T>(
  path: string,
  initial: T,
): { data: T; loading: boolean; error?: string; reload: () => void } {
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    api<T>(path)
      .then((value) => {
        if (active) {
          setData(value);
          setError(undefined);
        }
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [path, version]);
  return {
    data,
    loading,
    ...(error ? { error } : {}),
    reload: () => setVersion((value) => value + 1),
  };
}
function Status({ children, kind = 'neutral' }: { children: ReactNode; kind?: string }) {
  return <span className={`status ${kind}`}>{children}</span>;
}
function State<T>({
  value,
  empty,
  children,
}: {
  value: ReturnType<typeof useApi<T>>;
  empty?: string;
  children: (data: T) => ReactNode;
}) {
  if (value.loading) return <p role="status">Loading…</p>;
  if (value.error)
    return (
      <div className="notice error" role="alert">
        <strong>Could not load this view.</strong>
        <p>{value.error}</p>
        <button onClick={value.reload}>Try again</button>
      </div>
    );
  if (Array.isArray(value.data) && value.data.length === 0)
    return (
      <div className="empty">
        <h2>Nothing here yet</h2>
        <p>{empty ?? 'Create the first item to get started.'}</p>
      </div>
    );
  return children(value.data);
}

export function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem('openpreflight-theme') ?? 'system');
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('openpreflight-theme', theme);
  }, [theme]);
  return (
    <>
      <a className="skip" href="#content">
        Skip to main content
      </a>
      <header className="topbar">
        <NavLink className="brand" to="/" aria-label="OpenPreflight home">
          <Logo />
          <span>
            <b>OpenPreflight</b>
            <small>Update testing, locally</small>
          </span>
        </NavLink>
        <label className="theme">
          <span>Theme</span>
          <select value={theme} onChange={(event) => setTheme(event.target.value)}>
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
      </header>
      <div className="shell">
        <nav aria-label="Primary">
          <ul>
            {navigation.map(([to, label]) => (
              <li key={to}>
                <NavLink to={to} end={to === '/'}>
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <main id="content" tabIndex={-1}>
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/diagnostics" element={<Diagnostics />} />
            <Route path="/sources" element={<Sources />} />
            <Route path="/sources/:id" element={<SourceDetail />} />
            <Route path="/journeys" element={<Journeys />} />
            <Route path="/journeys/editor" element={<JourneyEditor />} />
            <Route path="/baselines" element={<Baselines />} />
            <Route path="/runs" element={<Runs />} />
            <Route path="/runs/:id" element={<RunDetail />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/about" element={<About />} />
          </Routes>
        </main>
      </div>
    </>
  );
}
function Logo() {
  return (
    <svg className="logo" viewBox="0 0 48 48" aria-hidden="true">
      <path
        d="M8 7h32v25H26l-7 8v-8H8z"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <path
        d="m16 20 5 5 11-12"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function Page({
  title,
  intro,
  actions,
  children,
}: {
  title: string;
  intro?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <div className="pagehead">
        <div>
          <h1>{title}</h1>
          {intro && <p>{intro}</p>}
        </div>
        {actions && <div className="actions">{actions}</div>}
      </div>
      {children}
    </>
  );
}

function Overview() {
  const runs = useApi<Run[]>('/runs', []);
  const sources = useApi<Source[]>('/sources', []);
  return (
    <Page
      title="Preflight overview"
      intro="Test WordPress updates in disposable clones before they reach users."
      actions={
        <NavLink className="button primary" to="/runs">
          Start a test run
        </NavLink>
      }
    >
      <div className="warning">
        <strong>Production safety:</strong> OpenPreflight tests isolated clones. It never applies
        updates to the source site.
      </div>
      <section aria-labelledby="summary">
        <h2 id="summary">Workspace summary</h2>
        <div className="metrics">
          <article>
            <strong>{sources.data.length}</strong>
            <span>Sources</span>
          </article>
          <article>
            <strong>{runs.data.length}</strong>
            <span>Runs</span>
          </article>
          <article>
            <strong>{runs.data.filter((run) => run.stage === 'FAILED').length}</strong>
            <span>Regressions</span>
          </article>
        </div>
      </section>
      <section aria-labelledby="recent">
        <h2 id="recent">Recent runs</h2>
        <State value={runs} empty="Add a source, then start the first isolated test run.">
          {(data) => <RunTable runs={data.slice(0, 5)} />}
        </State>
      </section>
    </Page>
  );
}
function Diagnostics() {
  const value = useApi<Record<string, unknown>>('/diagnostics', {});
  return (
    <Page
      title="System diagnostics"
      intro="Runtime and isolation settings used by this installation."
    >
      <State value={value}>
        {(data) => (
          <dl className="details">
            {Object.entries(data).map(([key, item]) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd>{String(item)}</dd>
              </div>
            ))}
          </dl>
        )}
      </State>
      <p className="hint">
        Run <code>pnpm openpreflight doctor</code> for Docker, browser, disk, memory, PHP, Composer,
        port, and filesystem checks with remedies.
      </p>
    </Page>
  );
}
function Sources() {
  const value = useApi<Source[]>('/sources', []);
  const navigate = useNavigate();
  const [show, setShow] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const created = await api<{ id: string }>('/sources', {
      method: 'POST',
      body: JSON.stringify(Object.fromEntries(form)),
    });
    setShow(false);
    void navigate(`/sources/${created.id}`);
  };
  return (
    <Page
      title="Sources"
      intro="Sources are read-only inputs. OpenPreflight materializes a separate clone for each run."
      actions={
        <button className="primary" onClick={() => setShow(true)}>
          Add source
        </button>
      }
    >
      <State
        value={value}
        empty="Connect a local WordPress path, validated export archive, or OpenPreflight Agent."
      >
        {(data) => (
          <div className="cards">
            {data.map((source) => (
              <NavLink className="card" to={`/sources/${source.id}`} key={source.id}>
                <h2>{source.name}</h2>
                <p>
                  <Status>{source.type}</Status>
                </p>
                <code>{source.id}</code>
              </NavLink>
            ))}
          </div>
        )}
      </State>
      {show && (
        <div className="dialogbackdrop" role="presentation">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-source-title"
            className="dialog"
          >
            <h2 id="add-source-title">Add a source</h2>
            <form onSubmit={(event) => void submit(event)}>
              <label>
                Name
                <input name="name" required autoFocus />
              </label>
              <label>
                Type
                <select name="type">
                  <option value="local">Local WordPress path</option>
                  <option value="archive">Export archive</option>
                </select>
              </label>
              <label>
                Path
                <input name="path" required />
              </label>
              <div className="actions">
                <button type="button" onClick={() => setShow(false)}>
                  Cancel
                </button>
                <button className="primary">Add source</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </Page>
  );
}
function SourceDetail() {
  const { id = '' } = useParams();
  const sources = useApi<Source[]>('/sources', []);
  const source = sources.data.find((item) => item.id === id);
  return (
    <Page
      title={source?.name ?? 'Source details'}
      intro="Inventory and pending updates are refreshed during source inspection."
    >
      <State value={sources}>
        {() =>
          source ? (
            <dl className="details">
              <div>
                <dt>ID</dt>
                <dd>
                  <code>{source.id}</code>
                </dd>
              </div>
              <div>
                <dt>Adapter</dt>
                <dd>{source.type}</dd>
              </div>
              <div>
                <dt>Added</dt>
                <dd>
                  {new Intl.DateTimeFormat(undefined, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }).format(new Date(source.createdAt))}
                </dd>
              </div>
            </dl>
          ) : (
            <p role="alert">Source not found.</p>
          )
        }
      </State>
      <section>
        <h2>Update inventory</h2>
        <div className="empty">
          <p>
            Run source inspection to retrieve the real component inventory. No placeholder updates
            are shown.
          </p>
        </div>
      </section>
    </Page>
  );
}
function Journeys() {
  const value = useApi<Array<{ id: string; name: string }>>('/journeys', []);
  return (
    <Page
      title="Journey library"
      intro="Versioned YAML and JSON browser workflows with secret-safe inputs."
      actions={
        <NavLink className="button primary" to="/journeys/editor">
          Open editor
        </NavLink>
      }
    >
      <State
        value={value}
        empty="Add a journey file or use the bundled WordPress and WooCommerce journeys."
      >
        {(data) => (
          <div className="cards">
            {data.map((item) => (
              <article className="card" key={item.id}>
                <h2>{item.name}</h2>
                <code>{item.id}</code>
              </article>
            ))}
          </div>
        )}
      </State>
    </Page>
  );
}
function JourneyEditor() {
  const id = useId();
  const [text, setText] = useState(
    'schemaVersion: "1.0"\nid: homepage\nname: Homepage\nsteps:\n  - visit:\n      path: /\n  - assertNoConsoleErrors: true\n',
  );
  const [status, setStatus] = useState('Not validated yet.');
  const [busy, setBusy] = useState(false);
  const validate = async () => {
    setBusy(true);
    try {
      await api('/journeys/validate', {
        method: 'POST',
        body: JSON.stringify({ text, format: 'yaml' }),
      });
      setStatus('Journey is valid.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    setBusy(true);
    try {
      const validated = await api<{ definition: { id: string; name: string } }>(
        '/journeys/validate',
        { method: 'POST', body: JSON.stringify({ text, format: 'yaml' }) },
      );
      await api('/journeys', {
        method: 'POST',
        body: JSON.stringify({
          id: validated.definition.id,
          name: validated.definition.name,
          definition: validated.definition,
        }),
      });
      setStatus('Journey version saved.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Page title="Journey editor" intro="Ordinary journeys cannot execute arbitrary JavaScript.">
      <label htmlFor={id}>Journey YAML</label>
      <textarea
        id={id}
        className="editor"
        spellCheck={false}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <div className="actions">
        <button disabled={busy} onClick={() => void validate()}>
          Validate
        </button>
        <button className="primary" disabled={busy} onClick={() => void save()}>
          Save version
        </button>
      </div>
      <p role="status" aria-live="polite">
        {status}
      </p>
      <p className="hint">
        Secrets refer to environment-variable names. Values are never stored in journey definitions.
      </p>
    </Page>
  );
}
function Baselines() {
  const value = useApi<Baseline[]>('/baselines', []);
  return (
    <Page
      title="Baselines"
      intro="Approved browser and WordPress state used for candidate comparisons."
    >
      <State
        value={value}
        empty="Create a baseline from a configured source before testing updates."
      >
        {(data) => (
          <table>
            <caption>Saved baselines</caption>
            <thead>
              <tr>
                <th scope="col">ID</th>
                <th scope="col">Source</th>
                <th scope="col">Created</th>
              </tr>
            </thead>
            <tbody>
              {data.map((item) => (
                <tr key={item.id}>
                  <td>
                    <code>{item.id}</code>
                  </td>
                  <td>{item.sourceId}</td>
                  <td>{new Date(item.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </State>
    </Page>
  );
}
function Runs() {
  const value = useApi<Run[]>('/runs', []);
  const sources = useApi<Source[]>('/sources', []);
  const [sourceId, setSourceId] = useState('');
  const navigate = useNavigate();
  const start = async () => {
    if (!sourceId) return;
    const run = await api<{ id: string }>('/runs', {
      method: 'POST',
      body: JSON.stringify({ sourceId }),
    });
    void navigate(`/runs/${run.id}`);
  };
  return (
    <Page
      title="Test runs"
      intro="Baseline and candidate execute from the same sanitized snapshot."
      actions={
        <>
          <select
            aria-label="Source for new run"
            value={sourceId}
            onChange={(event) => setSourceId(event.target.value)}
          >
            <option value="">Select source…</option>
            {sources.data.map((source) => (
              <option key={source.id} value={source.id}>
                {source.name}
              </option>
            ))}
          </select>
          <button className="primary" disabled={!sourceId} onClick={() => void start()}>
            Start run
          </button>
        </>
      }
    >
      <State value={value} empty="No test runs exist yet.">
        {(data) => <RunTable runs={data} />}
      </State>
    </Page>
  );
}
function RunTable({ runs }: { runs: Run[] }) {
  return (
    <div className="tablewrap">
      <table>
        <caption className="sr-only">Test runs</caption>
        <thead>
          <tr>
            <th scope="col">Run</th>
            <th scope="col">Stage</th>
            <th scope="col">Verdict</th>
            <th scope="col">Updated</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr key={run.id}>
              <td>
                <NavLink to={`/runs/${run.id}`}>
                  <code>{run.id}</code>
                </NavLink>
              </td>
              <td>
                <Status
                  kind={
                    run.stage === 'FAILED' || run.stage === 'ERROR'
                      ? 'bad'
                      : run.stage === 'PASSED'
                        ? 'good'
                        : 'neutral'
                  }
                >
                  {run.stage}
                </Status>
              </td>
              <td>{run.verdict ?? 'Pending'}</td>
              <td>{new Date(run.updatedAt).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function RunDetail() {
  const { id = '' } = useParams();
  const value = useApi<Run>(`/runs/${id}`, { id, stage: 'QUEUED', createdAt: '', updatedAt: '' });
  const stages = [
    'QUEUED',
    'PREPARING_SOURCE',
    'VERIFYING_SOURCE',
    'CREATING_ENVIRONMENT',
    'IMPORTING_SITE',
    'SANITIZING_SITE',
    'WARMING_BASELINE',
    'RUNNING_BASELINE',
    'SNAPSHOTTING_BASELINE',
    'RESTORING_CANDIDATE',
    'APPLYING_UPDATES',
    'WARMING_CANDIDATE',
    'RUNNING_CANDIDATE',
    'COMPARING_RESULTS',
    'GENERATING_REPORT',
    'CLEANING_UP',
    'PASSED',
  ];
  return (
    <Page
      title={`Run ${id}`}
      intro="Progress is persisted, so interrupted work can recover safely."
      actions={
        <button
          className="danger"
          onClick={() => void api(`/runs/${id}/cancel`, { method: 'POST' }).then(value.reload)}
        >
          Cancel run
        </button>
      }
    >
      <State value={value}>
        {(run) => (
          <>
            <div className="runhero">
              <Status
                kind={
                  run.stage === 'FAILED' || run.stage === 'ERROR'
                    ? 'bad'
                    : run.stage === 'PASSED'
                      ? 'good'
                      : 'neutral'
                }
              >
                {run.stage}
              </Status>
              <p aria-live="polite">Current stage: {run.stage}</p>
            </div>
            <ol className="timeline">
              {stages.map((stage) => (
                <li key={stage} className={stage === run.stage ? 'current' : ''}>
                  {stage.replaceAll('_', ' ')}
                </li>
              ))}
            </ol>
            <div className="tabs" aria-label="Run result sections">
              <button>Summary</button>
              <button>Functional</button>
              <button>Visual</button>
              <button>Accessibility</button>
              <button>Performance</button>
              <button>Console &amp; network</button>
              <button>WordPress &amp; PHP</button>
            </div>
          </>
        )}
      </State>
    </Page>
  );
}
function Reports() {
  const value = useApi<Array<{ id: string; runId: string; kind: string; path: string }>>(
    '/reports',
    [],
  );
  return (
    <Page
      title="Reports"
      intro="Static reports contain no external assets and are redacted before persistence."
    >
      <State value={value} empty="Reports appear after a run reaches report generation.">
        {(data) => (
          <div className="cards">
            {data.map((item) => (
              <article className="card" key={item.id}>
                <h2>{item.kind}</h2>
                <p>
                  Run <code>{item.runId}</code>
                </p>
                <p>
                  <code>{item.path}</code>
                </p>
              </article>
            ))}
          </div>
        )}
      </State>
    </Page>
  );
}
function CleanupDialog({
  preview,
  onCancel,
  onConfirm,
}: {
  preview: {
    items: Array<{ id: string; kind: string; relativePath: string; sizeBytes: number }>;
    bytes: number;
    retentionDays: number;
  };
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      aria-labelledby="cleanup-title"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <h2 id="cleanup-title">Confirm expired artifact cleanup</h2>
      <p>
        {preview.items.length} artifacts older than {preview.retentionDays} days use{' '}
        {new Intl.NumberFormat().format(preview.bytes)} bytes. Filesystem secure deletion cannot be
        guaranteed on SSDs.
      </p>
      <div className="actions">
        <button autoFocus onClick={onCancel}>
          Cancel
        </button>
        <button className="danger" onClick={onConfirm}>
          Delete expired artifacts
        </button>
      </div>
    </dialog>
  );
}

function Settings() {
  const value = useApi<Record<string, unknown>>('/settings', {});
  const [preview, setPreview] = useState<{
    items: Array<{ id: string; kind: string; relativePath: string; sizeBytes: number }>;
    bytes: number;
    retentionDays: number;
  }>();
  const [cleanupStatus, setCleanupStatus] = useState('');
  const reviewCleanup = async () => {
    try {
      setPreview(await api<NonNullable<typeof preview>>('/retention/preview'));
    } catch (error) {
      setCleanupStatus(error instanceof Error ? error.message : String(error));
    }
  };
  const cleanup = async () => {
    try {
      const result = await api<{ deleted: string[]; bytes: number }>('/retention', {
        method: 'DELETE',
        body: JSON.stringify({ confirm: true }),
      });
      setPreview(undefined);
      setCleanupStatus(
        `Deleted ${result.deleted.length} expired artifacts (${new Intl.NumberFormat().format(result.bytes)} bytes).`,
      );
    } catch (error) {
      setCleanupStatus(error instanceof Error ? error.message : String(error));
    }
  };
  return (
    <Page
      title="Settings"
      intro="Configuration precedence is CLI, environment, source, project, then defaults."
    >
      <State value={value}>
        {(data) => <pre className="config">{JSON.stringify(data, null, 2)}</pre>}
      </State>
      <section>
        <h2>Data retention</h2>
        <p>
          Reports and failed-run artifacts default to 14 days. Raw exports are deleted immediately
          after sanitized import.
        </p>
        <button className="danger" onClick={() => void reviewCleanup()}>
          Review cleanup
        </button>
        <p role="status" aria-live="polite">
          {cleanupStatus}
        </p>
      </section>
      {preview ? (
        <CleanupDialog
          preview={preview}
          onCancel={() => setPreview(undefined)}
          onConfirm={() => void cleanup()}
        />
      ) : null}
    </Page>
  );
}
function Privacy() {
  return (
    <Page title="Privacy and local data">
      <div className="prose">
        <p>
          OpenPreflight collects no telemetry, sends no analytics, uses no third-party fonts, and
          never uploads reports automatically.
        </p>
        <h2>Cloned data</h2>
        <p>
          Clones can contain personal and confidential information. OpenPreflight sanitizes known
          WordPress and WooCommerce fields, but arbitrary plugins may store secrets in unknown
          locations. Treat every clone and report as sensitive.
        </p>
        <h2>Storage</h2>
        <p>
          Artifacts remain in the configured local storage directory. Use{' '}
          <code>openpreflight cleanup</code> to preview retention cleanup and <code>--yes</code>{' '}
          only after reviewing the targets.
        </p>
        <h2>Sharing</h2>
        <p>
          Reports are private by default. Confirm contractual and legal obligations before sharing
          site data.
        </p>
      </div>
    </Page>
  );
}
function About() {
  return (
    <Page title="About OpenPreflight">
      <div className="prose">
        <Logo />
        <p>
          <strong>OpenPreflight 1.0.0</strong>
        </p>
        <p>Test every WordPress update before your users do.</p>
        <p>
          Licensed under GPL-2.0-or-later. No telemetry, proprietary service, or production update
          endpoint is included.
        </p>
        <p>Repository and security-contact metadata must be replaced before public release.</p>
      </div>
    </Page>
  );
}
