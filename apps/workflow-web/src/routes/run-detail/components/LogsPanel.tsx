import type { ReactElement } from 'react';
import { Alert, Button, Divider, Paper, Stack, Typography } from '@mui/material';

import type { RunLogsResponse } from '@composable-workflow/workflow-api-types';

type LogsPanelProps = {
  logs: RunLogsResponse | null;
  isLoading: boolean;
  errorMessage: string | null;
  onRetry: () => Promise<void>;
};

const formatDateTime = (value: string): string => new Date(value).toLocaleString();

export const LogsPanel = ({
  logs,
  isLoading,
  errorMessage,
  onRetry,
}: LogsPanelProps): ReactElement => (
  <Paper variant="outlined" sx={{ p: 2 }}>
    <Stack spacing={1.5}>
      <Typography variant="h6">Logs</Typography>
      {isLoading ? (
        <Typography variant="body2" color="text.secondary">
          Loading logs…
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
      {!isLoading && !errorMessage && logs && logs.items.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No logs available for this run.
        </Typography>
      ) : null}
      {!isLoading && !errorMessage && logs && logs.items.length > 0 ? (
        <Stack spacing={1} divider={<Divider flexItem />}>
          {logs.items.map((log) => (
            <Stack key={`${log.eventId}-${log.sequence}`} spacing={0.25}>
              <Typography variant="subtitle2">
                {log.level.toUpperCase()} · {log.eventType}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                sequence: {log.sequence} · {formatDateTime(log.timestamp)}
              </Typography>
              <Typography variant="body2">{log.message}</Typography>
            </Stack>
          ))}
        </Stack>
      ) : null}
    </Stack>
  </Paper>
);
