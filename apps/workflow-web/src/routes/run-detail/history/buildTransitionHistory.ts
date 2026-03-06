import type { RunEventsResponse, WorkflowEventDto } from '@composable-workflow/workflow-api-types';

export const TRANSITION_HISTORY_EVENT_TYPES = [
  'state.entered',
  'transition.requested',
  'transition.completed',
  'transition.failed',
  'child.started',
  'child.completed',
  'child.failed',
] as const;

const TRANSITION_HISTORY_EVENT_TYPE_SET = new Set<string>(TRANSITION_HISTORY_EVENT_TYPES);

export type TransitionHistoryEventType = (typeof TRANSITION_HISTORY_EVENT_TYPES)[number];

export type TransitionHistorySelectionTarget =
  | {
      kind: 'state';
      stateId: string;
    }
  | {
      kind: 'transition';
      from: string;
      to: string;
    }
  | null;

export type TransitionHistoryChildInfo = {
  sectionKey: string;
  childRunId: string;
  childWorkflowType: string;
  lifecycle: string;
  parentState: string | null;
};

export type TransitionHistoryEntry = {
  key: string;
  runId: string;
  eventId: string;
  sequence: number;
  timestamp: string;
  eventType: TransitionHistoryEventType;
  stateId: string | null;
  transition: {
    from: string | null;
    to: string | null;
    name: string | null;
  } | null;
  child: TransitionHistoryChildInfo | null;
  selectionTarget: TransitionHistorySelectionTarget;
  iteration: number | null;
  iterationLabel: string | null;
  title: string;
  detail: string;
  looped: boolean;
  isFailure: boolean;
  isPending: boolean;
  event: WorkflowEventDto;
};

export type BuildTransitionHistoryOptions = {
  linkModeEnabled?: boolean;
  since?: string;
  until?: string;
};

const isTransitionHistoryEvent = (
  event: WorkflowEventDto,
): event is WorkflowEventDto & { eventType: TransitionHistoryEventType } =>
  TRANSITION_HISTORY_EVENT_TYPE_SET.has(event.eventType);

const matchesTimeWindow = (
  event: WorkflowEventDto,
  options: BuildTransitionHistoryOptions,
): boolean => {
  if (!options.linkModeEnabled) {
    return true;
  }

  const since = options.since?.trim() ?? '';
  const until = options.until?.trim() ?? '';

  if (since.length > 0 && event.timestamp < since) {
    return false;
  }

  if (until.length > 0 && event.timestamp >= until) {
    return false;
  }

  return true;
};

const toTransitionKey = (event: WorkflowEventDto): string | null => {
  const from = event.transition?.from;
  const to = event.transition?.to;

  if (typeof from !== 'string' || typeof to !== 'string') {
    return null;
  }

  return `${from}->${to}`;
};

const toChildInfo = (event: WorkflowEventDto): TransitionHistoryChildInfo | null => {
  const childRunId = event.child?.childRunId;
  const childWorkflowType = event.child?.childWorkflowType;
  const lifecycle = event.child?.lifecycle;

  if (
    typeof childRunId !== 'string' ||
    typeof childWorkflowType !== 'string' ||
    typeof lifecycle !== 'string'
  ) {
    return null;
  }

  return {
    sectionKey: `${event.runId}:${event.eventId}:${childRunId}`,
    childRunId,
    childWorkflowType,
    lifecycle,
    parentState: event.state,
  };
};

export const toTransitionHistorySelectionTarget = (
  event: WorkflowEventDto,
): TransitionHistorySelectionTarget => {
  if (event.eventType === 'state.entered' && typeof event.state === 'string') {
    return { kind: 'state', stateId: event.state };
  }

  if (
    (event.eventType === 'transition.requested' ||
      event.eventType === 'transition.completed' ||
      event.eventType === 'transition.failed') &&
    typeof event.transition?.from === 'string' &&
    typeof event.transition?.to === 'string'
  ) {
    return {
      kind: 'transition',
      from: event.transition.from,
      to: event.transition.to,
    };
  }

  if (
    (event.eventType === 'child.started' ||
      event.eventType === 'child.completed' ||
      event.eventType === 'child.failed') &&
    typeof event.state === 'string'
  ) {
    return { kind: 'state', stateId: event.state };
  }

  return null;
};

