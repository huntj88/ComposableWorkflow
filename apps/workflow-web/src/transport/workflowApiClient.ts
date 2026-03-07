import {
  cancelRunResponseSchema,
  listDefinitionsResponseSchema,
  humanFeedbackRequestStatusResponseSchema,
  listRunFeedbackRequestsResponseSchema,
  listRunsResponseSchema,
  runEventsResponseSchema,
  runLogsResponseSchema,
  runSummaryResponseSchema,
  runTreeResponseSchema,
  startWorkflowRequestSchema,
  startWorkflowResponseSchema,
  submitHumanFeedbackResponseRequestSchema,
  submitHumanFeedbackResponseResponseSchema,
  workflowDefinitionResponseSchema,
  type CancelRunResponse,
  type DefinitionSummary,
  type GetRunLogsQuery,
  type HumanFeedbackRequestStatusResponse,
  type ListDefinitionsResponse,
  type ListRunFeedbackRequestsQuery,
  type ListRunFeedbackRequestsResponse,
  type ListRunsResponse,
  type RunEventsResponse,
  type RunLogsResponse,
  type RunSummaryResponse,
  type RunTreeResponse,
  type StartWorkflowRequest,
  type StartWorkflowResponse,
  type SubmitHumanFeedbackResponseRequest,
  type SubmitHumanFeedbackResponseResponse,
  type WorkflowDefinitionResponse,
  type WorkflowLifecycle,
} from '@composable-workflow/workflow-api-types';

import { parsePanelErrorResponse, type PanelScope } from './errors';

const API_BASE = '/api/v1';

export const EVENTS_DEFAULT_LIMIT = 100;
export const EVENTS_MAX_LIMIT = 500;
export const LOGS_DEFAULT_LIMIT = 100;
export const LOGS_MAX_LIMIT = 500;
export const FEEDBACK_DEFAULT_LIMIT = 50;
export const FEEDBACK_MAX_LIMIT = 200;
export const DEFAULT_FEEDBACK_STATUS = 'awaiting_response,responded';

export type ListRunsQuery = {
  lifecycle?: WorkflowLifecycle[];
  workflowType?: string[];
};

export type GetRunEventsQuery = {
  cursor?: string;
  limit?: number;
  eventType?: string;
  since?: string;
  until?: string;
};

export type WebGetRunLogsQuery = GetRunLogsQuery & {
  limit?: number;
  severity?: 'debug' | 'info' | 'warn' | 'error';
  since?: string;
  until?: string;
  correlationId?: string;
  eventId?: string;
};

export type OpenRunStreamOptions = {
  cursor?: string;
  eventType?: string;
};

export type StartWorkflowOptions = StartWorkflowRequest;

type RequestJsonOptions = {
  method?: 'GET' | 'POST';
  body?: string;
  panel: PanelScope;
  parseFeedbackConflict?: boolean;
};

type EventSourceFactory = (url: string) => EventSource;

type CreateWorkflowApiClientOptions = {
  fetchImpl?: typeof fetch;
  eventSourceFactory?: EventSourceFactory;
};

const clampLimit = (value: number | undefined, fallback: number, max: number): number => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback;
  }

  const whole = Math.trunc(value);
  if (whole < 1) {
    return fallback;
  }

  return Math.min(whole, max);
};

const appendIfDefined = (params: URLSearchParams, key: string, value: string | undefined): void => {
  if (typeof value === 'string' && value.length > 0) {
    params.set(key, value);
  }
};

const serializeListRunsQuery = (query: ListRunsQuery = {}): string => {
  const params = new URLSearchParams();

  if (Array.isArray(query.lifecycle) && query.lifecycle.length > 0) {
    params.set('lifecycle', query.lifecycle.join(','));
  }

  if (Array.isArray(query.workflowType) && query.workflowType.length > 0) {
    params.set('workflowType', query.workflowType.join(','));
  }

  return params.toString();
};

const serializeEventsQuery = (query: GetRunEventsQuery = {}): string => {
  const params = new URLSearchParams();
  params.set('limit', String(clampLimit(query.limit, EVENTS_DEFAULT_LIMIT, EVENTS_MAX_LIMIT)));
  appendIfDefined(params, 'cursor', query.cursor);
  appendIfDefined(params, 'eventType', query.eventType);
  appendIfDefined(params, 'since', query.since);
  appendIfDefined(params, 'until', query.until);
  return params.toString();
};

