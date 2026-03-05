/**
 * Centralized design tokens for lifecycle, stream-health, and error semantics.
 *
 * B-WEB-028: Consistent lifecycle/stream-health tokens across panels.
 * B-WEB-047: Distinct error token semantics for validation, conflict, transport failures.
 */

import type { WorkflowLifecycle } from '@composable-workflow/workflow-api-types';

// ---------------------------------------------------------------------------
// Lifecycle tokens
// ---------------------------------------------------------------------------

export type LifecycleTokenSemantic = 'active' | 'transitioning' | 'success' | 'error' | 'neutral';

export type LifecycleToken = {
  /** MUI palette color key for Chip / Badge. */
  color: 'info' | 'warning' | 'success' | 'error' | 'default';
  /** Semantic grouping for theming decisions. */
  semantic: LifecycleTokenSemantic;
  /** Human-readable short label. */
  label: string;
};

/**
 * Map every WorkflowLifecycle value to a consistent visual token.
 * Consumed by summary, tree, timeline, graph overlay, and feedback panels.
 */
export const lifecycleTokens: Record<WorkflowLifecycle, LifecycleToken> = {
  running: { color: 'info', semantic: 'active', label: 'Running' },
  pausing: { color: 'warning', semantic: 'transitioning', label: 'Pausing' },
  paused: { color: 'warning', semantic: 'transitioning', label: 'Paused' },
  resuming: { color: 'info', semantic: 'transitioning', label: 'Resuming' },
  recovering: { color: 'warning', semantic: 'transitioning', label: 'Recovering' },
  cancelling: { color: 'warning', semantic: 'transitioning', label: 'Cancelling' },
  completed: { color: 'success', semantic: 'success', label: 'Completed' },
  failed: { color: 'error', semantic: 'error', label: 'Failed' },
  cancelled: { color: 'default', semantic: 'neutral', label: 'Cancelled' },
};

/**
 * Resolve a lifecycle value to its token. Falls back to neutral default for
 * unknown values so callers never need null-checks.
 */
export const resolveLifecycleToken = (lifecycle: string): LifecycleToken =>
  (lifecycleTokens as Record<string, LifecycleToken>)[lifecycle] ?? {
    color: 'default',
    semantic: 'neutral' as LifecycleTokenSemantic,
    label: lifecycle,
  };

// ---------------------------------------------------------------------------
// Stream-health tokens
// ---------------------------------------------------------------------------

export type StreamHealthStatus = 'connected' | 'reconnecting' | 'stale';

export type StreamHealthToken = {
  color: 'success' | 'warning' | 'error';
  label: string;
};

export const streamHealthTokens: Record<StreamHealthStatus, StreamHealthToken> = {
  connected: { color: 'success', label: 'Connected' },
  reconnecting: { color: 'warning', label: 'Reconnecting' },
  stale: { color: 'error', label: 'Stale' },
};

export const resolveStreamHealthToken = (status: string): StreamHealthToken =>
  (streamHealthTokens as Record<string, StreamHealthToken>)[status] ?? {
    color: 'warning',
    label: status,
  };

// ---------------------------------------------------------------------------
// Error category tokens (B-WEB-047)
// ---------------------------------------------------------------------------

export type ErrorCategory = 'validation' | 'conflict' | 'transport' | 'unknown';

export type ErrorCategoryToken = {
  /** MUI severity for Alert component. */
  severity: 'error' | 'warning' | 'info';
  /** Human-readable category label. */
  label: string;
  /** Whether the error is generally recoverable (user can retry). */
  recoverable: boolean;
};

export const errorCategoryTokens: Record<ErrorCategory, ErrorCategoryToken> = {
  validation: {
    severity: 'error',
    label: 'Validation Error',
    recoverable: false,
  },
  conflict: {
    severity: 'warning',
    label: 'Conflict',
    recoverable: false,
  },
  transport: {
    severity: 'error',
    label: 'Connection Error',
    recoverable: true,
  },
  unknown: {
    severity: 'error',
    label: 'Unexpected Error',
    recoverable: true,
  },
};

/**
 * Classify an HTTP status code into an error category.
 * - 400 → validation
 * - 409 → conflict
 * - 0 / network-level → transport
 * - everything else → unknown
 */
export const classifyErrorStatus = (status: number): ErrorCategory => {
  if (status === 400) return 'validation';
  if (status === 409) return 'conflict';
  if (status === 0 || status >= 500) return 'transport';
  return 'unknown';
};

/**
 * Get the error category token for a given HTTP status.
 */
export const resolveErrorToken = (status: number): ErrorCategoryToken =>
  errorCategoryTokens[classifyErrorStatus(status)];

// ---------------------------------------------------------------------------
// Feedback status tokens
// ---------------------------------------------------------------------------

export type FeedbackStatusToken = {
  color: 'warning' | 'success' | 'default';
  label: string;
};

export const feedbackStatusTokens: Record<string, FeedbackStatusToken> = {
  awaiting_response: { color: 'warning', label: 'Awaiting Response' },
  responded: { color: 'success', label: 'Responded' },
  cancelled: { color: 'default', label: 'Cancelled' },
};

export const resolveFeedbackStatusToken = (status: string): FeedbackStatusToken =>
  feedbackStatusTokens[status] ?? { color: 'default', label: status };

// ---------------------------------------------------------------------------
// Panel-scoped loading states
// ---------------------------------------------------------------------------

export const PANEL_LOADING_TEXT: Record<string, string> = {
  summary: 'Loading run summary…',
  tree: 'Loading execution tree…',
  events: 'Loading events timeline…',
  logs: 'Loading run logs…',
  definition: 'Loading workflow definition…',
  feedback: 'Loading feedback requests…',
};

export const PANEL_EMPTY_TEXT: Record<string, string> = {
  summary: 'No run summary available. Select a run to view details.',
  tree: 'No execution tree available for this run.',
  events: 'No events recorded yet. Events appear as the workflow executes.',
  logs: 'No log entries yet. Logs appear as tasks execute.',
  definition: 'No workflow definition loaded.',
  feedback: 'No feedback requests for this run. Requests appear when the workflow needs input.',
};

// ---------------------------------------------------------------------------
// Spacing tokens (centralized)
// ---------------------------------------------------------------------------

export const spacing = {
  panelPadding: 2,
  panelGap: 2,
  sectionGap: 1.5,
  inlineGap: 1,
} as const;
