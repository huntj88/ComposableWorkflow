/**
 * TWEB09: Fixture factories for all dashboard transport surfaces.
 *
 * Every factory returns a valid object that conforms to the corresponding
 * schema in `@composable-workflow/workflow-api-types`. Defaults are
 * deterministic and reproducible; callers can override any field.
 */

import type {
  CancelRunResponse,
  DefinitionSummary,
  HumanFeedbackRequestStatusResponse,
  ListDefinitionsResponse,
  ListRunFeedbackRequestsResponse,
  ListRunsResponse,
  RunEventsResponse,
  RunLogsResponse,
  RunSummaryResponse,
  RunTreeResponse,
  StartWorkflowResponse,
  SubmitHumanFeedbackResponseResponse,
  WorkflowDefinitionResponse,
  WorkflowEventDto,
  WorkflowLogEntryDto,
  WorkflowStreamFrame,
  RunFeedbackRequestSummary,
  RunTreeNode,
} from '@composable-workflow/workflow-api-types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE_TIMESTAMP = '2026-03-05T00:00:00.000Z';
const DEFAULT_RUN_ID = 'wr_fixture_1';
const DEFAULT_WORKFLOW_TYPE = 'reference.success.v1';
const DEFAULT_WORKFLOW_VERSION = '1.0.0';

// ---------------------------------------------------------------------------
// RunSummaryResponse
// ---------------------------------------------------------------------------

