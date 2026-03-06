/**
 * TWEB09: Typed transport mock boundary with call tracing.
 *
 * Wraps `createWorkflowApiClient` with a fully injectable `fetchImpl` that
 * records every outbound request (URL, method, headers, body) and allows
 * per-handler response stubs. Stream creation is intercepted via
 * `eventSourceFactory`.
 *
 * Provides assertion helpers for verifying call order, parameters, and
 * ensuring no unexpected calls escape during a test.
 */

import type {
  CancelRunResponse,
  ListDefinitionsResponse,
  HumanFeedbackRequestStatusResponse,
  ListRunFeedbackRequestsResponse,
  ListRunsResponse,
  RunEventsResponse,
  RunLogsResponse,
  RunSummaryResponse,
  RunTreeResponse,
  StartWorkflowResponse,
  SubmitHumanFeedbackResponseResponse,
  WorkflowDefinitionResponse,
} from '@composable-workflow/workflow-api-types';

import {
  createWorkflowApiClient,
  type WorkflowApiClient,
} from '../../../src/transport/workflowApiClient';

// ---------------------------------------------------------------------------
// Call trace types
// ---------------------------------------------------------------------------

export type TracedCall = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
  timestamp: number;
};

export type TracedStreamRequest = {
  url: string;
  timestamp: number;
};

// ---------------------------------------------------------------------------
// Stub response types — one per transport surface
// ---------------------------------------------------------------------------

type JsonResponseInit = {
  status?: number;
  body: unknown;
};

type UrlMatcher = string | RegExp | ((url: string) => boolean);

type RouteStub = {
  matcher: UrlMatcher;
  method: string;
  response: JsonResponseInit;
  /** How many times this stub may be consumed. -1 = unlimited. */
  remaining: number;
};

// ---------------------------------------------------------------------------
// FakeEventSource (shared with streamReplay but self-contained here)
// ---------------------------------------------------------------------------

export class FakeEventSource {
  static instances: FakeEventSource[] = [];

  readonly listeners = new Map<string, Array<(event: unknown) => void>>();
  onopen: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onmessage: ((event: unknown) => void) | null = null;
  closed = false;
  readonly url: string;

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (event: unknown) => void): void {
    const current = this.listeners.get(type) ?? [];
    current.push(listener);
    this.listeners.set(type, current);
  }

  removeEventListener(type: string, listener: (event: unknown) => void): void {
    const current = this.listeners.get(type) ?? [];
    this.listeners.set(
      type,
      current.filter((cb) => cb !== listener),
    );
  }

  emitOpen(): void {
    this.onopen?.({});
  }

  emitError(): void {
    this.onerror?.({});
  }

  emitWorkflowFrame(params: { id: string; data: unknown }): void {
    const callbacks = this.listeners.get('workflow-event') ?? [];
    const payload = {
      lastEventId: params.id,
      data: JSON.stringify(params.data),
    };

    for (const callback of callbacks) {
      callback(payload);
    }
  }

  close(): void {
    this.closed = true;
  }
}

// ---------------------------------------------------------------------------
// MockTransport builder
// ---------------------------------------------------------------------------

