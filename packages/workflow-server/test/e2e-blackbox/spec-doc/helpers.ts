/**
 * Shared HTTP helpers for spec-doc E2E blackbox tests.
 *
 * All helpers communicate exclusively via `fetch()` against a running
 * production server — no in-process injection or test harness coupling.
 */

import { cpSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Copilot fixture-mode guard
// ---------------------------------------------------------------------------

/**
 * Probes the running server's `/api/v1/diagnostics` endpoint to determine
 * whether Copilot fixture mode is enabled.  Returns `true` when the server
 * is **not** using mock copilot — meaning spec-doc tests should be skipped.
 *
 * The result is cached so the HTTP round-trip only happens once per test run.
 */
const detectSkip = async (): Promise<boolean> => {
  try {
    const res = await fetch(`${resolveBaseUrl()}/api/v1/diagnostics`, {
      headers: { accept: 'application/json' },
    });
    if (!res.ok) return true; // endpoint missing → skip to be safe
    const body = (await res.json()) as { copilotFixtureMode?: boolean };
    return !body.copilotFixtureMode;
  } catch {
    return true; // server unreachable → skip
  }
};

let _skipPromise: Promise<boolean> | undefined;

/**
 * Resolves to `true` when the server is **not** running with mock copilot.
 *
 * Use with `describe.skipIf(await skipUnlessCopilotFixture())` or the
 * `beforeAll` / setup pattern of your choice.
 */
export const skipUnlessCopilotFixture = (): Promise<boolean> => {
  _skipPromise ??= detectSkip();
  return _skipPromise;
};

// ---------------------------------------------------------------------------
// Base URL resolution
// ---------------------------------------------------------------------------

export const resolveBaseUrl = (): string => {
  if (process.env.WORKFLOW_BLACKBOX_BASE_URL) return process.env.WORKFLOW_BLACKBOX_BASE_URL;
  if (process.env.WORKFLOW_API_BASE_URL) return process.env.WORKFLOW_API_BASE_URL;
  const port = process.env.WORKFLOW_SERVER_PORT ?? '3000';
  return `http://127.0.0.1:${port}`;
};

// ---------------------------------------------------------------------------
// HTTP primitives
// ---------------------------------------------------------------------------

export const request = async (urlPath: string, init?: RequestInit): Promise<Response> =>
  fetch(`${resolveBaseUrl()}${urlPath}`, {
    ...init,
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

export const requestJson = async <T>(urlPath: string, init?: RequestInit): Promise<T> => {
  const response = await request(urlPath, init);
  const body = await response.text();
  if (!response.ok) throw new Error(`Request failed (${response.status}) for ${urlPath}: ${body}`);
  return body ? (JSON.parse(body) as T) : ({} as T);
};

// ---------------------------------------------------------------------------
// Workflow start
// ---------------------------------------------------------------------------

export const SPEC_DOC_WORKFLOW_TYPE = 'app-builder.spec-doc.v1';

export interface SpecDocInput {
  request: string;
  targetPath?: string;
  constraints?: string[];
  copilotPromptOptions?: {
    baseArgs?: string[];
    allowedDirs?: string[];
    timeoutMs?: number;
    cwd?: string;
  };
}

export interface StartedRun {
  runId: string;
  lifecycle: string;
  workflowType: string;
}

/**
 * Start a spec-doc workflow run. Returns the run ID or `null` if the workflow
 * type is not registered on the target server (graceful skip).
 */
export const startSpecDocWorkflow = async (
  input: SpecDocInput,
  idempotencyKey: string,
): Promise<StartedRun | null> => {
  const response = await request('/api/v1/workflows/start', {
    method: 'POST',
    body: JSON.stringify({
      workflowType: SPEC_DOC_WORKFLOW_TYPE,
      input,
      idempotencyKey,
    }),
  });

  if (response.status === 404) {
    const payload = (await response.json()) as { code?: string };
    if (payload.code === 'WORKFLOW_TYPE_NOT_FOUND') return null;
  }
  if (!response.ok) throw new Error(`Start failed (${response.status}): ${await response.text()}`);
  return (await response.json()) as StartedRun;
};

// ---------------------------------------------------------------------------
// Run polling
// ---------------------------------------------------------------------------

export interface RunSummary {
  runId: string;
  lifecycle: string;
  currentState: string;
  workflowType: string;
  output?: unknown;
  error?: { message?: string; code?: string; context?: Record<string, unknown> } | null;
}

const isTerminal = (lifecycle: string): boolean =>
  lifecycle === 'completed' || lifecycle === 'failed' || lifecycle === 'cancelled';

export const waitForTerminal = async (
  runId: string,
  maxAttempts = 120,
  intervalMs = 250,
): Promise<RunSummary> => {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const summary = await requestJson<RunSummary>(`/api/v1/workflows/runs/${runId}`);
    if (isTerminal(summary.lifecycle)) {
      // Enrich with output/error from terminal events (not in summary API)
      const events = await listAllEvents(runId);
      if (summary.lifecycle === 'completed') {
        const completedEvt = events.find((e) => e.eventType === 'workflow.completed');
        if (completedEvt?.payload) {
          summary.output = (completedEvt.payload as Record<string, unknown>).output ?? null;
        }
      } else if (summary.lifecycle === 'failed') {
        const failedEvt = events.find((e) => e.eventType === 'workflow.failed');
        if (failedEvt?.error) {
          summary.error = failedEvt.error as RunSummary['error'];
        }
      }
      return summary;
    }
    await sleep(intervalMs);
  }
  throw new Error(`Run ${runId} did not reach terminal lifecycle within ${maxAttempts} attempts`);
};

export const getRunSummary = async (runId: string): Promise<RunSummary> =>
  requestJson<RunSummary>(`/api/v1/workflows/runs/${runId}`);

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export interface WorkflowEvent {
  eventId: string;
  eventType: string;
  sequence: number;
  timestamp: string;
  payload: Record<string, unknown> | null;
  error: Record<string, unknown> | null;
  child: {
    childRunId: string;
    childWorkflowType: string;
    lifecycle: string;
  } | null;
}

export interface EventPage {
  items: WorkflowEvent[];
  nextCursor?: string;
}

export const listAllEvents = async (runId: string): Promise<WorkflowEvent[]> => {
  const all: WorkflowEvent[] = [];
  let cursor: string | undefined;
  while (true) {
    const query = cursor ? `?cursor=${encodeURIComponent(cursor)}&limit=100` : '?limit=100';
    const page = await requestJson<EventPage>(`/api/v1/workflows/runs/${runId}/events${query}`);
    all.push(...page.items);
    if (!page.nextCursor) return all;
    cursor = page.nextCursor;
  }
};

// ---------------------------------------------------------------------------
// Human feedback helpers
// ---------------------------------------------------------------------------

export interface FeedbackStatus {
  status: string;
  questionId: string;
  prompt?: string;
  options?: Array<{ id: number; label: string; description?: string }>;
}

export interface FeedbackAccepted {
  status: string;
  acceptedAt: string;
}

/**
 * Poll parent run events until a `child.started` event appears for
 * `server.human-feedback.v1`. Returns the child run ID.
 */
export const findFeedbackChildRunId = async (
  parentRunId: string,
  maxAttempts = 60,
  intervalMs = 250,
  after?: string,
): Promise<string> => {
  const seenIds = new Set<string>();
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const events = await listAllEvents(parentRunId);
    for (const event of events) {
      if (
        event.eventType === 'child.started' &&
        event.child?.childWorkflowType === 'server.human-feedback.v1' &&
        typeof event.child.childRunId === 'string'
      ) {
        const id = event.child.childRunId;
        if (after && !seenIds.has(after)) {
          seenIds.add(id);
          continue;
        }
        if (!after || id !== after) {
          return id;
        }
      }
    }
    await sleep(intervalMs);
  }
  throw new Error(
    `No feedback child run found for parent ${parentRunId} within ${maxAttempts} attempts`,
  );
};

/**
 * Find the Nth feedback child run (0-indexed) for a parent run.
 */
export const findNthFeedbackChildRunId = async (
  parentRunId: string,
  n: number,
  maxAttempts = 60,
  intervalMs = 250,
): Promise<string> => {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const events = await listAllEvents(parentRunId);
    const feedbackStarts = events.filter(
      (e) =>
        e.eventType === 'child.started' &&
        e.child?.childWorkflowType === 'server.human-feedback.v1' &&
        typeof e.child.childRunId === 'string',
    );
    if (feedbackStarts.length > n) {
      return feedbackStarts[n].child!.childRunId;
    }
    await sleep(intervalMs);
  }
  throw new Error(
    `Feedback child #${n} not found for parent ${parentRunId} within ${maxAttempts} attempts`,
  );
};

