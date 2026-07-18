import type { RunStage } from './types.js';

const sequence: readonly RunStage[] = [
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
];
const terminal = new Set<RunStage>(['PASSED', 'FAILED', 'ERROR', 'CANCELLED']);

export function canTransition(from: RunStage, to: RunStage): boolean {
  if (terminal.has(from)) return false;
  if (terminal.has(to)) return from === 'CLEANING_UP';
  if (to === 'CLEANING_UP') return from !== 'CLEANING_UP';
  const index = sequence.indexOf(from);
  return index >= 0 && sequence[index + 1] === to;
}

export function assertTransition(from: RunStage, to: RunStage): void {
  if (!canTransition(from, to)) throw new Error(`Invalid run transition: ${from} -> ${to}`);
}

export function isTerminalStage(stage: RunStage): boolean {
  return terminal.has(stage);
}
