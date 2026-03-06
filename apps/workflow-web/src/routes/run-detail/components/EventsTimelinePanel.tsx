import { useEffect, useMemo, useRef, useState, type ReactElement, type UIEvent } from 'react';
import {
  Alert,
  Box,
  Button,
  Divider,
  FormControlLabel,
  Paper,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';

import type { RunEventsResponse } from '@composable-workflow/workflow-api-types';

import { toTransitionHistorySelectionTarget } from '../history/buildTransitionHistory';
import { matchesEventFreeText, useRunDetailFilterStore } from '../state/filterStore';
import { useTransitionHistoryStore } from '../state/transitionHistoryStore';

type EventsTimelinePanelProps = {
  events: RunEventsResponse | null;
  isLoading: boolean;
  errorMessage: string | null;
  onRetry: () => Promise<void>;
};

const formatDateTime = (value: string): string => new Date(value).toLocaleString();

const isNearBottom = (element: HTMLElement): boolean => {
  const remaining = element.scrollHeight - element.scrollTop - element.clientHeight;
  return remaining <= 20;
};

type RealtimeAppendDecisionInput = {
  previousVisibleCount: number;
  nextVisibleCount: number;
  autoFollow: boolean;
  hasLatestInView: boolean;
  pendingUpdates: number;
};

type RealtimeAppendDecision = {
  appendedCount: number;
  shouldScrollToLatest: boolean;
  nextPendingUpdates: number;
  nextHasLatestInView: boolean;
};

export const decideRealtimeAppendBehavior = (
  input: RealtimeAppendDecisionInput,
): RealtimeAppendDecision => {
  const appendedCount = Math.max(0, input.nextVisibleCount - input.previousVisibleCount);

  if (appendedCount === 0) {
    return {
      appendedCount,
      shouldScrollToLatest: false,
      nextPendingUpdates: input.pendingUpdates,
      nextHasLatestInView: input.hasLatestInView,
    };
  }

  if (input.autoFollow || input.hasLatestInView) {
    return {
      appendedCount,
      shouldScrollToLatest: true,
      nextPendingUpdates: 0,
      nextHasLatestInView: true,
    };
  }

  return {
    appendedCount,
    shouldScrollToLatest: false,
    nextPendingUpdates: input.pendingUpdates + appendedCount,
    nextHasLatestInView: false,
  };
};

const readCorrelationId = (value: unknown): string => {
  if (!value || typeof value !== 'object') {
    return '';
  }

  const payload = value as Record<string, unknown>;

  if (typeof payload.correlationId === 'string') {
    return payload.correlationId;
  }

  if (typeof payload.correlation_id === 'string') {
    return payload.correlation_id;
  }

  return '';
};

export const EventsTimelinePanel = ({
  events,
  isLoading,
  errorMessage,
  onRetry,
}: EventsTimelinePanelProps): ReactElement => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const eventRowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const previousVisibleCountRef = useRef(0);
  const [autoFollow, setAutoFollow] = useState(false);
  const [hasLatestInView, setHasLatestInView] = useState(true);
  const [pendingUpdates, setPendingUpdates] = useState(0);

  const linkModeEnabled = useRunDetailFilterStore((state) => state.linkModeEnabled);
  const setLinkModeEnabled = useRunDetailFilterStore((state) => state.setLinkModeEnabled);
  const eventFilters = useRunDetailFilterStore((state) => state.events);
  const setEventFilters = useRunDetailFilterStore((state) => state.setEventsFilters);
  const resetEventFilters = useRunDetailFilterStore((state) => state.resetEventsFilters);
  const setCorrelationContext = useRunDetailFilterStore((state) => state.setCorrelationContext);
  const selection = useTransitionHistoryStore((state) => state.selection);
  const selectEntry = useTransitionHistoryStore((state) => state.selectEntry);

  const filteredEvents = useMemo(() => {
    const items = events?.items ?? [];

    return items.filter((event) => {
      if (!matchesEventFreeText(event, eventFilters.text)) {
        return false;
      }

      if (
        eventFilters.eventType.trim().length > 0 &&
        !event.eventType.toLowerCase().includes(eventFilters.eventType.trim().toLowerCase())
      ) {
        return false;
      }

      if (eventFilters.since.trim().length > 0 && event.timestamp < eventFilters.since.trim()) {
        return false;
      }

      if (eventFilters.until.trim().length > 0 && event.timestamp >= eventFilters.until.trim()) {
        return false;
      }

      return true;
    });
  }, [eventFilters.eventType, eventFilters.since, eventFilters.text, eventFilters.until, events]);

  useEffect(() => {
    const decision = decideRealtimeAppendBehavior({
      previousVisibleCount: previousVisibleCountRef.current,
      nextVisibleCount: filteredEvents.length,
      autoFollow,
      hasLatestInView,
      pendingUpdates,
    });

    previousVisibleCountRef.current = filteredEvents.length;

    if (decision.appendedCount === 0) {
      return;
    }

    const container = containerRef.current;
    if (!container) {
      return;
    }

    if (decision.shouldScrollToLatest) {
      container.scrollTop = container.scrollHeight;
      setPendingUpdates(decision.nextPendingUpdates);
      setHasLatestInView(decision.nextHasLatestInView);
      return;
    }

    setPendingUpdates(decision.nextPendingUpdates);
    setHasLatestInView(decision.nextHasLatestInView);
  }, [autoFollow, filteredEvents.length, hasLatestInView, pendingUpdates]);

  useEffect(() => {
    if (!selection?.eventId) {
      return;
    }

    const row = eventRowRefs.current[selection.eventId];
    if (!row) {
      return;
    }

    row.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [filteredEvents, selection?.eventId, selection?.requestId]);

  const handleScroll = (event: UIEvent<HTMLDivElement>): void => {
    const latestVisible = isNearBottom(event.currentTarget);
    setHasLatestInView(latestVisible);

    if (latestVisible) {
      setPendingUpdates(0);
    }
  };

  const handleJumpToLatest = (): void => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    container.scrollTop = container.scrollHeight;
    setPendingUpdates(0);
    setHasLatestInView(true);
  };

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={1.5}>
        <Typography variant="h6">Events Timeline</Typography>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }}>
          <TextField
            size="small"
            label="Event type"
            value={eventFilters.eventType}
            onChange={(event) => setEventFilters({ eventType: event.target.value })}
          />
          <TextField
            size="small"
            label="Since"
            placeholder="ISO date-time"
            value={eventFilters.since}
            onChange={(event) => setEventFilters({ since: event.target.value })}
          />
          <TextField
            size="small"
            label="Until"
            placeholder="ISO date-time"
            value={eventFilters.until}
            onChange={(event) => setEventFilters({ until: event.target.value })}
          />
          <TextField
            size="small"
            label="Search text"
            value={eventFilters.text}
            onChange={(event) => setEventFilters({ text: event.target.value })}
          />
        </Stack>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }}>
          <FormControlLabel
            control={
              <Switch
                checked={linkModeEnabled}
                onChange={(event) => setLinkModeEnabled(event.target.checked)}
              />
            }
            label="Link event/log time filters"
          />
          <FormControlLabel
            control={
              <Switch
                checked={autoFollow}
                onChange={(event) => setAutoFollow(event.target.checked)}
              />
            }
            label="Auto-follow latest"
          />
          <Button size="small" variant="contained" onClick={() => void onRetry()}>
            Apply
          </Button>
          <Button
            size="small"
            variant="text"
            onClick={() => {
              resetEventFilters();
              void onRetry();
            }}
          >
            Reset
          </Button>
          {!hasLatestInView && pendingUpdates > 0 ? (
            <Button size="small" variant="outlined" onClick={handleJumpToLatest}>
              Jump to latest ({pendingUpdates})
            </Button>
          ) : null}
        </Stack>

        {isLoading ? (
          <Typography variant="body2" color="text.secondary">
            Loading events…
          </Typography>
        ) : null}
        {!isLoading && errorMessage ? (
          <Alert
            severity="error"
            action={
              <Button color="inherit" size="small" onClick={() => void onRetry()}>
                Retry
              </Button>
            }
          >
            {errorMessage}
          </Alert>
        ) : null}
        {!isLoading && !errorMessage && filteredEvents.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No events available for current filters.
          </Typography>
        ) : null}
        {!isLoading && !errorMessage && filteredEvents.length > 0 ? (
          <Box
            ref={containerRef}
            onScroll={handleScroll}
            sx={{ maxHeight: 360, overflowY: 'auto', pr: 0.5 }}
          >
            <Stack spacing={1.25} divider={<Divider flexItem />}>
              {filteredEvents.map((event) => (
                <Stack
                  key={event.eventId}
                  ref={(node: HTMLDivElement | null) => {
                    eventRowRefs.current[event.eventId] = node;
                  }}
                  spacing={0.5}
                  sx={{
                    p: 0.75,
                    borderRadius: 1,
                    cursor: 'pointer',
                    backgroundColor:
                      selection?.eventId === event.eventId && selection.runId === event.runId
                        ? 'action.selected'
                        : 'transparent',
                    outline:
                      selection?.eventId === event.eventId && selection.runId === event.runId
                        ? '1px solid'
                        : 'none',
                    outlineColor: 'primary.main',
                  }}
                  onClick={() => {
                    setCorrelationContext({
                      eventId: event.eventId,
                      correlationId: readCorrelationId(event.payload),
                    });
                    selectEntry({
                      source: 'timeline',
                      runId: event.runId,
                      eventId: event.eventId,
                      sequence: event.sequence,
                      timestamp: event.timestamp,
                      target: toTransitionHistorySelectionTarget(event),
                    });
                  }}
                >
                  <Typography variant="subtitle2">{event.eventType}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    sequence: {event.sequence} · cursor: {events?.nextCursor ?? 'none'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {formatDateTime(event.timestamp)}
                  </Typography>
                  <Typography variant="body2">
                    state: {event.state ?? 'n/a'} · run: {event.runId}
                  </Typography>
                </Stack>
              ))}
            </Stack>
          </Box>
        ) : null}
      </Stack>
    </Paper>
  );
};