export const getFeedbackStatus = async (feedbackRunId: string): Promise<FeedbackStatus> =>
  requestJson<FeedbackStatus>(`/api/v1/human-feedback/requests/${feedbackRunId}`);

export const submitFeedbackResponse = async (
  feedbackRunId: string,
  questionId: string,
  selectedOptionIds: number[],
  text?: string,
): Promise<FeedbackAccepted> =>
  requestJson<FeedbackAccepted>(`/api/v1/human-feedback/requests/${feedbackRunId}/respond`, {
    method: 'POST',
    body: JSON.stringify({
      response: {
        questionId,
        selectedOptionIds,
        ...(text !== undefined ? { text } : {}),
      },
      respondedBy: 'blackbox_e2e_operator',
    }),
  });

/**
 * Wait for a feedback child to appear, verify its status, and submit a response.
 * Returns the feedback child run ID.
 */
export const answerNextFeedback = async (
  parentRunId: string,
  nth: number,
  selectedOptionIds: number[],
  text?: string,
): Promise<string> => {
  const feedbackRunId = await findNthFeedbackChildRunId(parentRunId, nth);
  const status = await getFeedbackStatus(feedbackRunId);
  if (status.status !== 'awaiting_response') {
    throw new Error(
      `Expected feedback ${feedbackRunId} to be awaiting_response, got ${status.status}`,
    );
  }
  await submitFeedbackResponse(feedbackRunId, status.questionId, selectedOptionIds, text);
  return feedbackRunId;
};

// ---------------------------------------------------------------------------
// Cancellation
// ---------------------------------------------------------------------------

export const cancelRun = async (runId: string): Promise<void> => {
  await requestJson(`/api/v1/workflows/runs/${runId}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ reason: 'blackbox_e2e_cancellation_test' }),
  });
};

// ---------------------------------------------------------------------------
// Fixture path helper
// ---------------------------------------------------------------------------

const FIXTURES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

export const fixtureDir = (scenario: string): string => {
  const sourceDir = path.join(FIXTURES_DIR, scenario);
  const tempRoot = mkdtempSync(path.join(tmpdir(), `spec-doc-fixture-${scenario}-`));
  const tempScenarioDir = path.join(tempRoot, scenario);
  cpSync(sourceDir, tempScenarioDir, { recursive: true });
  return tempScenarioDir;
};

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
