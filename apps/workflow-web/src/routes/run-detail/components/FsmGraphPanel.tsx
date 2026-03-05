import type { ReactElement } from 'react';
import { Alert, Button, Paper, Stack, Typography } from '@mui/material';

import type { WorkflowDefinitionResponse } from '@composable-workflow/workflow-api-types';

type FsmGraphPanelProps = {
  definition: WorkflowDefinitionResponse | null;
  isLoading: boolean;
  errorMessage: string | null;
  onRetry: () => Promise<void>;
};

export const FsmGraphPanel = ({
  definition,
  isLoading,
  errorMessage,
  onRetry,
}: FsmGraphPanelProps): ReactElement => (
  <Paper variant="outlined" sx={{ p: 2 }}>
    <Stack spacing={1.5}>
      <Typography variant="h6">FSM Graph</Typography>
      {isLoading ? (
        <Typography variant="body2" color="text.secondary">
          Loading definition graph…
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
      {!isLoading && !errorMessage && definition ? (
        <Stack spacing={0.5}>
          <Typography variant="body2">
            Workflow: {definition.workflowType} (version {definition.workflowVersion})
          </Typography>
          <Typography variant="body2" color="text.secondary">
            States: {definition.states.length} · Transitions: {definition.transitions.length}
          </Typography>
        </Stack>
      ) : null}
    </Stack>
  </Paper>
);
