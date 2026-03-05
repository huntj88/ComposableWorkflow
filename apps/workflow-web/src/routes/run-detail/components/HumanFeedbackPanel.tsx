import { useEffect, useMemo, useState, type ReactElement } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  FormControlLabel,
  Paper,
  Stack,
  TextField,
  Typography,
  Checkbox,
} from '@mui/material';

import type { RunFeedbackRequestSummary } from '@composable-workflow/workflow-api-types';

import { useFeedbackQueries } from '../hooks/useFeedbackQueries';
import { useSubmitFeedback } from '../hooks/useSubmitFeedback';

type HumanFeedbackPanelProps = {
  runId: string;
};

type FeedbackDraft = {
  selectedOptionIds: number[];
  text: string;
  respondedBy: string;
};

const DEFAULT_RESPONDED_BY = 'web-operator';

const formatDateTime = (value: string | null): string =>
  value ? new Date(value).toLocaleString() : '—';

const isTerminalStatus = (status: RunFeedbackRequestSummary['status']): boolean =>
  status === 'responded' || status === 'cancelled';

const toDraft = (draft: FeedbackDraft | undefined): FeedbackDraft => ({
  selectedOptionIds: draft?.selectedOptionIds ?? [],
  text: draft?.text ?? '',
  respondedBy: draft?.respondedBy ?? DEFAULT_RESPONDED_BY,
});

const renderValidationDetails = (details: Record<string, unknown>): string => {
  const lines = Object.entries(details).map(([key, value]) => `${key}: ${String(value)}`);
  return lines.join(' · ');
};

