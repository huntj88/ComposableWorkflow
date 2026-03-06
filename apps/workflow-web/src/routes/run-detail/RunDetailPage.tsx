import { useEffect, useRef, useState, type ReactElement } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { Alert, Box, Button, Chip, Paper, Stack, Typography } from '@mui/material';

import type {
  RunEventsResponse,
  RunLogsResponse,
  RunSummaryResponse,
  WorkflowLifecycle,
  WorkflowStreamFrame,
} from '@composable-workflow/workflow-api-types';

import { EventsTimelinePanel } from './components/EventsTimelinePanel';
import { ExecutionTreePanel } from './components/ExecutionTreePanel';
import { FsmGraphPanel, type GraphDrilldownAncestor } from './components/FsmGraphPanel';
import type { FsmGraphBreadcrumbItem } from './components/FsmGraphBreadcrumbs';
import { HumanFeedbackPanel } from './components/HumanFeedbackPanel';
import { LogsPanel } from './components/LogsPanel';
import { RunSummaryPanel } from './components/RunSummaryPanel';
import { RunDashboardLayout } from './layout/RunDashboardLayout';
import { useRunDashboardQueries } from './useRunDashboardQueries';
import {
  applyStreamFrame,
  createStreamDashboardState,
  type StreamDashboardState,
} from '../../stream/applyStreamFrame';
import { openRunStream } from '../../stream/openRunStream';
import type { StreamHealthState } from '../../stream/reconnectPolicy';
import {
  announceLifecycleChange,
  announceStreamHealthChange,
  FocusTargets,
  moveFocusTo,
} from '../../a11y/liveAnnouncements';
import { resolveStreamHealthToken } from '../../theme/tokens';

const TERMINAL_LIFECYCLES = new Set(['completed', 'failed', 'cancelled']);

const isGraphDrilldownAncestor = (value: unknown): value is GraphDrilldownAncestor => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.runId === 'string' &&
    typeof candidate.label === 'string' &&
    (typeof candidate.workflowType === 'string' || candidate.workflowType === null)
  );
};

const toInitialStreamDashboardState = (params: {
  summary: RunSummaryResponse | null;
  events: RunEventsResponse | null;
  logs: RunLogsResponse | null;
}): StreamDashboardState => createStreamDashboardState(params);

