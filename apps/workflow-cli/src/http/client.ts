import {
  runEventsResponseSchema,
  type HumanFeedbackRequestStatusResponse,
  type ListRunFeedbackRequestsQuery,
  type ListRunFeedbackRequestsResponse,
  type ListRunsResponse,
  type RunFeedbackRequestSummary,
  type RunEventsResponse,
  type RunSummaryResponse,
  type RunTreeNode as SharedRunTreeNode,
  type RunTreeResponse,
  type StartWorkflowResponse,
  type StartWorkflowRequest,
  type SubmitHumanFeedbackResponseConflict,
  type SubmitHumanFeedbackResponsePayload,
  type SubmitHumanFeedbackResponseResponse,
  type WorkflowDefinitionResponse,
  type WorkflowEventDto,
  type WorkflowStreamFrame,
  workflowStreamFrameSchema,
} from '@composable-workflow/workflow-api-types';
import {
  fetch as undiciFetch,
  Headers,
  type Dispatcher,
  type RequestInit as UndiciRequestInit,
  type Response as UndiciResponse,
} from 'undici';

export interface ErrorEnvelope {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  requestId?: string;
}

export type RunSummary = RunSummaryResponse;
export type WorkflowEvent = WorkflowEventDto;
export type RunTreeNode = SharedRunTreeNode;
export type WorkflowDefinition = WorkflowDefinitionResponse;
export type HumanFeedbackResponsePayload = SubmitHumanFeedbackResponsePayload;
export type HumanFeedbackRequestStatus = HumanFeedbackRequestStatusResponse;
export type HumanFeedbackRequestSummary = RunFeedbackRequestSummary;
export type HumanFeedbackRespondAccepted = SubmitHumanFeedbackResponseResponse;
export type HumanFeedbackRespondConflict = SubmitHumanFeedbackResponseConflict;

export interface RetryOptions {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
}

export interface RetryDecision {
  shouldRetry: boolean;
  reason: 'network' | '5xx' | 'other';
}

export class WorkflowApiError extends Error {
  readonly statusCode: number;
  readonly code?: string;
  readonly details?: Record<string, unknown>;

  constructor(params: {
    message: string;
    statusCode: number;
    code?: string;
    details?: Record<string, unknown>;
  }) {
    super(params.message);
    this.name = 'WorkflowApiError';
    this.statusCode = params.statusCode;
    this.code = params.code;
    this.details = params.details;
  }
}

export type StartRunRequest = StartWorkflowRequest;

export interface ListRunsRequest {
  lifecycle?: string;
  workflowType?: string;
}

export interface ListEventsRequest {
  runId: string;
  cursor?: string;
}

export interface StreamEventsRequest {
  runId: string;
  cursor?: string;
  eventType?: string;
  signal?: AbortSignal;
}

export interface FollowEventChunk {
  cursor?: string;
  event: WorkflowEvent;
}

export interface WorkflowApiClient {
  startWorkflow: (request: StartRunRequest) => Promise<StartWorkflowResponse>;
  listRuns: (request: ListRunsRequest) => Promise<RunSummary[]>;
  listRunEvents: (request: ListEventsRequest) => Promise<RunEventsResponse>;
  streamRunEvents: (request: StreamEventsRequest) => AsyncGenerator<FollowEventChunk>;
  inspectRunTree: (request: {
    runId: string;
    depth?: number;
    includeCompletedChildren?: boolean;
  }) => Promise<RunTreeResponse>;
  inspectDefinition: (workflowType: string) => Promise<WorkflowDefinition>;
  listFeedbackRequests: (request?: {
    runId?: string;
    status?: ListRunFeedbackRequestsQuery['status'];
    limit?: ListRunFeedbackRequestsQuery['limit'];
    cursor?: ListRunFeedbackRequestsQuery['cursor'];
  }) => Promise<HumanFeedbackRequestSummary[]>;
  getFeedbackRequestStatus: (feedbackRunId: string) => Promise<HumanFeedbackRequestStatus>;
  respondFeedbackRequest: (request: {
    feedbackRunId: string;
    response: HumanFeedbackResponsePayload;
    respondedBy: string;
  }) => Promise<HumanFeedbackRespondAccepted | HumanFeedbackRespondConflict>;
}