const serializeLogsQuery = (query: WebGetRunLogsQuery = {}): string => {
  const params = new URLSearchParams();
  params.set('limit', String(clampLimit(query.limit, LOGS_DEFAULT_LIMIT, LOGS_MAX_LIMIT)));
  appendIfDefined(params, 'severity', query.severity);
  appendIfDefined(params, 'since', query.since);
  appendIfDefined(params, 'until', query.until);
  appendIfDefined(params, 'correlationId', query.correlationId);
  appendIfDefined(params, 'eventId', query.eventId);
  return params.toString();
};

const serializeFeedbackQuery = (query?: ListRunFeedbackRequestsQuery): string => {
  const params = new URLSearchParams();

  const statusValue =
    typeof query?.status === 'string' && query.status.length > 0
      ? query.status
      : DEFAULT_FEEDBACK_STATUS;
  params.set('status', statusValue);
  params.set('limit', String(clampLimit(query?.limit, FEEDBACK_DEFAULT_LIMIT, FEEDBACK_MAX_LIMIT)));
  appendIfDefined(params, 'cursor', query?.cursor);
  return params.toString();
};

const withQuery = (path: string, query: string): string =>
  query.length > 0 ? `${path}?${query}` : path;

const buildRunsPath = (runId: string): string =>
  `${API_BASE}/workflows/runs/${encodeURIComponent(runId)}`;

const EMPTY_CONTROL_REQUEST_BODY = '{}';

const sortEventsAscending = (response: RunEventsResponse): RunEventsResponse => ({
  ...response,
  items: [...response.items].sort((left, right) => left.sequence - right.sequence),
});

const sortLogsAscending = (response: RunLogsResponse): RunLogsResponse => ({
  ...response,
  items: [...response.items].sort((left, right) => {
    if (left.timestamp === right.timestamp) {
      return left.eventId.localeCompare(right.eventId);
    }

    return left.timestamp.localeCompare(right.timestamp);
  }),
});

const resolveEventSourceFactory = (factory?: EventSourceFactory): EventSourceFactory => {
  if (typeof factory === 'function') {
    return factory;
  }

  if (typeof globalThis.EventSource !== 'function') {
    throw new Error('EventSource is unavailable in this runtime.');
  }

  return (url: string) => new globalThis.EventSource(url);
};

export type WorkflowApiClient = ReturnType<typeof createWorkflowApiClient>;

