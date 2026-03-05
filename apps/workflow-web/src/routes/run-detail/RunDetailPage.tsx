import { useEffect, useState, type ReactElement } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert, Box, Button, Paper, Stack, Typography } from '@mui/material';

import type {
  RunEventsResponse,
  RunLogsResponse,
  RunSummaryResponse,
} from '@composable-workflow/workflow-api-types';

import { EventsTimelinePanel } from './components/EventsTimelinePanel';
import { ExecutionTreePanel } from './components/ExecutionTreePanel';
import { FsmGraphPanel } from './components/FsmGraphPanel';
import { HumanFeedbackPanel } from './components/HumanFeedbackPanel';
import { LogsPanel } from './components/LogsPanel';
import { RunSummaryPanel } from './components/RunSummaryPanel';
import { useRunDashboardQueries } from './useRunDashboardQueries';
import {
  applyStreamFrame,
  createStreamDashboardState,
  type StreamDashboardState,
} from '../../stream/applyStreamFrame';
import { openRunStream } from '../../stream/openRunStream';
import type { StreamHealthState } from '../../stream/reconnectPolicy';

const TERMINAL_LIFECYCLES = new Set(['completed', 'failed', 'cancelled']);

const toStreamStatusLabel = (
  streamOpenTriggered: boolean,
  healthState: StreamHealthState,
  requestError: string | null,
): string => {
  if (requestError) {
    return 'request error';
  }

  if (!streamOpenTriggered) {
    return 'waiting for snapshots';
  }

  if (healthState === 'connected') {
    return 'connected';
  }

  if (healthState === 'stale') {
    return 'stale';
  }

  return 'reconnecting';
};

const toInitialStreamDashboardState = (params: {
  summary: RunSummaryResponse | null;
  events: RunEventsResponse | null;
  logs: RunLogsResponse | null;
}): StreamDashboardState => createStreamDashboardState(params);

