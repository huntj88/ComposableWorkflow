import { useEffect, useMemo, type ReactElement } from 'react';
import { Link } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  Collapse,
  Divider,
  Paper,
  Stack,
  Typography,
} from '@mui/material';

import type { TransitionHistoryEntry } from '../history/buildTransitionHistory';
import { buildTransitionHistory } from '../history/buildTransitionHistory';
import { getChildHistoryState, useTransitionHistoryStore } from '../state/transitionHistoryStore';
import { useRunDetailFilterStore } from '../state/filterStore';

type TransitionHistoryEntryListProps = {
  entries: TransitionHistoryEntry[];
  depth: number;
};

const formatDateTime = (value: string): string => new Date(value).toLocaleString();

const eventTypeColor = (
  entry: TransitionHistoryEntry,
): 'default' | 'primary' | 'success' | 'error' | 'warning' => {
  if (entry.isFailure) {
    return 'error';
  }

  if (entry.isPending) {
    return 'warning';
  }

  if (entry.eventType === 'transition.completed' || entry.eventType === 'child.completed') {
    return 'success';
  }

  if (entry.eventType === 'state.entered') {
    return 'primary';
  }

  return 'default';
};

const EntryRow = ({
  entry,
  depth,
}: {
  entry: TransitionHistoryEntry;
  depth: number;
}): ReactElement => {
  const selection = useTransitionHistoryStore((state) => state.selection);
  const selectEntry = useTransitionHistoryStore((state) => state.selectEntry);

  const isSelected = selection?.eventId === entry.eventId && selection.runId === entry.runId;

  return (
    <Paper
      variant="outlined"
      onClick={() =>
        selectEntry({
          source: 'history',
          runId: entry.runId,
          eventId: entry.eventId,
          sequence: entry.sequence,
          timestamp: entry.timestamp,
          target: entry.selectionTarget,
        })
      }
      sx={{
        p: 1.25,
        ml: depth * 2,
        cursor: 'pointer',
        borderColor: isSelected ? 'primary.main' : entry.isFailure ? 'error.main' : 'divider',
        backgroundColor: isSelected ? 'action.selected' : 'background.paper',
        borderLeftWidth: depth > 0 ? 3 : 1,
        borderLeftStyle: 'solid',
        borderLeftColor: depth > 0 ? 'info.main' : undefined,
      }}
      data-testid={`transition-history-entry-${entry.eventId}`}
    >
      <Stack spacing={0.75}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1}
          justifyContent="space-between"
          alignItems={{ xs: 'flex-start', sm: 'center' }}
        >
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <Typography variant="subtitle2">#{entry.sequence}</Typography>
            <Chip size="small" color={eventTypeColor(entry)} label={entry.eventType} />
            <Typography variant="body2" fontWeight={600}>
              {entry.title}
            </Typography>
            {entry.iterationLabel ? (
              <Chip size="small" variant="outlined" label={entry.iterationLabel} />
            ) : null}
            {entry.looped ? <Chip size="small" color="warning" label="Loop" /> : null}
          </Stack>
          <Typography variant="caption" color="text.secondary">
            {formatDateTime(entry.timestamp)}
          </Typography>
        </Stack>
        <Typography variant="body2" color={entry.isFailure ? 'error.main' : 'text.secondary'}>
          {entry.detail}
        </Typography>
      </Stack>
    </Paper>
  );
};

export const TransitionHistoryChildSection = ({
  entry,
  depth,
}: {
  entry: TransitionHistoryEntry;
  depth: number;
}): ReactElement | null => {
  const linkModeEnabled = useRunDetailFilterStore((state) => state.linkModeEnabled);
  const since = useRunDetailFilterStore((state) => state.events.since);
  const until = useRunDetailFilterStore((state) => state.events.until);
  const expanded = useTransitionHistoryStore(
    (state) => (entry.child ? state.expandedSections[entry.child.sectionKey] : false) ?? false,
  );
  const setSectionExpanded = useTransitionHistoryStore((state) => state.setSectionExpanded);
  const ensureChildHistoryLoaded = useTransitionHistoryStore(
    (state) => state.ensureChildHistoryLoaded,
  );
  const childHistories = useTransitionHistoryStore((state) => state.childHistories);

  const child = entry.child;
  const childHistoryState = child ? getChildHistoryState(childHistories, child.childRunId) : null;

  useEffect(() => {
    if (!child || !expanded) {
      return;
    }

    void ensureChildHistoryLoaded(child.childRunId);
  }, [child, ensureChildHistoryLoaded, expanded]);

  const childEntries = useMemo(() => {
    if (!child || !childHistoryState?.response) {
      return [];
    }

    return buildTransitionHistory(childHistoryState.response, {
      linkModeEnabled,
      since,
      until,
    });
  }, [child, childHistoryState?.response, linkModeEnabled, since, until]);

  if (!child || childHistoryState === null) {
    return null;
  }

  return (
    <Box sx={{ ml: depth * 2 + 2 }}>
      <Paper
        variant="outlined"
        sx={{
          p: 1,
          mt: 0.75,
          borderLeft: '3px solid',
          borderLeftColor: 'info.main',
          backgroundColor: 'action.hover',
        }}
      >
        <Stack spacing={1}>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1}
            justifyContent="space-between"
            alignItems={{ xs: 'flex-start', sm: 'center' }}
          >
            <Stack spacing={0.25}>
              <Typography variant="subtitle2">Child history · {child.childWorkflowType}</Typography>
              <Typography variant="caption" color="text.secondary">
                {child.childRunId} · lifecycle {child.lifecycle}
                {childEntries.length > 0 ? ` · ${childEntries.length} entries` : ''}
              </Typography>
            </Stack>
            <Stack direction="row" spacing={1}>
              <Button
                component={Link}
                to={`/runs/${encodeURIComponent(child.childRunId)}`}
                size="small"
              >
                Open run
              </Button>
              <Button
                size="small"
                variant="outlined"
                onClick={() => setSectionExpanded(child.sectionKey, !expanded)}
              >
                {expanded ? 'Collapse' : 'Expand'}
              </Button>
            </Stack>
          </Stack>

          {childHistoryState.status === 'error' ? (
            <Alert severity="error">{childHistoryState.errorMessage}</Alert>
          ) : null}
        </Stack>
      </Paper>
      <Collapse in={expanded} unmountOnExit>
        <Box sx={{ mt: 1 }}>
          {childHistoryState.status === 'loading' ? (
            <Typography variant="body2" color="text.secondary" sx={{ ml: 2 }}>
              Loading child transition history…
            </Typography>
          ) : null}
          {childHistoryState.status === 'loaded' && childEntries.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ ml: 2 }}>
              No child transition entries available.
            </Typography>
          ) : null}
          {childEntries.length > 0 ? (
            <TransitionHistoryEntryList entries={childEntries} depth={depth + 1} />
          ) : null}
        </Box>
      </Collapse>
    </Box>
  );
};

export const TransitionHistoryEntryList = ({
  entries,
  depth,
}: TransitionHistoryEntryListProps): ReactElement => (
  <Stack spacing={1} divider={<Divider flexItem sx={{ opacity: 0.35 }} />}>
    {entries.map((entry) => (
      <Box key={entry.key}>
        <EntryRow entry={entry} depth={depth} />
        {entry.child ? <TransitionHistoryChildSection entry={entry} depth={depth} /> : null}
      </Box>
    ))}
  </Stack>
);
