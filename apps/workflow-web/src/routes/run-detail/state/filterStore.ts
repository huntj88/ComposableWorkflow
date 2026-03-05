import { create } from 'zustand';

import type { WebGetRunLogsQuery, GetRunEventsQuery } from '../../../transport/workflowApiClient';
import {
  EVENTS_DEFAULT_LIMIT,
  EVENTS_MAX_LIMIT,
  LOGS_DEFAULT_LIMIT,
  LOGS_MAX_LIMIT,
} from '../../../transport/workflowApiClient';
import type { WorkflowEventDto } from '@composable-workflow/workflow-api-types';

type EventFilters = {
  eventType: string;
  since: string;
  until: string;
  text: string;
  limit: number;
};

type LogFilters = {
  severity: '' | 'debug' | 'info' | 'warn' | 'error';
  since: string;
  until: string;
  correlationId: string;
  eventId: string;
  limit: number;
};

type CorrelationContext = {
  correlationId: string;
  eventId: string;
};

type RunDetailFilterState = {
  linkModeEnabled: boolean;
  events: EventFilters;
  logs: LogFilters;
  correlationContext: CorrelationContext;
  setLinkModeEnabled: (enabled: boolean) => void;
  setEventsFilters: (next: Partial<EventFilters>) => void;
  setLogsFilters: (next: Partial<LogFilters>) => void;
  setCorrelationContext: (next: Partial<CorrelationContext>) => void;
  resetEventsFilters: () => void;
  resetLogsFilters: () => void;
};

const defaultEventsFilters = (): EventFilters => ({
  eventType: '',
  since: '',
  until: '',
  text: '',
  limit: EVENTS_DEFAULT_LIMIT,
});

const defaultLogsFilters = (): LogFilters => ({
  severity: '',
  since: '',
  until: '',
  correlationId: '',
  eventId: '',
  limit: LOGS_DEFAULT_LIMIT,
});

const defaultCorrelationContext = (): CorrelationContext => ({
  correlationId: '',
  eventId: '',
});

const clampLimit = (value: number, fallback: number, max: number): number => {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  const whole = Math.trunc(value);
  if (whole < 1) {
    return fallback;
  }

  return Math.min(whole, max);
};

const normalizeString = (value: unknown): string => (typeof value === 'string' ? value : '');

const mergeTemporalFields = (
  events: EventFilters,
  logs: LogFilters,
): { since: string; until: string } => ({
  since: events.since.length > 0 ? events.since : logs.since,
  until: events.until.length > 0 ? events.until : logs.until,
});

const appendStringPayloadValues = (candidate: unknown, collected: string[]): void => {
  if (typeof candidate === 'string') {
    collected.push(candidate);
    return;
  }

  if (Array.isArray(candidate)) {
    for (const value of candidate) {
      appendStringPayloadValues(value, collected);
    }
    return;
  }

  if (candidate && typeof candidate === 'object') {
    for (const value of Object.values(candidate as Record<string, unknown>)) {
      appendStringPayloadValues(value, collected);
    }
  }
};

export const matchesEventFreeText = (event: WorkflowEventDto, freeText: string): boolean => {
  const normalizedQuery = freeText.trim().toLowerCase();

  if (normalizedQuery.length === 0) {
    return true;
  }

  const values: string[] = [event.eventType];

  if (typeof event.state === 'string') {
    values.push(event.state);
  }

  if (typeof event.transition?.name === 'string') {
    values.push(event.transition.name);
  }

  if (event.payload) {
    appendStringPayloadValues(event.payload, values);
  }

  const errorMessage = event.error?.message;
  if (typeof errorMessage === 'string') {
    values.push(errorMessage);
  }

  return values.some((value) => value.toLowerCase().includes(normalizedQuery));
};

export const toEventsTransportQuery = (filters: EventFilters): GetRunEventsQuery => {
  const query: GetRunEventsQuery = {
    limit: clampLimit(filters.limit, EVENTS_DEFAULT_LIMIT, EVENTS_MAX_LIMIT),
  };

  if (filters.eventType.trim().length > 0) {
    query.eventType = filters.eventType.trim();
  }

  if (filters.since.trim().length > 0) {
    query.since = filters.since.trim();
  }

  if (filters.until.trim().length > 0) {
    query.until = filters.until.trim();
  }

  return query;
};

export const toLogsTransportQuery = (filters: LogFilters): WebGetRunLogsQuery => {
  const query: WebGetRunLogsQuery = {
    limit: clampLimit(filters.limit, LOGS_DEFAULT_LIMIT, LOGS_MAX_LIMIT),
  };

  if (filters.severity !== '') {
    query.severity = filters.severity;
  }

  if (filters.since.trim().length > 0) {
    query.since = filters.since.trim();
  }

  if (filters.until.trim().length > 0) {
    query.until = filters.until.trim();
  }

  if (filters.correlationId.trim().length > 0) {
    query.correlationId = filters.correlationId.trim();
  }

  if (filters.eventId.trim().length > 0) {
    query.eventId = filters.eventId.trim();
  }

  return query;
};

