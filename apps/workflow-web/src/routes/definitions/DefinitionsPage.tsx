import type { ReactElement } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { List, ListItem, ListItemText, Paper, Stack, Typography } from '@mui/material';

import {
  workflowDefinitionResponseSchema,
  type WorkflowDefinitionResponse,
} from '@composable-workflow/workflow-api-types';

const getWorkflowDefinition = async (workflowType: string): Promise<WorkflowDefinitionResponse> => {
  const response = await fetch(`/api/v1/workflows/definitions/${encodeURIComponent(workflowType)}`);

  if (!response.ok) {
    throw new Error(`Failed to load definition (${response.status})`);
  }

  const payload = (await response.json()) as unknown;

  return workflowDefinitionResponseSchema.parse(payload);
};

export const DefinitionsPage = (): ReactElement => {
  const { workflowType } = useParams<{ workflowType: string }>();

  const query = useQuery({
    queryKey: ['definition', workflowType],
    queryFn: () => getWorkflowDefinition(workflowType ?? ''),
    enabled: typeof workflowType === 'string' && workflowType.length > 0,
  });

  return (
    <Stack spacing={2}>
      <Typography component="h1" variant="h4">
        Workflow Definition
      </Typography>
      <Typography component={Link} to="/runs" variant="body2">
        Back to runs
      </Typography>
      {!workflowType ? (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="body2" color="error">
            Missing workflow type route parameter.
          </Typography>
        </Paper>
      ) : null}
      {query.isPending ? (
        <Typography variant="body2" color="text.secondary">
          Loading definition…
        </Typography>
      ) : null}
      {query.isError ? (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="body2" color="error">
            {(query.error as Error).message}
          </Typography>
        </Paper>
      ) : null}
      {query.data ? (
        <Stack spacing={2}>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack spacing={1}>
              <Typography variant="subtitle2">Workflow Type</Typography>
              <Typography variant="body2">{query.data.workflowType}</Typography>
              <Typography variant="subtitle2">Version</Typography>
              <Typography variant="body2">{query.data.workflowVersion}</Typography>
              <Typography variant="subtitle2">States</Typography>
              <Typography variant="body2">{query.data.states.join(', ') || 'None'}</Typography>
              <Typography variant="subtitle2">Transitions</Typography>
              <Typography variant="body2">{query.data.transitions.length}</Typography>
            </Stack>
          </Paper>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="subtitle2" gutterBottom>
              Transition Inventory
            </Typography>
            <List dense disablePadding aria-label="definition-transition-list">
              {query.data.transitions.length > 0 ? (
                query.data.transitions.map((transition, index) => (
                  <ListItem key={`${transition.from}-${transition.to}-${index}`} disableGutters>
                    <ListItemText
                      primary={transition.name?.trim() || `${transition.from} → ${transition.to}`}
                      secondary={`${transition.from} → ${transition.to}`}
                    />
                  </ListItem>
                ))
              ) : (
                <ListItem disableGutters>
                  <ListItemText primary="No transitions defined." />
                </ListItem>
              )}
            </List>
          </Paper>
        </Stack>
      ) : null}
    </Stack>
  );
};