export const HumanFeedbackPanel = ({ runId }: HumanFeedbackPanelProps): ReactElement => {
  const feedback = useFeedbackQueries(runId);
  const submitFeedback = useSubmitFeedback();

  const [selectedFeedbackRunId, setSelectedFeedbackRunId] = useState<string | null>(null);
  const [draftsByFeedbackRunId, setDraftsByFeedbackRunId] = useState<Record<string, FeedbackDraft>>(
    {},
  );

  const prioritizedItems = useMemo(() => {
    const awaitingItems = feedback.items.filter((item) => item.status === 'awaiting_response');
    const terminalItems = feedback.items.filter((item) => item.status !== 'awaiting_response');
    return [...awaitingItems, ...terminalItems];
  }, [feedback.items]);

  useEffect(() => {
    if (prioritizedItems.length === 0) {
      setSelectedFeedbackRunId(null);
      return;
    }

    if (
      selectedFeedbackRunId !== null &&
      prioritizedItems.some((item) => item.feedbackRunId === selectedFeedbackRunId)
    ) {
      return;
    }

    setSelectedFeedbackRunId(prioritizedItems[0].feedbackRunId);
  }, [prioritizedItems, selectedFeedbackRunId]);

  const selectedItem = useMemo(
    () => prioritizedItems.find((item) => item.feedbackRunId === selectedFeedbackRunId) ?? null,
    [prioritizedItems, selectedFeedbackRunId],
  );

  const selectedDraft =
    selectedItem === null ? null : toDraft(draftsByFeedbackRunId[selectedItem.feedbackRunId]);
  const selectedSubmitState =
    selectedItem === null
      ? null
      : (submitFeedback.stateByFeedbackRunId[selectedItem.feedbackRunId] ?? null);

  const isSelectionTerminal =
    selectedItem !== null &&
    (isTerminalStatus(selectedItem.status) || selectedSubmitState?.conflict !== null);

  const isValidSubmitDraft =
    selectedItem !== null &&
    selectedDraft !== null &&
    selectedItem.questionId.trim().length > 0 &&
    selectedDraft.respondedBy.trim().length > 0;

  const setDraft = (feedbackRunId: string, patch: Partial<FeedbackDraft>): void => {
    setDraftsByFeedbackRunId((previous) => {
      const current = toDraft(previous[feedbackRunId]);

      return {
        ...previous,
        [feedbackRunId]: {
          ...current,
          ...patch,
        },
      };
    });
  };

  const toggleOptionId = (feedbackRunId: string, optionId: number): void => {
    setDraftsByFeedbackRunId((previous) => {
      const current = toDraft(previous[feedbackRunId]);
      const hasOption = current.selectedOptionIds.includes(optionId);
      const nextSelectedOptionIds = hasOption
        ? current.selectedOptionIds.filter((id) => id !== optionId)
        : [...current.selectedOptionIds, optionId];

      return {
        ...previous,
        [feedbackRunId]: {
          ...current,
          selectedOptionIds: nextSelectedOptionIds,
        },
      };
    });
  };

  const handleSubmit = async (): Promise<void> => {
    if (
      selectedItem === null ||
      selectedDraft === null ||
      !isValidSubmitDraft ||
      isSelectionTerminal
    ) {
      return;
    }

    const outcome = await submitFeedback.submit(selectedItem, selectedDraft);

    if (outcome.kind === 'success') {
      feedback.upsertItem({
        ...selectedItem,
        status: 'responded',
        respondedAt: outcome.acceptedAt,
        respondedBy: selectedDraft.respondedBy.trim(),
      });
      return;
    }

    if (outcome.kind === 'conflict') {
      feedback.upsertItem({
        ...selectedItem,
        status: outcome.conflict.status,
        respondedAt: outcome.conflict.respondedAt ?? null,
        cancelledAt: outcome.conflict.cancelledAt ?? null,
      });
    }
  };

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={1.5}>
        <Typography variant="h6">Human Feedback</Typography>

        {feedback.isLoading ? (
          <Typography variant="body2" color="text.secondary">
            Loading feedback requests…
          </Typography>
        ) : null}

        {!feedback.isLoading && feedback.errorMessage ? (
          <Alert
            severity="error"
            action={
              <Button color="inherit" size="small" onClick={() => void feedback.refresh()}>
                Retry
              </Button>
            }
          >
            {feedback.errorMessage}
          </Alert>
        ) : null}

        {!feedback.isLoading && !feedback.errorMessage && feedback.items.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No awaiting feedback for this run.
          </Typography>
        ) : null}

        {!feedback.isLoading && !feedback.errorMessage && feedback.items.length > 0 ? (
          <Stack spacing={1.5}>
            <Stack spacing={1} divider={<Divider flexItem />}>
              {prioritizedItems.map((item) => (
                <Button
                  key={item.feedbackRunId}
                  variant={selectedFeedbackRunId === item.feedbackRunId ? 'contained' : 'text'}
                  color={item.status === 'awaiting_response' ? 'primary' : 'inherit'}
                  onClick={() => {
                    setSelectedFeedbackRunId(item.feedbackRunId);
                    submitFeedback.clearSubmitState(item.feedbackRunId);
                  }}
                  sx={{ justifyContent: 'flex-start', textTransform: 'none' }}
                >
                  <Stack alignItems="flex-start" spacing={0.25}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography variant="subtitle2">{item.questionId}</Typography>
                      <Chip size="small" label={item.status} color="default" />
                    </Stack>
                    <Typography variant="body2" sx={{ textAlign: 'left' }}>
                      {item.prompt}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'left' }}>
                      requested: {formatDateTime(item.requestedAt)} · responded:{' '}
                      {formatDateTime(item.respondedAt)}
                    </Typography>
                  </Stack>
                </Button>
              ))}
            </Stack>

            {feedback.nextCursor ? (
              <Button
                variant="outlined"
                size="small"
                onClick={() => void feedback.loadNextPage()}
                disabled={feedback.isLoadingNextPage}
              >
                {feedback.isLoadingNextPage ? 'Loading more…' : 'Load more'}
              </Button>
            ) : null}

            {selectedItem ? (
              <Box>
                <Divider sx={{ mb: 1.5 }} />
                <Stack spacing={1.25}>
                  <Typography variant="subtitle1">Selected Request</Typography>
                  <Typography variant="body2">{selectedItem.prompt}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    requested: {formatDateTime(selectedItem.requestedAt)} · responded:{' '}
                    {formatDateTime(selectedItem.respondedAt)} · cancelled:{' '}
                    {formatDateTime(selectedItem.cancelledAt)}
                  </Typography>

                  {selectedItem.constraints && selectedItem.constraints.length > 0 ? (
                    <Typography variant="body2" color="text.secondary">
                      constraints: {selectedItem.constraints.join(', ')}
                    </Typography>
                  ) : null}

                  {selectedSubmitState?.errorMessage ? (
                    <Alert
                      severity={selectedSubmitState.conflict ? 'warning' : 'error'}
                      role="status"
                      tabIndex={-1}
                    >
                      {selectedSubmitState.errorMessage}
                    </Alert>
                  ) : null}

                  {selectedSubmitState?.validationDetails ? (
                    <Alert severity="error">
                      Validation details:{' '}
                      {renderValidationDetails(selectedSubmitState.validationDetails)}
                    </Alert>
                  ) : null}

                  {selectedSubmitState?.conflict ? (
                    <Alert severity="warning">
                      Terminal status: {selectedSubmitState.conflict.status} · responded:{' '}
                      {formatDateTime(selectedSubmitState.conflict.respondedAt ?? null)} ·
                      cancelled: {formatDateTime(selectedSubmitState.conflict.cancelledAt ?? null)}
                    </Alert>
                  ) : null}

                  <TextField
                    size="small"
                    label="Responded by"
                    value={selectedDraft?.respondedBy ?? DEFAULT_RESPONDED_BY}
                    onChange={(event) => {
                      setDraft(selectedItem.feedbackRunId, { respondedBy: event.target.value });
                    }}
                    disabled={isSelectionTerminal || selectedSubmitState?.isSubmitting}
                  />

                  {selectedItem.options && selectedItem.options.length > 0 ? (
                    <Stack spacing={0.5}>
                      <Typography variant="body2" color="text.secondary">
                        Select options
                      </Typography>
                      {selectedItem.options.map((option) => (
                        <FormControlLabel
                          key={`${selectedItem.feedbackRunId}-${option.id}`}
                          control={
                            <Checkbox
                              checked={
                                selectedDraft?.selectedOptionIds.includes(option.id) ?? false
                              }
                              onChange={() => toggleOptionId(selectedItem.feedbackRunId, option.id)}
                              disabled={isSelectionTerminal || selectedSubmitState?.isSubmitting}
                            />
                          }
                          label={`${option.id} - ${option.label}${option.description ? `: ${option.description}` : ''}`}
                        />
                      ))}
                    </Stack>
                  ) : null}

                  <TextField
                    size="small"
                    multiline
                    minRows={3}
                    label="Response text"
                    value={selectedDraft?.text ?? ''}
                    onChange={(event) => {
                      setDraft(selectedItem.feedbackRunId, { text: event.target.value });
                    }}
                    disabled={isSelectionTerminal || selectedSubmitState?.isSubmitting}
                  />

                  <Button
                    variant="contained"
                    onClick={() => void handleSubmit()}
                    disabled={
                      !isValidSubmitDraft ||
                      isSelectionTerminal ||
                      selectedSubmitState?.isSubmitting === true
                    }
                    sx={{ alignSelf: 'start' }}
                  >
                    {selectedSubmitState?.isSubmitting ? 'Submitting…' : 'Submit feedback'}
                  </Button>
                </Stack>
              </Box>
            ) : null}
          </Stack>
        ) : null}
      </Stack>
    </Paper>
  );
};
