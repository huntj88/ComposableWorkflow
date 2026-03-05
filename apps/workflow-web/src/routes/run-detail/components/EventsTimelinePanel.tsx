import type { ReactElement } from 'react';
import { Alert, Button, Divider, Paper, Stack, Typography } from '@mui/material';

import type { RunEventsResponse } from '@composable-workflow/workflow-api-types';

type EventsTimelinePanelProps = {
  events: RunEventsResponse | null;
  isLoading: boolean;
  errorMessage: string | null;
  onRetry: () => Promise<void>;
};

const formatDateTime = (value: string): string => new Date(value).toLocaleString();

export const EventsTimelinePanel = ({
  events,
  isLoading,
  errorMessage,
  onRetry,
}: EventsTimelinePanelProps): ReactElement => (
  <Paper variant="outlined" sx={{ p: 2 }}>
    <Stack spacing={1.5}>
      <Typography variant="h6">Events Timeline</Typography>
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
      {!isLoading && !errorMessage && events && events.items.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No events available for this run.
        </Typography>
      ) : null}
      {!isLoading && !errorMessage && events && events.items.length > 0 ? (
        <Stack spacing={1.25} divider={<Divider flexItem />}>
          {events.items.map((event) => (
            <Stack key={event.eventId} spacing={0.5}>
              <Typography variant="subtitle2">{event.eventType}</Typography>
              <Typography variant="body2" color="text.secondary">
                sequence: {event.sequence} · cursor: {events.nextCursor ?? 'none'}
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
      ) : null}
    </Stack>
  </Paper>
);
