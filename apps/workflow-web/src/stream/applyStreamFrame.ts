import type {
  RunEventsResponse,
  RunLogsResponse,
  RunSummaryResponse,
  WorkflowLifecycle,
  WorkflowLogEntryDto,
  WorkflowStreamFrame,
} from '@composable-workflow/workflow-api-types';

type StreamWatermarks = Record<string, number>;

export type StreamDashboardState = {
  summary: RunSummaryResponse | null;
  events: RunEventsResponse | null;
  logs: RunLogsResponse | null;
  watermarks: StreamWatermarks;
};

export type ApplyStreamFrameResult = {
  state: StreamDashboardState;
  accepted: boolean;
};

const LIFECYCLE_VALUES = new Set<WorkflowLifecycle>([
  'running',
  'pausing',
  'paused',
  'resuming',
  'recovering',
  'cancelling',
  'completed',
  'failed',
  'cancelled',
]);

const isDevOrTestBuild = (): boolean => {
  const env = import.meta.env;
  return env.DEV || env.MODE === 'test';
};

const throwUnsupportedStreamVariant = (reason: string): never => {
  throw new Error(`Unsupported stream variant: ${reason}`);
};

const toInitialWatermarks = (
  events: RunEventsResponse | null,
  logs: RunLogsResponse | null,
): StreamWatermarks => {
  const watermarks: StreamWatermarks = {};

  for (const event of events?.items ?? []) {
    const existing = watermarks[event.runId] ?? 0;
    watermarks[event.runId] = Math.max(existing, event.sequence);
  }

  for (const log of logs?.items ?? []) {
    const existing = watermarks[log.runId] ?? 0;
    watermarks[log.runId] = Math.max(existing, log.sequence);
  }

  return watermarks;
};

const toLogEntry = (frame: WorkflowStreamFrame): WorkflowLogEntryDto | null => {
  if (frame.data.eventType !== 'log') {
    return null;
  }

  const payload = frame.data.payload;
  const level = typeof payload?.level === 'string' ? payload.level : 'info';
  const message = typeof payload?.message === 'string' ? payload.message : frame.data.eventType;

  return {
    eventId: frame.data.eventId,
    runId: frame.data.runId,
    sequence: frame.data.sequence,
    eventType: frame.data.eventType,
    timestamp: frame.data.timestamp,
    level,
    message,
    payload,
  };
};

const toLifecycle = (eventType: string): WorkflowLifecycle | null => {
  if (!eventType.startsWith('workflow.')) {
    return null;
  }

  const candidate = eventType.slice('workflow.'.length) as WorkflowLifecycle;
  return LIFECYCLE_VALUES.has(candidate) ? candidate : null;
};

const isTerminalLifecycle = (lifecycle: WorkflowLifecycle): boolean =>
  lifecycle === 'completed' || lifecycle === 'failed' || lifecycle === 'cancelled';

const updateSummary = (
  summary: RunSummaryResponse | null,
  frame: WorkflowStreamFrame,
): RunSummaryResponse | null => {
  if (!summary || summary.runId !== frame.data.runId) {
    return summary;
  }

  const nextLifecycle = toLifecycle(frame.data.eventType);
  const nextState = frame.data.state ?? frame.data.transition?.to;
  const isLog = frame.data.eventType === 'log';
  const isChildStart = frame.data.eventType === 'child.started';

  return {
    ...summary,
    lifecycle: nextLifecycle ?? summary.lifecycle,
    currentState: nextState ?? summary.currentState,
    endedAt:
      nextLifecycle && isTerminalLifecycle(nextLifecycle) ? frame.data.timestamp : summary.endedAt,
    counters: {
      ...summary.counters,
      eventCount: summary.counters.eventCount + 1,
      logCount: summary.counters.logCount + (isLog ? 1 : 0),
      childCount: summary.counters.childCount + (isChildStart ? 1 : 0),
    },
  };
};

export const createStreamDashboardState = (params: {
  summary: RunSummaryResponse | null;
  events: RunEventsResponse | null;
  logs: RunLogsResponse | null;
}): StreamDashboardState => ({
  summary: params.summary,
  events: params.events,
  logs: params.logs,
  watermarks: toInitialWatermarks(params.events, params.logs),
});

export const applyStreamFrame = (
  state: StreamDashboardState,
  frame: WorkflowStreamFrame,
): ApplyStreamFrameResult => {
  if (frame.event !== 'workflow-event') {
    if (isDevOrTestBuild()) {
      throwUnsupportedStreamVariant(`event=${String(frame.event)}`);
    }

    return {
      state,
      accepted: false,
    };
  }

  const watermark = state.watermarks[frame.data.runId] ?? 0;
  if (frame.data.sequence <= watermark) {
    return {
      state,
      accepted: false,
    };
  }

  const nextEventsItems = [...(state.events?.items ?? []), frame.data].sort(
    (left, right) => left.sequence - right.sequence,
  );

  const nextLogEntry = toLogEntry(frame);
  const nextLogsItems = nextLogEntry
    ? [...(state.logs?.items ?? []), nextLogEntry].sort((left, right) => {
        if (left.timestamp === right.timestamp) {
          return left.eventId.localeCompare(right.eventId);
        }

        return left.timestamp.localeCompare(right.timestamp);
      })
    : (state.logs?.items ?? []);

  return {
    accepted: true,
    state: {
      summary: updateSummary(state.summary, frame),
      events: {
        items: nextEventsItems,
        nextCursor: frame.id,
      },
      logs: {
        items: nextLogsItems,
      },
      watermarks: {
        ...state.watermarks,
        [frame.data.runId]: frame.data.sequence,
      },
    },
  };
};
