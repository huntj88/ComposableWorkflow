import type { ReactElement } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert, Box, Button, Paper, Stack, Typography } from '@mui/material';

import { EventsTimelinePanel } from './components/EventsTimelinePanel';
import { ExecutionTreePanel } from './components/ExecutionTreePanel';
import { FsmGraphPanel } from './components/FsmGraphPanel';
import { HumanFeedbackPanel } from './components/HumanFeedbackPanel';
import { LogsPanel } from './components/LogsPanel';
import { RunSummaryPanel } from './components/RunSummaryPanel';
import { useRunDashboardQueries } from './useRunDashboardQueries';

const TERMINAL_LIFECYCLES = new Set(['completed', 'failed', 'cancelled']);

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
  const lifecycle = dashboard.panels.summary.data?.lifecycle;
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
            Run: {runId} · Stream:{' '}
            {dashboard.streamOpenTriggered ? 'open triggered' : 'waiting for snapshots'}
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

      <RunSummaryPanel
        runId={runId}
        summary={dashboard.panels.summary.data}
        isLoading={dashboard.panels.summary.isLoading}
        errorMessage={dashboard.panels.summary.errorMessage}
        lastUpdatedAt={dashboard.lastUpdatedAt}
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
            events={dashboard.panels.events.data}
            isLoading={dashboard.panels.events.isLoading}
            errorMessage={dashboard.panels.events.errorMessage}
            onRetry={() => dashboard.retryPanel('events')}
          />
          <LogsPanel
            logs={dashboard.panels.logs.data}
            isLoading={dashboard.panels.logs.isLoading}
            errorMessage={dashboard.panels.logs.errorMessage}
            onRetry={() => dashboard.retryPanel('logs')}
          />
          <HumanFeedbackPanel
            feedback={dashboard.panels.feedback.data}
            isLoading={dashboard.panels.feedback.isLoading}
            errorMessage={dashboard.panels.feedback.errorMessage}
            onRetry={() => dashboard.retryPanel('feedback')}
          />
        </Stack>
      </Stack>
    </Stack>
  );
};