const toTitle = (event: WorkflowEventDto): string => {
  switch (event.eventType) {
    case 'state.entered':
      return event.state ?? 'Entered unknown state';
    case 'transition.requested':
    case 'transition.completed':
    case 'transition.failed': {
      const from = event.transition?.from ?? 'unknown';
      const to = event.transition?.to ?? 'unknown';
      return `${from} → ${to}`;
    }
    case 'child.started':
    case 'child.completed':
    case 'child.failed':
      return event.child
        ? `${event.child.childWorkflowType} · ${event.child.childRunId}`
        : 'Child workflow';
    default:
      return event.eventType;
  }
};

const toDetail = (event: WorkflowEventDto): string => {
  switch (event.eventType) {
    case 'state.entered':
      return 'State entered';
    case 'transition.requested':
      return event.transition?.name ? `Requested · ${event.transition.name}` : 'Requested';
    case 'transition.completed':
      return event.transition?.name ? `Completed · ${event.transition.name}` : 'Completed';
    case 'transition.failed': {
      const message =
        typeof event.error?.message === 'string'
          ? event.error.message
          : typeof event.payload?.message === 'string'
            ? event.payload.message
            : null;
      return message ? `Failed · ${message}` : 'Failed';
    }
    case 'child.started':
      return event.child ? `Started · ${event.child.lifecycle}` : 'Started';
    case 'child.completed':
      return event.child ? `Completed · ${event.child.lifecycle}` : 'Completed';
    case 'child.failed':
      return event.child ? `Failed · ${event.child.lifecycle}` : 'Failed';
    default:
      return event.eventType;
  }
};

export const buildTransitionHistory = (
  response: RunEventsResponse | null | undefined,
  options: BuildTransitionHistoryOptions = {},
): TransitionHistoryEntry[] => {
  const relevantEvents = (response?.items ?? [])
    .filter(isTransitionHistoryEvent)
    .filter((event) => matchesTimeWindow(event, options))
    .sort((left, right) => left.sequence - right.sequence);

  const stateTotals = new Map<string, number>();
  const transitionTotals = new Map<string, number>();

  for (const event of relevantEvents) {
    if (event.eventType === 'state.entered' && typeof event.state === 'string') {
      stateTotals.set(event.state, (stateTotals.get(event.state) ?? 0) + 1);
    }

    if (
      event.eventType === 'transition.requested' ||
      event.eventType === 'transition.completed' ||
      event.eventType === 'transition.failed'
    ) {
      const key = toTransitionKey(event);
      if (key) {
        transitionTotals.set(key, (transitionTotals.get(key) ?? 0) + 1);
      }
    }
  }

  const stateVisits = new Map<string, number>();
  const transitionVisits = new Map<string, number>();
  const previouslyEnteredStates = new Set<string>();

  return relevantEvents.map((event) => {
    let iteration: number | null = null;
    let iterationLabel: string | null = null;
    let looped = false;

    if (event.eventType === 'state.entered' && typeof event.state === 'string') {
      const visit = (stateVisits.get(event.state) ?? 0) + 1;
      stateVisits.set(event.state, visit);

      if ((stateTotals.get(event.state) ?? 0) > 1) {
        iteration = visit;
        iterationLabel = `visit ${visit}`;
      }

      looped = previouslyEnteredStates.has(event.state);
      previouslyEnteredStates.add(event.state);
    }

    if (
      iteration === null &&
      (event.eventType === 'transition.requested' ||
        event.eventType === 'transition.completed' ||
        event.eventType === 'transition.failed')
    ) {
      const key = toTransitionKey(event);
      if (key) {
        const visit = (transitionVisits.get(key) ?? 0) + 1;
        transitionVisits.set(key, visit);
        if ((transitionTotals.get(key) ?? 0) > 1) {
          iteration = visit;
          iterationLabel = `iteration ${visit}`;
        }
      }
    }

    return {
      key: `${event.runId}:${event.eventId}`,
      runId: event.runId,
      eventId: event.eventId,
      sequence: event.sequence,
      timestamp: event.timestamp,
      eventType: event.eventType,
      stateId: event.state,
      transition: event.transition
        ? {
            from: event.transition.from ?? null,
            to: event.transition.to ?? null,
            name: event.transition.name ?? null,
          }
        : null,
      child: event.eventType === 'child.started' ? toChildInfo(event) : null,
      selectionTarget: toTransitionHistorySelectionTarget(event),
      iteration,
      iterationLabel,
      title: toTitle(event),
      detail: toDetail(event),
      looped,
      isFailure: event.eventType === 'transition.failed' || event.eventType === 'child.failed',
      isPending: event.eventType === 'transition.requested',
      event,
    };
  });
};

export { isTransitionHistoryEvent };