export type MockTransport = {
  /** The fully wired API client using mocked fetch and event-source. */
  client: WorkflowApiClient;

  // -- Stub registration ---------------------------------------------------

  /** Register a stub response for a URL pattern + HTTP method. */
  stub: (matcher: UrlMatcher, method: string, response: JsonResponseInit, times?: number) => void;

  /** Convenience stubs for every transport surface. */
  stubDefinitionsList: (body: ListDefinitionsResponse, status?: number) => void;
  stubListRuns: (body: ListRunsResponse, status?: number) => void;
  stubStartWorkflow: (body: StartWorkflowResponse, status?: number) => void;
  stubRunSummary: (runId: string, body: RunSummaryResponse, status?: number) => void;
  stubRunTree: (runId: string, body: RunTreeResponse, status?: number) => void;
  stubRunEvents: (runId: string, body: RunEventsResponse, status?: number) => void;
  stubRunLogs: (runId: string, body: RunLogsResponse, status?: number) => void;
  stubDefinition: (workflowType: string, body: WorkflowDefinitionResponse, status?: number) => void;
  stubCancelRun: (runId: string, body: CancelRunResponse, status?: number) => void;
  stubFeedbackList: (runId: string, body: ListRunFeedbackRequestsResponse, status?: number) => void;
  stubFeedbackSubmit: (
    feedbackRunId: string,
    body: SubmitHumanFeedbackResponseResponse,
    status?: number,
  ) => void;
  stubFeedbackStatus: (
    feedbackRunId: string,
    body: HumanFeedbackRequestStatusResponse,
    status?: number,
  ) => void;
  stubError: (matcher: UrlMatcher, status: number, body: unknown) => void;

  // -- Call tracing ---------------------------------------------------------

  /** Return all recorded fetch calls. */
  getCalls: () => readonly TracedCall[];
  /** Return recorded fetch calls matching a URL predicate. */
  getCallsMatching: (predicate: UrlMatcher) => readonly TracedCall[];
  /** Return all recorded EventSource creation requests. */
  getStreamRequests: () => readonly TracedStreamRequest[];
  /** Return the most recent FakeEventSource instance (or undefined). */
  getLatestEventSource: () => FakeEventSource | undefined;
  /** Assert no unmatched fetch calls were made. Throws on violation. */
  assertNoUnmatchedCalls: () => void;

  // -- Reset ---------------------------------------------------------------

  /** Clear all stubs, call traces, and FakeEventSource instances. */
  reset: () => void;
};

// ---------------------------------------------------------------------------
// URL matching helper
// ---------------------------------------------------------------------------

