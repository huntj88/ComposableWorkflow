import { useMemo, type ReactElement } from 'react';
import { Alert, Button, Paper, Stack, Typography } from '@mui/material';

import type { RunEventsResponse } from '@composable-workflow/workflow-api-types';

import { buildTransitionHistory } from '../history/buildTransitionHistory';
import { useRunDetailFilterStore } from '../state/filterStore';
import { TransitionHistoryEntryList } from './TransitionHistoryChildSection';

type TransitionHistoryPanelProps = {
  events: RunEventsResponse | null;
  isLoading: boolean;
  errorMessage: string | null;
  onRetry: () => Promise<void>;
};

export const TransitionHistoryPanel = ({
  events,
  isLoading,
  errorMessage,
  onRetry,
}: TransitionHistoryPanelProps): ReactElement => {
  const linkModeEnabled = useRunDetailFilterStore((state) => state.linkModeEnabled);
  const since = useRunDetailFilterStore((state) => state.events.since);
  const until = useRunDetailFilterStore((state) => state.events.until);

  const entries = useMemo(
    () =>
      buildTransitionHistory(events, {
        linkModeEnabled,
        since,
        until,
      }),
    [events, linkModeEnabled, since, until],
  );

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={1.5}>
        <Stack spacing={0.25}>
          <Typography variant="h6">Transition History</Typography>
          <Typography variant="body2" color="text.secondary">
            Ordered execution narrative derived from transition-relevant run events.
          </Typography>
        </Stack>

        {isLoading ? (
          <Typography variant="body2" color="text.secondary">
            Loading transition history…
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
        {!isLoading && !errorMessage && entries.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No transition-relevant events available for the current view.
          </Typography>
        ) : null}
        {!isLoading && !errorMessage && entries.length > 0 ? (
          <TransitionHistoryEntryList entries={entries} depth={0} />
        ) : null}
      </Stack>
    </Paper>
  );
};
