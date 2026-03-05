import type { ReactElement } from 'react';
import { Alert, Button, Chip, Divider, Paper, Stack, Typography } from '@mui/material';

import type { RunTreeNode, RunTreeResponse } from '@composable-workflow/workflow-api-types';

type ExecutionTreePanelProps = {
  tree: RunTreeResponse | null;
  isLoading: boolean;
  errorMessage: string | null;
  onRetry: () => Promise<void>;
};

const TreeNodeRow = ({ node, depth }: { node: RunTreeNode; depth: number }): ReactElement => (
  <Stack spacing={0.5} sx={{ pl: depth * 2 }}>
    <Stack direction="row" spacing={1} alignItems="center">
      <Typography variant="body2">{node.runId}</Typography>
      <Chip size="small" label={node.lifecycle} />
    </Stack>
    <Typography variant="caption" color="text.secondary">
      {node.workflowType} · state: {node.currentState}
    </Typography>
    {node.children.map((child) => (
      <TreeNodeRow key={child.runId} node={child} depth={depth + 1} />
    ))}
  </Stack>
);

export const ExecutionTreePanel = ({
  tree,
  isLoading,
  errorMessage,
  onRetry,
}: ExecutionTreePanelProps): ReactElement => (
  <Paper variant="outlined" sx={{ p: 2 }}>
    <Stack spacing={1.5}>
      <Typography variant="h6">Execution Tree</Typography>
      {isLoading ? (
        <Typography variant="body2" color="text.secondary">
          Loading execution tree…
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
      {!isLoading && !errorMessage && tree ? (
        <>
          <TreeNodeRow node={tree.tree} depth={0} />
          <Divider />
          <Typography variant="caption" color="text.secondary">
            Overlay active node: {tree.overlay.activeNode}
          </Typography>
        </>
      ) : null}
    </Stack>
  </Paper>
);