export const createWorkflowApiClient = (options: CreateWorkflowApiClientOptions = {}) => {
  const fetchImpl = options.fetchImpl;

  const requestJson = async <T>(
    path: string,
    schema: { parse: (value: unknown) => T },
    requestOptions: RequestJsonOptions,
  ): Promise<T> => {
    const response = await (fetchImpl ?? fetch)(path, {
      method: requestOptions.method ?? 'GET',
      headers: requestOptions.body ? { 'Content-Type': 'application/json' } : undefined,
      body: requestOptions.body,
    });

    if (!response.ok) {
      throw await parsePanelErrorResponse(response, {
        panel: requestOptions.panel,
        fallbackMessage: `Request failed (${response.status})`,
        parseFeedbackConflict: requestOptions.parseFeedbackConflict,
      });
    }

    return schema.parse((await response.json()) as unknown);
  };

  return {
    listDefinitions: async (): Promise<ListDefinitionsResponse> =>
      requestJson(`${API_BASE}/workflows/definitions`, listDefinitionsResponseSchema, {
        panel: 'definitions-catalog',
      }),

    listRuns: async (query: ListRunsQuery = {}): Promise<ListRunsResponse> => {
      const queryString = serializeListRunsQuery(query);
      const path = withQuery(`${API_BASE}/workflows/runs`, queryString);
      return requestJson(path, listRunsResponseSchema, { panel: 'runs' });
    },

    startWorkflow: async (body: StartWorkflowOptions): Promise<StartWorkflowResponse> => {
      const requestBody = startWorkflowRequestSchema.parse(body);
      return requestJson(`${API_BASE}/workflows/start`, startWorkflowResponseSchema, {
        method: 'POST',
        body: JSON.stringify(requestBody),
        panel: 'start-workflow',
      });
    },

    getRunSummary: async (runId: string): Promise<RunSummaryResponse> =>
      requestJson(buildRunsPath(runId), runSummaryResponseSchema, { panel: 'summary' }),

    getRunTree: async (runId: string): Promise<RunTreeResponse> =>
      requestJson(`${buildRunsPath(runId)}/tree`, runTreeResponseSchema, { panel: 'tree' }),

    getRunEvents: async (
      runId: string,
      query: GetRunEventsQuery = {},
    ): Promise<RunEventsResponse> => {
      const path = withQuery(`${buildRunsPath(runId)}/events`, serializeEventsQuery(query));
      const response = await requestJson(path, runEventsResponseSchema, { panel: 'events' });
      return sortEventsAscending(response);
    },

    getRunLogs: async (runId: string, query: WebGetRunLogsQuery = {}): Promise<RunLogsResponse> => {
      const path = withQuery(`${buildRunsPath(runId)}/logs`, serializeLogsQuery(query));
      const response = await requestJson(path, runLogsResponseSchema, { panel: 'logs' });
      return sortLogsAscending(response);
    },

    getWorkflowDefinition: async (workflowType: string): Promise<WorkflowDefinitionResponse> =>
      requestJson(
        `${API_BASE}/workflows/definitions/${encodeURIComponent(workflowType)}`,
        workflowDefinitionResponseSchema,
        { panel: 'definition' },
      ),

    cancelRun: async (runId: string): Promise<CancelRunResponse> =>
      requestJson(`${buildRunsPath(runId)}/cancel`, cancelRunResponseSchema, {
        method: 'POST',
        body: EMPTY_CONTROL_REQUEST_BODY,
        panel: 'summary',
      }),

    listRunFeedbackRequests: async (
      runId: string,
      query?: ListRunFeedbackRequestsQuery,
    ): Promise<ListRunFeedbackRequestsResponse> => {
      const path = withQuery(
        `${buildRunsPath(runId)}/feedback-requests`,
        serializeFeedbackQuery(query),
      );
      return requestJson(path, listRunFeedbackRequestsResponseSchema, { panel: 'feedback' });
    },

    submitHumanFeedbackResponse: async (
      feedbackRunId: string,
      body: SubmitHumanFeedbackResponseRequest,
    ): Promise<SubmitHumanFeedbackResponseResponse> => {
      const requestBody = submitHumanFeedbackResponseRequestSchema.parse(body);
      return requestJson(
        `${API_BASE}/human-feedback/requests/${encodeURIComponent(feedbackRunId)}/respond`,
        submitHumanFeedbackResponseResponseSchema,
        {
          method: 'POST',
          body: JSON.stringify(requestBody),
          panel: 'feedback-submit',
          parseFeedbackConflict: true,
        },
      );
    },

    getHumanFeedbackRequestStatus: async (
      feedbackRunId: string,
    ): Promise<HumanFeedbackRequestStatusResponse> =>
      requestJson(
        `${API_BASE}/human-feedback/requests/${encodeURIComponent(feedbackRunId)}`,
        humanFeedbackRequestStatusResponseSchema,
        { panel: 'feedback-status' },
      ),

    openRunStream: (runId: string, streamOptions: OpenRunStreamOptions = {}): EventSource => {
      const eventSourceFactory = resolveEventSourceFactory(options.eventSourceFactory);
      const query = new URLSearchParams();
      appendIfDefined(query, 'cursor', streamOptions.cursor);
      appendIfDefined(query, 'eventType', streamOptions.eventType);
      const path = withQuery(`${buildRunsPath(runId)}/stream`, query.toString());
      return eventSourceFactory(path);
    },

    internals: {
      serializeListRunsQuery,
      serializeEventsQuery,
      serializeLogsQuery,
      serializeFeedbackQuery,
    },
  };
};

export const workflowApiClient = createWorkflowApiClient();

export type {
  DefinitionSummary,
  ListDefinitionsResponse,
  StartWorkflowRequest,
  StartWorkflowResponse,
};