export const useRunDetailFilterStore = create<RunDetailFilterState>((set) => ({
  linkModeEnabled: false,
  events: defaultEventsFilters(),
  logs: defaultLogsFilters(),
  correlationContext: defaultCorrelationContext(),
  setLinkModeEnabled: (enabled) =>
    set((state) => {
      if (!enabled) {
        return { linkModeEnabled: false };
      }

      const mergedTemporal = mergeTemporalFields(state.events, state.logs);
      return {
        linkModeEnabled: true,
        events: {
          ...state.events,
          since: mergedTemporal.since,
          until: mergedTemporal.until,
        },
        logs: {
          ...state.logs,
          since: mergedTemporal.since,
          until: mergedTemporal.until,
          eventId:
            state.correlationContext.eventId.length > 0
              ? state.correlationContext.eventId
              : state.logs.eventId,
          correlationId:
            state.correlationContext.correlationId.length > 0
              ? state.correlationContext.correlationId
              : state.logs.correlationId,
        },
      };
    }),
  setEventsFilters: (next) =>
    set((state) => {
      const mergedEvents: EventFilters = {
        ...state.events,
        ...next,
        eventType: normalizeString(next.eventType ?? state.events.eventType),
        since: normalizeString(next.since ?? state.events.since),
        until: normalizeString(next.until ?? state.events.until),
        text: normalizeString(next.text ?? state.events.text),
        limit: clampLimit(next.limit ?? state.events.limit, EVENTS_DEFAULT_LIMIT, EVENTS_MAX_LIMIT),
      };

      if (!state.linkModeEnabled) {
        return { events: mergedEvents };
      }

      return {
        events: mergedEvents,
        logs: {
          ...state.logs,
          since: mergedEvents.since,
          until: mergedEvents.until,
        },
      };
    }),
  setLogsFilters: (next) =>
    set((state) => {
      const mergedLogs: LogFilters = {
        ...state.logs,
        ...next,
        severity: (next.severity ?? state.logs.severity) as LogFilters['severity'],
        since: normalizeString(next.since ?? state.logs.since),
        until: normalizeString(next.until ?? state.logs.until),
        correlationId: normalizeString(next.correlationId ?? state.logs.correlationId),
        eventId: normalizeString(next.eventId ?? state.logs.eventId),
        limit: clampLimit(next.limit ?? state.logs.limit, LOGS_DEFAULT_LIMIT, LOGS_MAX_LIMIT),
      };

      if (!state.linkModeEnabled) {
        return {
          logs: mergedLogs,
          correlationContext: {
            correlationId: mergedLogs.correlationId,
            eventId: mergedLogs.eventId,
          },
        };
      }

      return {
        logs: mergedLogs,
        events: {
          ...state.events,
          since: mergedLogs.since,
          until: mergedLogs.until,
        },
        correlationContext: {
          correlationId: mergedLogs.correlationId,
          eventId: mergedLogs.eventId,
        },
      };
    }),
  setCorrelationContext: (next) =>
    set((state) => {
      const correlationContext = {
        correlationId: normalizeString(
          next.correlationId ?? state.correlationContext.correlationId,
        ),
        eventId: normalizeString(next.eventId ?? state.correlationContext.eventId),
      };

      if (!state.linkModeEnabled) {
        return { correlationContext };
      }

      return {
        correlationContext,
        logs: {
          ...state.logs,
          eventId:
            correlationContext.eventId.length > 0 ? correlationContext.eventId : state.logs.eventId,
          correlationId:
            correlationContext.correlationId.length > 0
              ? correlationContext.correlationId
              : state.logs.correlationId,
        },
      };
    }),
  resetEventsFilters: () =>
    set((state) => {
      const reset = defaultEventsFilters();

      if (!state.linkModeEnabled) {
        return { events: reset };
      }

      return {
        events: reset,
        logs: {
          ...state.logs,
          since: reset.since,
          until: reset.until,
        },
      };
    }),
  resetLogsFilters: () =>
    set((state) => {
      const reset = defaultLogsFilters();

      if (!state.linkModeEnabled) {
        return { logs: reset, correlationContext: defaultCorrelationContext() };
      }

      return {
        logs: reset,
        events: {
          ...state.events,
          since: reset.since,
          until: reset.until,
        },
        correlationContext: defaultCorrelationContext(),
      };
    }),
}));

export type { EventFilters, LogFilters, CorrelationContext, RunDetailFilterState };