const matchesUrl = (matcher: UrlMatcher, url: string): boolean => {
  if (typeof matcher === 'string') {
    return url.includes(matcher);
  }

  if (matcher instanceof RegExp) {
    return matcher.test(url);
  }

  return matcher(url);
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createMockTransport(): MockTransport {
  const calls: TracedCall[] = [];
  const streamRequests: TracedStreamRequest[] = [];
  const stubs: RouteStub[] = [];
  const unmatchedCalls: TracedCall[] = [];

  // Reset FakeEventSource tracker
  FakeEventSource.instances = [];

  const fetchImpl: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : (input as Request).url;
    const method = (init?.method ?? 'GET').toUpperCase();
    const headers: Record<string, string> = {};

    if (init?.headers) {
      const raw = init.headers as Record<string, string>;
      for (const [key, value] of Object.entries(raw)) {
        headers[key.toLowerCase()] = value;
      }
    }

    const body = typeof init?.body === 'string' ? init.body : null;

    const traced: TracedCall = { url, method, headers, body, timestamp: Date.now() };
    calls.push(traced);

    // Find matching stub
    const stubIndex = stubs.findIndex(
      (s) => s.method === method && matchesUrl(s.matcher, url) && s.remaining !== 0,
    );

    if (stubIndex === -1) {
      unmatchedCalls.push(traced);
      return new Response(JSON.stringify({ code: 'NOT_STUBBED', message: 'No stub matched' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const matchedStub = stubs[stubIndex]!;
    if (matchedStub.remaining > 0) {
      matchedStub.remaining -= 1;
    }

    return new Response(JSON.stringify(matchedStub.response.body), {
      status: matchedStub.response.status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const eventSourceFactory = (url: string): EventSource => {
    streamRequests.push({ url, timestamp: Date.now() });
    return new FakeEventSource(url) as unknown as EventSource;
  };

  const client = createWorkflowApiClient({ fetchImpl, eventSourceFactory });

  // -- Convenience stub helpers ---------------------------------------------

  const runsPathMatcher = (runId: string): string =>
    `/api/v1/workflows/runs/${encodeURIComponent(runId)}`;

  const stubMethod = (
    matcher: UrlMatcher,
    method: string,
    response: JsonResponseInit,
    times: number = -1,
  ): void => {
    stubs.push({ matcher, method: method.toUpperCase(), response, remaining: times });
  };

  const transport: MockTransport = {
    client,

    stub: stubMethod,

    stubDefinitionsList: (body, status) =>
      stubMethod(
        (url) => {
          const path = url.split('?')[0]!;
          return (
            path.endsWith('/api/v1/workflows/definitions') ||
            path.endsWith('/api/v1/workflows/definitions/')
          );
        },
        'GET',
        { status, body },
      ),

    stubListRuns: (body, status) =>
      stubMethod(
        (url) => {
          const path = url.split('?')[0]!;
          return (
            path.endsWith('/api/v1/workflows/runs') || path.endsWith('/api/v1/workflows/runs/')
          );
        },
        'GET',
        { status, body },
      ),

    stubStartWorkflow: (body, status) =>
      stubMethod((url) => url.includes('/api/v1/workflows/start'), 'POST', { status, body }),

    stubRunSummary: (runId, body, status) =>
      stubMethod(
        (url) =>
          url.includes(runsPathMatcher(runId)) &&
          !url.includes('/tree') &&
          !url.includes('/events') &&
          !url.includes('/logs') &&
          !url.includes('/stream') &&
          !url.includes('/cancel') &&
          !url.includes('/feedback'),
        'GET',
        { status, body },
      ),

    stubRunTree: (runId, body, status) =>
      stubMethod(`${runsPathMatcher(runId)}/tree`, 'GET', { status, body }),

    stubRunEvents: (runId, body, status) =>
      stubMethod(`${runsPathMatcher(runId)}/events`, 'GET', { status, body }),

    stubRunLogs: (runId, body, status) =>
      stubMethod(`${runsPathMatcher(runId)}/logs`, 'GET', { status, body }),

    stubDefinition: (workflowType, body, status) =>
      stubMethod(`/api/v1/workflows/definitions/${encodeURIComponent(workflowType)}`, 'GET', {
        status,
        body,
      }),

    stubCancelRun: (runId, body, status) =>
      stubMethod(`${runsPathMatcher(runId)}/cancel`, 'POST', { status, body }),

    stubFeedbackList: (runId, body, status) =>
      stubMethod(`${runsPathMatcher(runId)}/feedback-requests`, 'GET', { status, body }),

    stubFeedbackSubmit: (feedbackRunId, body, status) =>
      stubMethod(
        `/api/v1/human-feedback/requests/${encodeURIComponent(feedbackRunId)}/respond`,
        'POST',
        { status, body },
      ),

    stubFeedbackStatus: (feedbackRunId, body, status) =>
      stubMethod(`/api/v1/human-feedback/requests/${encodeURIComponent(feedbackRunId)}`, 'GET', {
        status,
        body,
      }),

    stubError: (matcher, status, body) => stubMethod(matcher, 'GET', { status, body }),

    getCalls: () => [...calls],
    getCallsMatching: (predicate) => calls.filter((c) => matchesUrl(predicate, c.url)),
    getStreamRequests: () => [...streamRequests],
    getLatestEventSource: () => FakeEventSource.instances[FakeEventSource.instances.length - 1],
    assertNoUnmatchedCalls: () => {
      if (unmatchedCalls.length > 0) {
        const details = unmatchedCalls.map((c) => `  ${c.method} ${c.url}`).join('\n');
        throw new Error(`MockTransport: ${unmatchedCalls.length} unmatched call(s):\n${details}`);
      }
    },

    reset: () => {
      calls.length = 0;
      streamRequests.length = 0;
      stubs.length = 0;
      unmatchedCalls.length = 0;
      FakeEventSource.instances = [];
    },
  };

  return transport;
}
