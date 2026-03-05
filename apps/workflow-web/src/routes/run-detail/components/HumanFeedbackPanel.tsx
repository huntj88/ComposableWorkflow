import type { ReactElement } from 'react';
import { Alert, Button, Chip, Divider, Paper, Stack, Typography } from '@mui/material';

import type { ListRunFeedbackRequestsResponse } from '@composable-workflow/workflow-api-types';

type HumanFeedbackPanelProps = {
  feedback: ListRunFeedbackRequestsResponse | null;
  isLoading: boolean;
  errorMessage: string | null;
  onRetry: () => Promise<void>;
};

const formatDateTime = (value: string | null): string =>
  value ? new Date(value).toLocaleString() : '—';

export const HumanFeedbackPanel = ({
  feedback,
  isLoading,
  errorMessage,
  onRetry,
}: HumanFeedbackPanelProps): ReactElement => (
  <Paper variant="outlined" sx={{ p: 2 }}>
    <Stack spacing={1.5}>
      <Typography variant="h6">Human Feedback</Typography>
      {isLoading ? (
        <Typography variant="body2" color="text.secondary">
          Loading feedback requests…
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
      {!isLoading && !errorMessage && feedback && feedback.items.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No feedback requests for this run.
        </Typography>
      ) : null}
      {!isLoading && !errorMessage && feedback && feedback.items.length > 0 ? (
        <Stack spacing={1} divider={<Divider flexItem />}>
          {feedback.items.map((item) => (
            <Stack key={item.feedbackRunId} spacing={0.25}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="subtitle2">{item.questionId}</Typography>
                <Chip size="small" label={item.status} />
              </Stack>
              <Typography variant="body2">{item.prompt}</Typography>
              <Typography variant="caption" color="text.secondary">
                requested: {formatDateTime(item.requestedAt)} · responded:{' '}
                {formatDateTime(item.respondedAt)}
              </Typography>
            </Stack>
          ))}
        </Stack>
      ) : null}
    </Stack>
  </Paper>
);
