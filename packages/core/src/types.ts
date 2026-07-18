export const RUN_STAGES = [
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
  'FAILED',
  'ERROR',
  'CANCELLED',
] as const;

export type RunStage = (typeof RUN_STAGES)[number];
export type FindingSeverity = 'info' | 'warning' | 'error' | 'critical';
export type FindingState = 'new' | 'existing' | 'resolved' | 'changed';
export type RunVerdict = 'pass' | 'warn' | 'fail' | 'error' | 'cancelled';

export interface Evidence {
  readonly type: 'text' | 'artifact' | 'metric' | 'network' | 'log';
  readonly title: string;
  readonly value?: string | number;
  readonly artifactId?: string;
}

export interface Finding {
  readonly id: string;
  readonly ruleId: string;
  readonly ruleVersion: string;
  readonly title: string;
  readonly description: string;
  readonly severity: FindingSeverity;
  readonly state: FindingState;
  readonly category: string;
  readonly journeyId?: string;
  readonly remediation?: string;
  readonly evidence: readonly Evidence[];
}

export interface VerdictDecision {
  readonly verdict: RunVerdict;
  readonly reasons: readonly string[];
  readonly counts: Readonly<Record<FindingSeverity, number>>;
}

export interface RuleContext<TConfig = unknown> {
  readonly runId: string;
  readonly baselineDirectory: string;
  readonly candidateDirectory: string;
  readonly config: TConfig;
}

export interface Rule<TConfig = unknown> {
  readonly id: string;
  readonly version: string;
  readonly phases: readonly ('baseline' | 'candidate' | 'comparison')[];
  validateConfig(value: unknown): TConfig;
  evaluate(context: RuleContext<TConfig>): Promise<readonly Finding[]>;
}

export interface SourceInspection {
  readonly id: string;
  readonly type: 'local' | 'archive' | 'agent';
  readonly wordpressVersion: string;
  readonly phpVersion?: string;
  readonly multisite: boolean;
  readonly components: readonly {
    type: 'plugin' | 'theme' | 'core';
    slug: string;
    version: string;
    active: boolean;
  }[];
  readonly warnings: readonly string[];
}

export interface SourceAdapter<TConfig = unknown> {
  readonly type: SourceInspection['type'];
  validate(config: unknown): TConfig;
  inspect(config: TConfig, signal?: AbortSignal): Promise<SourceInspection>;
  materialize(config: TConfig, destination: string, signal?: AbortSignal): Promise<void>;
  cleanup(config: TConfig): Promise<void>;
}
