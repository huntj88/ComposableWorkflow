import type { KeyboardEvent, ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Box,
  Chip,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
  type SelectChangeEvent,
} from '@mui/material';

import {
  listRunsResponseSchema,
  type ListRunsResponse,
  type RunSummaryResponse,
  type WorkflowLifecycle,
} from '@composable-workflow/workflow-api-types';

import { useRunsFilters } from './useRunsFilters';

const WORKFLOW_LIFECYCLE_OPTIONS: WorkflowLifecycle[] = [
  'running',
  'pausing',
  'paused',
  'resuming',
  'recovering',
  'cancelling',
  'completed',
  'failed',
  'cancelled',
];

const listRuns = async (queryString: string): Promise<ListRunsResponse> => {
  const endpoint =
    queryString.length > 0 ? `/api/v1/workflows/runs?${queryString}` : '/api/v1/workflows/runs';
  const response = await fetch(endpoint);

  if (!response.ok) {
    throw new Error(`Failed to load runs (${response.status})`);
  }

  const payload = (await response.json()) as unknown;

  return listRunsResponseSchema.parse(payload);
};

const formatDateTime = (value: string): string => new Date(value).toLocaleString();

const getNavigationHandler = (navigate: ReturnType<typeof useNavigate>, runId: string) => () =>
  navigate(`/runs/${runId}`);

const getKeyboardNavigationHandler =
  (onNavigate: () => void) => (event: KeyboardEvent<HTMLTableRowElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    event.preventDefault();
    onNavigate();
  };

const RunsTable = ({ items }: { items: RunSummaryResponse[] }): ReactElement => {
  const navigate = useNavigate();

  if (items.length === 0) {
    return (
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="body2" color="text.secondary">
          No runs matched the active filters.
        </Typography>
      </Paper>
    );
  }

  return (
    <Paper variant="outlined">
      <Table size="small" aria-label="runs-table">
        <TableHead>
          <TableRow>
            <TableCell>Run</TableCell>
            <TableCell>Workflow Type</TableCell>
            <TableCell>Lifecycle</TableCell>
            <TableCell>State</TableCell>
            <TableCell>Started</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {items.map((item) => {
            const onNavigate = getNavigationHandler(navigate, item.runId);

            return (
              <TableRow
                key={item.runId}
                hover
                role="link"
                tabIndex={0}
                onClick={onNavigate}
                onKeyDown={getKeyboardNavigationHandler(onNavigate)}
                sx={{
                  cursor: 'pointer',
                  '&:focus-visible': {
                    outline: '2px solid',
                    outlineColor: 'primary.main',
                    outlineOffset: '-2px',
                  },
                }}
              >
                <TableCell>{item.runId}</TableCell>
                <TableCell>{item.workflowType}</TableCell>
                <TableCell>
                  <Chip label={item.lifecycle} size="small" />
                </TableCell>
                <TableCell>{item.currentState}</TableCell>
                <TableCell>{formatDateTime(item.startedAt)}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Paper>
  );
};

export const RunsPage = (): ReactElement => {
  const { filters, setLifecycle, setWorkflowType, queryString } = useRunsFilters();

  const query = useQuery({
    queryKey: ['runs', queryString],
    queryFn: () => listRuns(queryString),
  });

  const handleLifecycleChange = (event: SelectChangeEvent<WorkflowLifecycle[]>): void => {
    const value = event.target.value;
    const selected = (Array.isArray(value) ? value : value.split(',')) as WorkflowLifecycle[];
    setLifecycle(selected);
  };

  return (
    <Stack spacing={2}>
      <Typography component="h1" variant="h4">
        Runs
      </Typography>
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <FormControl sx={{ minWidth: 260 }} size="small">
          <InputLabel id="runs-lifecycle-filter-label">Lifecycle</InputLabel>
          <Select<WorkflowLifecycle[]>
            labelId="runs-lifecycle-filter-label"
            multiple
            value={filters.lifecycle}
            label="Lifecycle"
            onChange={handleLifecycleChange}
            renderValue={(selected) => selected.join(', ')}
          >
            {WORKFLOW_LIFECYCLE_OPTIONS.map((lifecycle) => (
              <MenuItem key={lifecycle} value={lifecycle}>
                {lifecycle}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <TextField
          label="Workflow Type"
          size="small"
          value={filters.workflowType}
          onChange={(event) => setWorkflowType(event.target.value)}
          placeholder="example.workflow"
        />
      </Box>
      {query.isPending ? (
        <Typography variant="body2" color="text.secondary">
          Loading runs…
        </Typography>
      ) : null}
      {query.isError ? (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="body2" color="error">
            {(query.error as Error).message}
          </Typography>
        </Paper>
      ) : null}
      {query.data ? <RunsTable items={query.data.items} /> : null}
    </Stack>
  );
};
