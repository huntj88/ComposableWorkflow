import type { ReactElement } from 'react';
import { Alert, Button, Chip, Paper, Stack, Typography } from '@mui/material';

import type { RunSummaryResponse } from '@composable-workflow/workflow-api-types';

type RunSummaryPanelProps = {
  runId: string;
  summary: RunSummaryResponse | null;
  isLoading: boolean;
  errorMessage: string | null;
  lastUpdatedAt: string | null;
  onRetry: () => Promise<void>;
};

const formatDateTime = (value: string | null): string => {
  if (!value) {
    return '—';
  }

  return new Date(value).toLocaleString();
};

const MetadataRow = ({ label, value }: { label: string; value: string }): ReactElement => (
  <Stack direction="row" spacing={1}>
    <Typography variant="body2" color="text.secondary" sx={{ minWidth: 180 }}>
      {label}
    </Typography>
    <Typography variant="body2">{value}</Typography>
  </Stack>
);

export const RunSummaryPanel = ({
  runId,
  summary,
  isLoading,
  errorMessage,
  lastUpdatedAt,
  onRetry,
}: RunSummaryPanelProps): ReactElement => (
  <Paper variant="outlined" sx={{ p: 2 }}>
    <Stack spacing={1.5}>
      <Typography variant="h6">Run Summary</Typography>
      {isLoading ? (
        <Typography variant="body2" color="text.secondary">
          Loading run summary…
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
      {!isLoading && !errorMessage && summary ? (
        <Stack spacing={1}>
          <MetadataRow label="Run ID" value={runId} />
          <MetadataRow
            label="Workflow"
            value={`${summary.workflowType} (version ${summary.workflowVersion})`}
          />
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="body2" color="text.secondary" sx={{ minWidth: 180 }}>
              Lifecycle
            </Typography>
            <Chip label={summary.lifecycle} size="small" />
          </Stack>
          <MetadataRow label="Current State" value={summary.currentState} />
          <MetadataRow label="Parent Run" value={summary.parentRunId ?? 'None'} />
          <MetadataRow label="Started At" value={formatDateTime(summary.startedAt)} />
          <MetadataRow label="Ended At" value={formatDateTime(summary.endedAt)} />
          <MetadataRow
            label="Progress Counters"
            value={`events ${summary.counters.eventCount}, logs ${summary.counters.logCount}, children ${summary.counters.childCount}`}
          />
          <MetadataRow
            label="Children Summary"
            value={`total ${summary.childrenSummary.total}, active ${summary.childrenSummary.active}, completed ${summary.childrenSummary.completed}, failed ${summary.childrenSummary.failed}, cancelled ${summary.childrenSummary.cancelled}`}
          />
          <MetadataRow label="Last Updated" value={formatDateTime(lastUpdatedAt)} />
        </Stack>
      ) : null}
    </Stack>
  </Paper>
);
