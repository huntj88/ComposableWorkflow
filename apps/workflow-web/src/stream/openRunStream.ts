import {
  workflowEventDtoSchema,
  workflowStreamFrameSchema,
  type EventCursor,
  type WorkflowStreamFrame,
} from '@composable-workflow/workflow-api-types';

import { computeReconnectDelayMs, isStreamStale, type StreamHealthState } from './reconnectPolicy';

type EventSourceFactory = (url: string) => EventSource;

type OpenRunStreamOptions = {
  runId: string;
  cursor?: EventCursor | string;
  eventType?: string;
  onFrame: (frame: WorkflowStreamFrame) => boolean | void;
  onHealthChange?: (state: StreamHealthState) => void;
  onRequestError?: (message: string) => void;
  onError?: (error: unknown) => void;
  eventSourceFactory?: EventSourceFactory;
  random?: () => number;
  now?: () => number;
};

export type RunStreamHandle = {
  close: () => void;
  getLastSeenCursor: () => string | undefined;
  getHealthState: () => StreamHealthState;
};

const SUPPORTED_EVENT_TYPE_FILTERS = new Set([
  'log',
  'workflow.started',
  'workflow.pausing',
  'workflow.paused',
  'workflow.resuming',
  'workflow.recovering',
  'workflow.cancelling',
  'workflow.completed',
  'workflow.failed',
  'workflow.cancelled',
  'transition.requested',
  'transition.completed',
  'transition.failed',
  'command.started',
  'command.completed',
  'command.failed',
  'child.started',
  'child.completed',
  'child.failed',
  'human-feedback.requested',
  'human-feedback.received',
]);

const isDevOrTestBuild = (): boolean => {
  const env = import.meta.env;
  return env.DEV || env.MODE === 'test';
};

const createEventSourceFactory = (factory?: EventSourceFactory): EventSourceFactory => {
  if (factory) {
    return factory;
  }

  if (typeof globalThis.EventSource !== 'function') {
    throw new Error('EventSource is unavailable in this runtime.');
  }

  return (url: string) => new globalThis.EventSource(url);
};

const buildStreamPath = (runId: string, cursor?: string, eventType?: string): string => {
  const query = new URLSearchParams();

  if (cursor && cursor.length > 0) {
    query.set('cursor', cursor);
  }

  if (eventType && eventType.length > 0) {
    query.set('eventType', eventType);
  }

  const queryString = query.toString();
  const basePath = `/api/v1/workflows/runs/${encodeURIComponent(runId)}/stream`;
  return queryString.length > 0 ? `${basePath}?${queryString}` : basePath;
};

const parseWorkflowFrame = (message: MessageEvent<string>): WorkflowStreamFrame =>
  workflowStreamFrameSchema.parse({
    event: 'workflow-event',
    id: message.lastEventId,
    data: workflowEventDtoSchema.parse(JSON.parse(message.data) as unknown),
  });

const failUnsupportedVariant = (reason: string, onError?: (error: unknown) => void): void => {
  const error = new Error(`Unsupported stream variant: ${reason}`);

  if (isDevOrTestBuild()) {
    throw error;
  }

  onError?.(error);
};

export const openRunStream = (options: OpenRunStreamOptions): RunStreamHandle => {
  const createEventSource = createEventSourceFactory(options.eventSourceFactory);
  const now = options.now ?? (() => Date.now());
  const random = options.random ?? Math.random;

  if (options.eventType && !SUPPORTED_EVENT_TYPE_FILTERS.has(options.eventType)) {
    options.onRequestError?.(`Unsupported stream eventType filter: ${options.eventType}`);

    return {
      close: () => {},
      getLastSeenCursor: () => undefined,
      getHealthState: () => 'reconnecting',
    };
  }

  let closed = false;
  let source: EventSource | null = null;
  let reconnectAttempt = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let staleTimer: ReturnType<typeof setInterval> | null = null;
  let healthState: StreamHealthState = 'reconnecting';
  let lastSeenCursor = options.cursor ? String(options.cursor) : undefined;
  let lastActivityAt = now();

  const setHealth = (state: StreamHealthState): void => {
    if (healthState === state) {
      return;
    }

    healthState = state;
    options.onHealthChange?.(state);
  };

  const closeCurrentSource = (): void => {
    if (!source) {
      return;
    }

    source.close();
    source = null;
  };

  const clearReconnectTimer = (): void => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const scheduleReconnect = (): void => {
    if (closed) {
      return;
    }

    clearReconnectTimer();

    const delay = computeReconnectDelayMs(reconnectAttempt, random);
    reconnectAttempt += 1;

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  };

  const connect = (): void => {
    if (closed) {
      return;
    }

    const path = buildStreamPath(options.runId, lastSeenCursor, options.eventType);
    const nextSource = createEventSource(path);
    source = nextSource;

    nextSource.onopen = () => {
      reconnectAttempt = 0;
      lastActivityAt = now();
      setHealth('connected');
    };

    nextSource.onerror = () => {
      if (closed) {
        return;
      }

      closeCurrentSource();

      if (isStreamStale(lastActivityAt, now())) {
        setHealth('stale');
      } else {
        setHealth('reconnecting');
      }

      scheduleReconnect();
    };

    nextSource.onmessage = () => {
      failUnsupportedVariant('event=message', options.onError);
    };

    nextSource.addEventListener('workflow-event', (raw) => {
      if (closed) {
        return;
      }

      const message = raw as MessageEvent<string>;

      let frame: WorkflowStreamFrame;
      try {
        frame = parseWorkflowFrame(message);
      } catch (error) {
        options.onError?.(error);
        return;
      }

      const accepted = options.onFrame(frame) !== false;
      if (!accepted) {
        return;
      }

      lastSeenCursor = frame.id;
      lastActivityAt = now();

      if (healthState !== 'connected') {
        setHealth('connected');
      }
    });
  };

  staleTimer = setInterval(() => {
    if (closed || healthState === 'stale') {
      return;
    }

    if (isStreamStale(lastActivityAt, now())) {
      setHealth('stale');
    }
  }, 1_000);

  connect();

  return {
    close: () => {
      closed = true;
      clearReconnectTimer();

      if (staleTimer) {
        clearInterval(staleTimer);
        staleTimer = null;
      }

      closeCurrentSource();
    },
    getLastSeenCursor: () => lastSeenCursor,
    getHealthState: () => healthState,
  };
};
