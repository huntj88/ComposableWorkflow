import type { ReactElement } from 'react';
import {
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Stack,
  Typography,
} from '@mui/material';

import type { ChildLaunchIteration } from '../graph/resolveChildDrilldownTarget';

export type IterationSelectorDialogProps = {
  open: boolean;
  stateId: string;
  childWorkflowType: string;
  iterations: ChildLaunchIteration[];
  onClose: () => void;
  onSelect: (iteration: ChildLaunchIteration) => void;
};

const formatTimestamp = (timestamp: string): string => {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? timestamp : date.toLocaleString();
};

export const IterationSelectorDialog = ({
  open,
  stateId,
  childWorkflowType,
  iterations,
  onClose,
  onSelect,
}: IterationSelectorDialogProps): ReactElement => (
  <Dialog
    open={open}
    onClose={onClose}
    fullWidth
    maxWidth="sm"
    data-testid="iteration-selector-dialog"
  >
    <DialogTitle>Select child launch iteration</DialogTitle>
    <DialogContent dividers>
      <Stack spacing={1.5}>
        <Typography variant="body2" color="text.secondary">
          {stateId} launched {childWorkflowType} multiple times. Choose which iteration to open.
        </Typography>
        <List disablePadding>
          {iterations.map((iteration) => (
            <ListItem
              key={`${iteration.sequence}-${iteration.iteration}`}
              disablePadding
              sx={{ mb: 1 }}
            >
              <ListItemButton onClick={() => onSelect(iteration)} divider>
                <ListItemText
                  primary={`Iteration ${iteration.iteration}`}
                  secondary={formatTimestamp(iteration.timestamp)}
                />
                <Stack direction="row" spacing={1} alignItems="center" sx={{ ml: 2 }}>
                  <Chip
                    size="small"
                    label={iteration.childRunId ?? 'Static definition'}
                    color={iteration.childRunId ? 'info' : 'default'}
                  />
                  <Chip size="small" label={iteration.lifecycle} color="secondary" />
                </Stack>
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      </Stack>
    </DialogContent>
  </Dialog>
);