export const RunDetailPage = (): ReactElement => {
  const { runId } = useParams<{ runId: string }>();
  const location = useLocation();

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
  const [graphStreamFrames, setGraphStreamFrames] = useState<WorkflowStreamFrame[]>([]);

  // Track previous lifecycle for announcement diffing
  const prevLifecycleRef = useRef<string | null>(null);
  const prevHealthRef = useRef<StreamHealthState>('reconnecting');

  useEffect(() => {
    setStreamState(
      toInitialStreamDashboardState({
        summary: dashboard.panels.summary.data,
        events: dashboard.panels.events.data,
        logs: dashboard.panels.logs.data,
      }),
    );
    setStreamUpdatedAt(dashboard.lastUpdatedAt);
    setGraphStreamFrames([]);
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
          setGraphStreamFrames((prev) => [...prev, frame]);
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

  // B-WEB-048/B-WEB-055: Announce lifecycle changes accessibly
  useEffect(() => {
    if (lifecycle && lifecycle !== prevLifecycleRef.current) {
      prevLifecycleRef.current = lifecycle;
      announceLifecycleChange(lifecycle as WorkflowLifecycle);
    }
  }, [lifecycle]);

  // B-WEB-048: Announce stream health changes accessibly
  useEffect(() => {
    if (streamHealthState !== prevHealthRef.current) {
      prevHealthRef.current = streamHealthState;
      announceStreamHealthChange(streamHealthState);
    }
  }, [streamHealthState]);

  const streamHealthToken = resolveStreamHealthToken(streamHealthState);
  const rawAncestors =
    typeof location.state === 'object' &&
    location.state !== null &&
    Array.isArray((location.state as { graphAncestors?: unknown[] }).graphAncestors)
      ? (location.state as { graphAncestors: unknown[] }).graphAncestors
      : [];
  const graphAncestors = rawAncestors
    .filter(isGraphDrilldownAncestor)
    .filter((ancestor) => ancestor.runId !== runId);
  const currentGraphCrumb: GraphDrilldownAncestor = {
    runId,
    workflowType: summary?.workflowType ?? dashboard.panels.definition.data?.workflowType ?? null,
    label:
      (summary?.workflowType ?? dashboard.panels.definition.data?.workflowType)
        ? `${summary?.workflowType ?? dashboard.panels.definition.data?.workflowType} · ${runId}`
        : runId,
  };
  const graphBreadcrumbs: FsmGraphBreadcrumbItem[] = [
    ...graphAncestors.map((ancestor, index) => ({
      key: `${ancestor.runId}-${index}`,
      label: ancestor.label,
      to: `/runs/${ancestor.runId}`,
      state: { graphAncestors: graphAncestors.slice(0, index) },
    })),
    {
      key: `current-${runId}`,
      label: currentGraphCrumb.label,
    },
  ];

  if (dashboard.isNotFound) {
    // B-WEB-055: Focus returns to /runs heading on not-found navigation
    void Promise.resolve().then(() => moveFocusTo(FocusTargets.RUNS_HEADING));

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

  const headerContent = (
    <>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1}
        alignItems={{ xs: 'stretch', sm: 'center' }}
        justifyContent="space-between"
      >
        <Box>
          <Typography
            component="h1"
            variant="h4"
            data-focus-target="run-dashboard-heading"
            tabIndex={-1}
          >
            Run Dashboard
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="body2" color="text.secondary">
              Run: {runId} · Stream:
            </Typography>
            <Chip
              size="small"
              label={streamHealthToken.label}
              color={streamHealthToken.color}
              aria-label={`Stream health: ${streamHealthToken.label}`}
            />
          </Stack>
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
    </>
  );

  return (
    <RunDashboardLayout
      header={headerContent}
      summaryStrip={
        <RunSummaryPanel
          runId={runId}
          summary={summary}
          isLoading={dashboard.panels.summary.isLoading}
          errorMessage={dashboard.panels.summary.errorMessage}
          lastUpdatedAt={streamUpdatedAt}
          onRetry={() => dashboard.retryPanel('summary')}
        />
      }
      executionTree={
        <ExecutionTreePanel
          tree={dashboard.panels.tree.data}
          isLoading={dashboard.panels.tree.isLoading}
          errorMessage={dashboard.panels.tree.errorMessage}
          onRetry={() => dashboard.retryPanel('tree')}
        />
      }
      fsmGraph={
        <FsmGraphPanel
          runId={runId}
          definition={dashboard.panels.definition.data}
          tree={dashboard.panels.tree.data}
          summary={summary}
          events={events}
          streamFrames={graphStreamFrames}
          navigationContext={{
            ancestors: graphAncestors,
            current: currentGraphCrumb,
            breadcrumbs: graphBreadcrumbs,
          }}
          isLoading={dashboard.panels.definition.isLoading}
          errorMessage={dashboard.panels.definition.errorMessage}
          onRetry={() => dashboard.retryPanel('definition')}
        />
      }
      eventsTimeline={
        <EventsTimelinePanel
          events={events}
          isLoading={dashboard.panels.events.isLoading}
          errorMessage={dashboard.panels.events.errorMessage}
          onRetry={() => dashboard.retryPanel('events')}
        />
      }
      logs={
        <LogsPanel
          logs={logs}
          isLoading={dashboard.panels.logs.isLoading}
          errorMessage={dashboard.panels.logs.errorMessage}
          onRetry={() => dashboard.retryPanel('logs')}
        />
      }
      feedback={<HumanFeedbackPanel runId={runId} />}
    />
  );
};