interface CreateWorkflowApiClientOptions {
  baseUrl: string;
  retry?: Partial<RetryOptions>;
  fetchFn?: (input: string, init?: UndiciRequestInit) => Promise<UndiciResponse>;
  sleep?: (ms: number) => Promise<void>;
  dispatcher?: Dispatcher;
}

const defaultRetryOptions: RetryOptions = {
  maxAttempts: 4,
  initialDelayMs: 100,
  maxDelayMs: 1_000,
};

const sleepDefault = async (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const asErrorEnvelope = (input: unknown): ErrorEnvelope | undefined => {
  if (!input || typeof input !== 'object') {
    return undefined;
  }

  const value = input as Record<string, unknown>;
  if (typeof value.code !== 'string' || typeof value.message !== 'string') {
    return undefined;
  }

  return {
    code: value.code,
    message: value.message,
    details:
      typeof value.details === 'object' ? (value.details as Record<string, unknown>) : undefined,
    requestId: typeof value.requestId === 'string' ? value.requestId : undefined,
  };
};

const isNetworkFailure = (error: unknown): boolean => error instanceof Error;

export const getRetryDecision = (params: {
  error?: unknown;
  statusCode?: number;
  attempt: number;
  maxAttempts: number;
}): RetryDecision => {
  if (params.attempt >= params.maxAttempts) {
    return { shouldRetry: false, reason: 'other' };
  }

  if (params.error && isNetworkFailure(params.error)) {
    return { shouldRetry: true, reason: 'network' };
  }

  if (
    typeof params.statusCode === 'number' &&
    params.statusCode >= 500 &&
    params.statusCode <= 599
  ) {
    return { shouldRetry: true, reason: '5xx' };
  }

  return { shouldRetry: false, reason: 'other' };
};

export const isTransientError = (error: unknown): boolean => {
  if (!(error instanceof WorkflowApiError)) {
    return isNetworkFailure(error);
  }

  return error.statusCode >= 500 && error.statusCode <= 599;
};

const parseJsonBody = async (response: UndiciResponse): Promise<unknown> => {
  const raw = await response.text();
  if (!raw) {
    return undefined;
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
};

export const createWorkflowApiClient = (
  options: CreateWorkflowApiClientOptions,
): WorkflowApiClient => {
  const retryOptions: RetryOptions = {
    ...defaultRetryOptions,
    ...options.retry,
  };

  const baseUrl = options.baseUrl.replace(/\/$/, '');
  const sleep = options.sleep ?? sleepDefault;
  const fetchFn = options.fetchFn ?? undiciFetch;

  const requestJson = async <TResponse>(
    path: string,
    init?: UndiciRequestInit,
  ): Promise<TResponse> => {
    for (let attempt = 1; attempt <= retryOptions.maxAttempts; attempt += 1) {
      let response: UndiciResponse;

      try {
        const headers = new Headers(init?.headers);
        headers.set('accept', 'application/json');
        headers.set('content-type', headers.get('content-type') ?? 'application/json');

        response = await fetchFn(`${baseUrl}${path}`, {
          ...init,
          headers,
          dispatcher: options.dispatcher,
        });
      } catch (error) {
        const decision = getRetryDecision({
          error,
          attempt,
          maxAttempts: retryOptions.maxAttempts,
        });

        if (!decision.shouldRetry) {
          throw new WorkflowApiError({
            statusCode: 0,
            message: error instanceof Error ? error.message : 'Network request failed',
          });
        }

        const delay = Math.min(
          retryOptions.initialDelayMs * 2 ** (attempt - 1),
          retryOptions.maxDelayMs,
        );
        await sleep(delay);
        continue;
      }

      if (response.ok) {
        const body = await parseJsonBody(response);
        return body as TResponse;
      }

      const decision = getRetryDecision({
        statusCode: response.status,
        attempt,
        maxAttempts: retryOptions.maxAttempts,
      });

      if (decision.shouldRetry) {
        const delay = Math.min(
          retryOptions.initialDelayMs * 2 ** (attempt - 1),
          retryOptions.maxDelayMs,
        );
        await sleep(delay);
        continue;
      }

      const payload = asErrorEnvelope(await parseJsonBody(response));
      throw new WorkflowApiError({
        statusCode: response.status,
        code: payload?.code,
        message: payload?.message ?? `Request failed with status ${response.status}`,
        details: payload?.details,
      });
    }

    throw new WorkflowApiError({
      statusCode: 0,
      message: 'Request failed after retry attempts',
    });
  };

  const startWorkflow = async (request: StartRunRequest): Promise<StartWorkflowResponse> =>
    requestJson<StartWorkflowResponse>('/api/v1/workflows/start', {
      method: 'POST',
      body: JSON.stringify({
        workflowType: request.workflowType,
        input: request.input,
        idempotencyKey: request.idempotencyKey,
      }),
    });

  const listRuns = async (request: ListRunsRequest): Promise<RunSummary[]> => {
    const query = new URLSearchParams();

    if (request.lifecycle) {
      query.set('lifecycle', request.lifecycle);
    }

    if (request.workflowType) {
      query.set('workflowType', request.workflowType);
    }

    const suffix = query.size > 0 ? `?${query.toString()}` : '';
    const response = await requestJson<ListRunsResponse>(`/api/v1/workflows/runs${suffix}`);
    return response.items;
  };

  const listRunEvents = async (request: ListEventsRequest): Promise<RunEventsResponse> => {
    const query = new URLSearchParams();

    if (request.cursor) {
      query.set('cursor', request.cursor);
    }

    const suffix = query.size > 0 ? `?${query.toString()}` : '';
    const response = await requestJson<RunEventsResponse>(
      `/api/v1/workflows/runs/${encodeURIComponent(request.runId)}/events${suffix}`,
    );

    return runEventsResponseSchema.parse(response);
  };

  const streamRunEvents = async function* (
    request: StreamEventsRequest,
  ): AsyncGenerator<FollowEventChunk> {
    const query = new URLSearchParams();

    if (request.cursor) {
      query.set('cursor', request.cursor);
    }

    if (request.eventType) {
      query.set('eventType', request.eventType);
    }

    const suffix = query.size > 0 ? `?${query.toString()}` : '';

    const response = await fetchFn(
      `${baseUrl}/api/v1/workflows/runs/${encodeURIComponent(request.runId)}/stream${suffix}`,
      {
        method: 'GET',
        headers: {
          accept: 'text/event-stream',
        },
        signal: request.signal,
        dispatcher: options.dispatcher,
      },
    );

    if (!response.ok) {
      const payload = asErrorEnvelope(await parseJsonBody(response));
      throw new WorkflowApiError({
        statusCode: response.status,
        code: payload?.code,
        message: payload?.message ?? `Stream request failed with status ${response.status}`,
        details: payload?.details,
      });
    }

    if (!response.body) {
      return;
    }

    const decoder = new TextDecoder();
    const reader = response.body.getReader();

    let buffer = '';
    let currentEvent = '';
    let currentId: string | undefined;
    let currentData = '';

    const flushFrame = async (): Promise<FollowEventChunk | undefined> => {
      if (!currentData) {
        currentEvent = '';
        currentId = undefined;
        return undefined;
      }

      if (currentEvent !== 'workflow-event') {
        currentEvent = '';
        currentId = undefined;
        currentData = '';
        return undefined;
      }

      const parsedFrame = workflowStreamFrameSchema.parse({
        event: currentEvent,
        id: currentId ?? '',
        data: JSON.parse(currentData),
      } as WorkflowStreamFrame);

      currentEvent = '';
      currentData = '';
      const cursor = parsedFrame.id || currentId;
      currentId = undefined;

      return {
        cursor,
        event: parsedFrame.data,
      };
    };

    while (true) {
      const chunk = await reader.read();
      if (chunk.done) {
        break;
      }

      buffer += decoder.decode(chunk.value, { stream: true });

      let newlineIndex = buffer.indexOf('\n');
      while (newlineIndex >= 0) {
        const line = buffer.slice(0, newlineIndex).replace(/\r$/, '');
        buffer = buffer.slice(newlineIndex + 1);

        if (line.length === 0) {
          const frame = await flushFrame();
          if (frame) {
            yield frame;
          }
        } else if (line.startsWith(':')) {
          newlineIndex = buffer.indexOf('\n');
          continue;
        } else if (line.startsWith('event:')) {
          currentEvent = line.slice(6).trim();
        } else if (line.startsWith('id:')) {
          currentId = line.slice(3).trim();
        } else if (line.startsWith('data:')) {
          const value = line.slice(5).trimStart();
          currentData = currentData ? `${currentData}\n${value}` : value;
        }

        newlineIndex = buffer.indexOf('\n');
      }
    }

    const finalFrame = await flushFrame();
    if (finalFrame) {
      yield finalFrame;
    }
  };

  const inspectDefinition = async (workflowType: string): Promise<WorkflowDefinition> =>
    requestJson<WorkflowDefinition>(
      `/api/v1/workflows/definitions/${encodeURIComponent(workflowType)}`,
    );

  const inspectRunTree = async (request: {
    runId: string;
    depth?: number;
    includeCompletedChildren?: boolean;
  }): Promise<RunTreeResponse> => {
    const query = new URLSearchParams();

    if (typeof request.depth === 'number') {
      query.set('depth', `${request.depth}`);
    }

    if (typeof request.includeCompletedChildren === 'boolean') {
      query.set('includeCompletedChildren', `${request.includeCompletedChildren}`);
    }

    const suffix = query.size > 0 ? `?${query.toString()}` : '';
    return requestJson<RunTreeResponse>(
      `/api/v1/workflows/runs/${encodeURIComponent(request.runId)}/tree${suffix}`,
    );
  };

  const listFeedbackRequests = async (request?: {
    runId?: string;
    status?: ListRunFeedbackRequestsQuery['status'];
    limit?: ListRunFeedbackRequestsQuery['limit'];
    cursor?: ListRunFeedbackRequestsQuery['cursor'];
  }): Promise<HumanFeedbackRequestSummary[]> => {
    const query = new URLSearchParams();

    if (request?.status) {
      query.set('status', request.status);
    }

    if (typeof request?.limit === 'number') {
      query.set('limit', `${request.limit}`);
    }

    if (request?.cursor) {
      query.set('cursor', request.cursor);
    }

    const suffix = query.size > 0 ? `?${query.toString()}` : '';

    const path = request?.runId
      ? `/api/v1/workflows/runs/${encodeURIComponent(request.runId)}/feedback-requests${suffix}`
      : `/api/v1/human-feedback/requests${suffix}`;

    const response = await requestJson<ListRunFeedbackRequestsResponse>(path);
    return response.items;
  };

  const getFeedbackRequestStatus = async (
    feedbackRunId: string,
  ): Promise<HumanFeedbackRequestStatus> =>
    requestJson<HumanFeedbackRequestStatus>(
      `/api/v1/human-feedback/requests/${encodeURIComponent(feedbackRunId)}`,
    );

  const respondFeedbackRequest = async (request: {
    feedbackRunId: string;
    response: HumanFeedbackResponsePayload;
    respondedBy: string;
  }): Promise<HumanFeedbackRespondAccepted | HumanFeedbackRespondConflict> => {
    const response = await fetchFn(
      `${baseUrl}/api/v1/human-feedback/requests/${encodeURIComponent(request.feedbackRunId)}/respond`,
      {
        method: 'POST',
        body: JSON.stringify({
          response: request.response,
          respondedBy: request.respondedBy,
        }),
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
        },
        dispatcher: options.dispatcher,
      },
    );

    const payload = await parseJsonBody(response);
    if (response.status === 409) {
      return payload as HumanFeedbackRespondConflict;
    }

    if (!response.ok) {
      const envelope = asErrorEnvelope(payload);
      throw new WorkflowApiError({
        statusCode: response.status,
        code: envelope?.code,
        message: envelope?.message ?? `Request failed with status ${response.status}`,
        details: envelope?.details,
      });
    }

    return payload as HumanFeedbackRespondAccepted;
  };

  return {
    startWorkflow,
    listRuns,
    listRunEvents,
    streamRunEvents,
    inspectRunTree,
    inspectDefinition,
    listFeedbackRequests,
    getFeedbackRequestStatus,
    respondFeedbackRequest,
  };
};
