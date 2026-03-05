import { useMemo, type ReactElement } from 'react';
import {
  Alert,
  Button,
  Divider,
  FormControlLabel,
  MenuItem,
  Paper,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';

import type { RunLogsResponse } from '@composable-workflow/workflow-api-types';

import { useRunDetailFilterStore } from '../state/filterStore';

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
}: LogsPanelProps): ReactElement => {
  const linkModeEnabled = useRunDetailFilterStore((state) => state.linkModeEnabled);
  const setLinkModeEnabled = useRunDetailFilterStore((state) => state.setLinkModeEnabled);
  const logFilters = useRunDetailFilterStore((state) => state.logs);
  const setLogsFilters = useRunDetailFilterStore((state) => state.setLogsFilters);
  const resetLogsFilters = useRunDetailFilterStore((state) => state.resetLogsFilters);

  const orderedLogs = useMemo(() => {
    const items = [...(logs?.items ?? [])];
    return items.sort((left, right) => {
      if (left.timestamp === right.timestamp) {
        return left.eventId.localeCompare(right.eventId);
      }

      return left.timestamp.localeCompare(right.timestamp);
    });
  }, [logs]);

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={1.5}>
        <Typography variant="h6">Logs</Typography>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }}>
          <TextField
            select
            size="small"
            label="Severity"
            value={logFilters.severity}
            onChange={(event) =>
              setLogsFilters({
                severity: event.target.value as '' | 'debug' | 'info' | 'warn' | 'error',
              })
            }
            sx={{ minWidth: 160 }}
          >
            <MenuItem value="">Any</MenuItem>
            <MenuItem value="debug">debug</MenuItem>
            <MenuItem value="info">info</MenuItem>
            <MenuItem value="warn">warn</MenuItem>
            <MenuItem value="error">error</MenuItem>
          </TextField>
          <TextField
            size="small"
            label="Since"
            placeholder="ISO date-time"
            value={logFilters.since}
            onChange={(event) => setLogsFilters({ since: event.target.value })}
          />
          <TextField
            size="small"
            label="Until"
            placeholder="ISO date-time"
            value={logFilters.until}
            onChange={(event) => setLogsFilters({ until: event.target.value })}
          />
          <TextField
            size="small"
            label="Correlation ID"
            value={logFilters.correlationId}
            onChange={(event) => setLogsFilters({ correlationId: event.target.value })}
          />
          <TextField
            size="small"
            label="Event ID"
            value={logFilters.eventId}
            onChange={(event) => setLogsFilters({ eventId: event.target.value })}
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
          <Button size="small" variant="contained" onClick={() => void onRetry()}>
            Apply
          </Button>
          <Button
            size="small"
            variant="text"
            onClick={() => {
              resetLogsFilters();
              void onRetry();
            }}
          >
            Reset
          </Button>
        </Stack>

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
        {!isLoading && !errorMessage && orderedLogs.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No logs available for current filters.
          </Typography>
        ) : null}
        {!isLoading && !errorMessage && orderedLogs.length > 0 ? (
          <Stack spacing={1} divider={<Divider flexItem />}>
            {orderedLogs.map((log) => (
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
};