export const RunDetailPage = (): ReactElement => {
  const { runId } = useParams<{ runId: string }>();

  if (!runId) {
    return (
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack spacing={1}>
          <Typography component="h1" variant="h5">
            Run Details
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Missing run id.
          </Typography>
          <Button
            component={Link}
            to="/runs"
            variant="contained"
            size="small"
            sx={{ alignSelf: 'start' }}
          >
            Back to runs
          </Button>
        </Stack>
      </Paper>
    );
  }

  const dashboard = useRunDashboardQueries(runId);
  const [streamState, setStreamState] = useState<StreamDashboardState>(() =>
    toInitialStreamDashboardState({
      summary: dashboard.panels.summary.data,
      events: dashboard.panels.events.data,
      logs: dashboard.panels.logs.data,
    }),
  );
  const [streamHealthState, setStreamHealthState] = useState<StreamHealthState>('reconnecting');
  const [streamRequestError, setStreamRequestError] = useState<string | null>(null);
  const [streamUpdatedAt, setStreamUpdatedAt] = useState<string | null>(dashboard.lastUpdatedAt);

  useEffect(() => {
    setStreamState(
      toInitialStreamDashboardState({
        summary: dashboard.panels.summary.data,
        events: dashboard.panels.events.data,
        logs: dashboard.panels.logs.data,
      }),
    );
    setStreamUpdatedAt(dashboard.lastUpdatedAt);
  }, [
    dashboard.lastUpdatedAt,
    dashboard.panels.events.data,
    dashboard.panels.logs.data,
    dashboard.panels.summary.data,
    runId,
  ]);

  useEffect(() => {
    if (dashboard.isNotFound || !dashboard.streamOpenTriggered) {
      return;
    }

    setStreamRequestError(null);

    const stream = openRunStream({
      runId,
      cursor: dashboard.panels.events.data?.nextCursor,
      onHealthChange: setStreamHealthState,
      onRequestError: (message) => {
        setStreamRequestError(message);
      },
      onError: (error) => {
        setStreamRequestError(
          error instanceof Error && error.message.length > 0
            ? error.message
            : 'Stream adapter encountered an unexpected error.',
        );
      },
      onFrame: (frame) => {
        let accepted = false;

        setStreamState((previous) => {
          const applied = applyStreamFrame(previous, frame);
          accepted = applied.accepted;
          return applied.state;
        });

        if (accepted) {
          setStreamUpdatedAt(new Date().toISOString());
        }

        return accepted;
      },
    });

    return () => {
      stream.close();
    };
  }, [
    dashboard.isNotFound,
    dashboard.panels.events.data?.nextCursor,
    dashboard.streamOpenTriggered,
    runId,
  ]);

  const streamStatusLabel = toStreamStatusLabel(
    dashboard.streamOpenTriggered,
    streamHealthState,
    streamRequestError,
  );

  const summary = streamState.summary ?? dashboard.panels.summary.data;
  const events = streamState.events ?? dashboard.panels.events.data;
  const logs = streamState.logs ?? dashboard.panels.logs.data;

  const lifecycle = summary?.lifecycle;
  const showCancelAction = lifecycle ? !TERMINAL_LIFECYCLES.has(lifecycle) : false;
  const canCancel = lifecycle
    ? lifecycle === 'running' ||
      lifecycle === 'pausing' ||
      lifecycle === 'paused' ||
      lifecycle === 'resuming' ||
      lifecycle === 'recovering'
    : false;

  if (dashboard.isNotFound) {
    return (
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack spacing={1.5}>
          <Typography component="h1" variant="h5">
            Run not found
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Run {runId} does not exist or is no longer available.
          </Typography>
          <Button
            component={Link}
            to="/runs"
            variant="contained"
            size="small"
            sx={{ alignSelf: 'start' }}
          >
            Back to runs
          </Button>
        </Stack>
      </Paper>
    );
  }

  return (
    <Stack spacing={2}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1}
        alignItems={{ xs: 'stretch', sm: 'center' }}
        justifyContent="space-between"
      >
        <Box>
          <Typography component="h1" variant="h4">
            Run Dashboard
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Run: {runId} · Stream: {streamStatusLabel}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            size="small"
            onClick={() => void dashboard.refreshAll()}
            disabled={dashboard.isRefreshing}
          >
            Refresh
          </Button>
          {showCancelAction ? (
            <Button
              variant="contained"
              color="warning"
              size="small"
              onClick={() => void dashboard.cancelRun()}
              disabled={!canCancel || dashboard.isCancelling}
            >
              Cancel run
            </Button>
          ) : null}
          <Button component={Link} to="/runs" variant="text" size="small">
            Back to runs
          </Button>
        </Stack>
      </Stack>

      {dashboard.cancelError ? <Alert severity="error">{dashboard.cancelError}</Alert> : null}
      {streamRequestError ? <Alert severity="error">{streamRequestError}</Alert> : null}
      {!streamRequestError &&
      streamHealthState === 'reconnecting' &&
      dashboard.streamOpenTriggered ? (
        <Alert severity="info">Live stream reconnecting. Dashboard remains interactive.</Alert>
      ) : null}
      {!streamRequestError && streamHealthState === 'stale' ? (
        <Alert severity="warning">Live stream is stale. Waiting for fresh events.</Alert>
      ) : null}

      <RunSummaryPanel
        runId={runId}
        summary={summary}
        isLoading={dashboard.panels.summary.isLoading}
        errorMessage={dashboard.panels.summary.errorMessage}
        lastUpdatedAt={streamUpdatedAt}
        onRetry={() => dashboard.retryPanel('summary')}
      />

      <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2} alignItems="stretch">
        <Stack spacing={2} sx={{ flex: 2 }}>
          <ExecutionTreePanel
            tree={dashboard.panels.tree.data}
            isLoading={dashboard.panels.tree.isLoading}
            errorMessage={dashboard.panels.tree.errorMessage}
            onRetry={() => dashboard.retryPanel('tree')}
          />
          <FsmGraphPanel
            definition={dashboard.panels.definition.data}
            isLoading={dashboard.panels.definition.isLoading}
            errorMessage={dashboard.panels.definition.errorMessage}
            onRetry={() => dashboard.retryPanel('definition')}
          />
        </Stack>
        <Stack spacing={2} sx={{ flex: 3 }}>
          <EventsTimelinePanel
            events={events}
            isLoading={dashboard.panels.events.isLoading}
            errorMessage={dashboard.panels.events.errorMessage}
            onRetry={() => dashboard.retryPanel('events')}
          />
          <LogsPanel
            logs={logs}
            isLoading={dashboard.panels.logs.isLoading}
            errorMessage={dashboard.panels.logs.errorMessage}
            onRetry={() => dashboard.retryPanel('logs')}
          />
          <HumanFeedbackPanel runId={runId} />
        </Stack>
      </Stack>
    </Stack>
  );
};