export function buildRunSummary(overrides: Partial<RunSummaryResponse> = {}): RunSummaryResponse {
  return {
    runId: DEFAULT_RUN_ID,
    workflowType: DEFAULT_WORKFLOW_TYPE,
    workflowVersion: DEFAULT_WORKFLOW_VERSION,
    lifecycle: 'running',
    currentState: 'init',
    currentTransitionContext: null,
    parentRunId: null,
    childrenSummary: {
      total: 0,
      active: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
    },
    startedAt: BASE_TIMESTAMP,
    endedAt: null,
    counters: {
      eventCount: 0,
      logCount: 0,
      childCount: 0,
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// ListRunsResponse
// ---------------------------------------------------------------------------

export function buildListRunsResponse(items?: RunSummaryResponse[]): ListRunsResponse {
  return {
    items: items ?? [buildRunSummary()],
  };
}

// ---------------------------------------------------------------------------
// WorkflowEventDto
// ---------------------------------------------------------------------------

export function buildEventDto(
  sequence: number,
  overrides: Partial<WorkflowEventDto> = {},
): WorkflowEventDto {
  return {
    eventId: `evt_${sequence}`,
    runId: DEFAULT_RUN_ID,
    workflowType: DEFAULT_WORKFLOW_TYPE,
    parentRunId: null,
    sequence,
    eventType: 'transition.completed',
    state: null,
    transition: { from: 'a', to: 'b', name: 'next' },
    child: null,
    command: null,
    timestamp: BASE_TIMESTAMP,
    payload: null,
    error: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// RunEventsResponse
// ---------------------------------------------------------------------------

export function buildRunEventsResponse(
  count: number = 3,
  overrides: Partial<WorkflowEventDto> = {},
): RunEventsResponse {
  const items: WorkflowEventDto[] = [];

  for (let i = 1; i <= count; i++) {
    items.push(buildEventDto(i, overrides));
  }

  return {
    items,
    nextCursor: count > 0 ? `cur_${count}` : undefined,
  };
}

// ---------------------------------------------------------------------------
// WorkflowLogEntryDto
// ---------------------------------------------------------------------------

export function buildLogEntry(
  sequence: number,
  overrides: Partial<WorkflowLogEntryDto> = {},
): WorkflowLogEntryDto {
  return {
    eventId: `evt_log_${sequence}`,
    runId: DEFAULT_RUN_ID,
    sequence,
    eventType: 'log',
    timestamp: BASE_TIMESTAMP,
    level: 'info',
    message: `Log message ${sequence}`,
    payload: { level: 'info', message: `Log message ${sequence}` },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// RunLogsResponse
// ---------------------------------------------------------------------------

export function buildRunLogsResponse(
  count: number = 3,
  overrides: Partial<WorkflowLogEntryDto> = {},
): RunLogsResponse {
  const items: WorkflowLogEntryDto[] = [];

  for (let i = 1; i <= count; i++) {
    items.push(buildLogEntry(i, overrides));
  }

  return { items };
}

// ---------------------------------------------------------------------------
// RunTreeNode & RunTreeResponse
// ---------------------------------------------------------------------------

export function buildRunTreeNode(overrides: Partial<RunTreeNode> = {}): RunTreeNode {
  return {
    runId: DEFAULT_RUN_ID,
    workflowType: DEFAULT_WORKFLOW_TYPE,
    workflowVersion: DEFAULT_WORKFLOW_VERSION,
    lifecycle: 'running',
    currentState: 'init',
    parentRunId: null,
    startedAt: BASE_TIMESTAMP,
    endedAt: null,
    children: [],
    ...overrides,
  };
}

export function buildRunTreeResponse(overrides: Partial<RunTreeNode> = {}): RunTreeResponse {
  return {
    tree: buildRunTreeNode(overrides),
    overlay: {
      runId: overrides.runId ?? DEFAULT_RUN_ID,
      activeNode: overrides.currentState ?? 'init',
      traversedEdges: [],
      pendingEdges: [],
      failedEdges: [],
      childGraphLinks: [],
      transitionTimeline: [],
    },
  };
}

// ---------------------------------------------------------------------------
// WorkflowDefinitionResponse
// ---------------------------------------------------------------------------

export function buildDefinitionResponse(
  overrides: Partial<WorkflowDefinitionResponse> = {},
): WorkflowDefinitionResponse {
  return {
    workflowType: DEFAULT_WORKFLOW_TYPE,
    workflowVersion: DEFAULT_WORKFLOW_VERSION,
    states: ['init', 'processing', 'done'],
    transitions: [
      { from: 'init', to: 'processing', name: 'start' },
      { from: 'processing', to: 'done', name: 'finish' },
    ],
    childLaunchAnnotations: [],
    metadata: {},
    ...overrides,
  };
}

export function buildDefinitionSummary(
  overrides: Partial<DefinitionSummary> = {},
): DefinitionSummary {
  return {
    workflowType: DEFAULT_WORKFLOW_TYPE,
    workflowVersion: DEFAULT_WORKFLOW_VERSION,
    metadata: {},
    ...overrides,
  };
}

export function buildListDefinitionsResponse(items?: DefinitionSummary[]): ListDefinitionsResponse {
  return {
    items: items ?? [buildDefinitionSummary()],
  };
}

export function buildStartWorkflowResponse(
  overrides: Partial<StartWorkflowResponse> = {},
): StartWorkflowResponse {
  return {
    runId: DEFAULT_RUN_ID,
    workflowType: DEFAULT_WORKFLOW_TYPE,
    workflowVersion: DEFAULT_WORKFLOW_VERSION,
    lifecycle: 'running',
    startedAt: BASE_TIMESTAMP,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// CancelRunResponse
// ---------------------------------------------------------------------------

export function buildCancelRunResponse(runId?: string): CancelRunResponse {
  return {
    runId: runId ?? DEFAULT_RUN_ID,
    lifecycle: 'cancelling',
    acceptedAt: BASE_TIMESTAMP,
  };
}

// ---------------------------------------------------------------------------
// Feedback fixtures
// ---------------------------------------------------------------------------

export function buildFeedbackRequestSummary(
  overrides: Partial<RunFeedbackRequestSummary> = {},
): RunFeedbackRequestSummary {
  return {
    feedbackRunId: 'fr_fixture_1',
    parentRunId: DEFAULT_RUN_ID,
    questionId: 'q_approval',
    status: 'awaiting_response',
    requestedAt: BASE_TIMESTAMP,
    respondedAt: null,
    cancelledAt: null,
    respondedBy: null,
    prompt: 'Do you approve this deployment?',
    options: [
      { id: 1, label: 'Approve' },
      { id: 2, label: 'Reject' },
    ],
    constraints: null,
    ...overrides,
  };
}

export function buildListFeedbackRequestsResponse(
  items?: RunFeedbackRequestSummary[],
): ListRunFeedbackRequestsResponse {
  return {
    items: items ?? [buildFeedbackRequestSummary()],
    nextCursor: undefined,
  };
}

export function buildFeedbackStatusResponse(
  overrides: Partial<HumanFeedbackRequestStatusResponse> = {},
): HumanFeedbackRequestStatusResponse {
  return {
    ...buildFeedbackRequestSummary(),
    parentWorkflowType: DEFAULT_WORKFLOW_TYPE,
    parentState: 'awaiting-approval',
    requestEventId: 'evt_feedback_1',
    correlationId: null,
    response: null,
    ...overrides,
  };
}

export function buildFeedbackSubmitResponse(
  overrides: Partial<SubmitHumanFeedbackResponseResponse> = {},
): SubmitHumanFeedbackResponseResponse {
  return {
    feedbackRunId: 'fr_fixture_1',
    status: 'accepted',
    acceptedAt: BASE_TIMESTAMP,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// WorkflowStreamFrame
// ---------------------------------------------------------------------------

export function buildStreamFrame(
  sequence: number,
  overrides: Partial<WorkflowEventDto> = {},
  cursorOverride?: string,
): WorkflowStreamFrame {
  return {
    event: 'workflow-event',
    id: cursorOverride ?? `cur_${sequence}`,
    data: buildEventDto(sequence, overrides),
  };
}

/**
 * Build a series of stream frames with incrementing sequences.
 */
export function buildStreamFrameSequence(
  count: number,
  overrides: Partial<WorkflowEventDto> = {},
  startSequence: number = 1,
): WorkflowStreamFrame[] {
  const frames: WorkflowStreamFrame[] = [];

  for (let i = 0; i < count; i++) {
    frames.push(buildStreamFrame(startSequence + i, overrides));
  }

  return frames;
}

// ---------------------------------------------------------------------------
// Deterministic timestamp helpers
// ---------------------------------------------------------------------------

/**
 * Generate an ISO timestamp offset by `offsetMs` from the base fixture timestamp.
 */
export function fixtureTimestamp(offsetMs: number = 0): string {
  return new Date(new Date(BASE_TIMESTAMP).getTime() + offsetMs).toISOString();
}

// ---------------------------------------------------------------------------
// Re-exports for convenience
// ---------------------------------------------------------------------------

export { DEFAULT_RUN_ID, DEFAULT_WORKFLOW_TYPE, DEFAULT_WORKFLOW_VERSION, BASE_TIMESTAMP };
