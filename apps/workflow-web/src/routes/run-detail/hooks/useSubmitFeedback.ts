import { useCallback, useMemo, useState } from 'react';

import type {
  RunFeedbackRequestSummary,
  SubmitHumanFeedbackResponseConflict,
  SubmitHumanFeedbackResponsePayload,
} from '@composable-workflow/workflow-api-types';

import { WorkflowPanelError } from '../../../transport/errors';
import { workflowApiClient } from '../../../transport/workflowApiClient';

type SubmitFeedbackDraft = {
  readonly selectedOptionIds: number[];
  readonly text: string;
  readonly respondedBy: string;
};

type SubmitFeedbackState = {
  readonly isSubmitting: boolean;
  readonly errorMessage: string | null;
  readonly validationDetails: Record<string, unknown> | null;
  readonly conflict: SubmitHumanFeedbackResponseConflict | null;
  readonly acceptedAt: string | null;
};

type SubmitFeedbackOutcome =
  | { kind: 'success'; acceptedAt: string }
  | { kind: 'validation'; message: string }
  | { kind: 'conflict'; conflict: SubmitHumanFeedbackResponseConflict }
  | { kind: 'error'; message: string };

type UseSubmitFeedbackState = {
  submit: (
    item: RunFeedbackRequestSummary,
    draft: SubmitFeedbackDraft,
  ) => Promise<SubmitFeedbackOutcome>;
  stateByFeedbackRunId: Record<string, SubmitFeedbackState>;
  clearSubmitState: (feedbackRunId: string) => void;
};

const INITIAL_STATE: SubmitFeedbackState = {
  isSubmitting: false,
  errorMessage: null,
  validationDetails: null,
  conflict: null,
  acceptedAt: null,
};

const toErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof WorkflowPanelError) {
    return error.message;
  }

  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return fallback;
};

const toPayload = (
  item: RunFeedbackRequestSummary,
  draft: SubmitFeedbackDraft,
): SubmitHumanFeedbackResponsePayload => {
  const trimmedText = draft.text.trim();

  return {
    questionId: item.questionId,
    ...(draft.selectedOptionIds.length > 0 ? { selectedOptionIds: draft.selectedOptionIds } : {}),
    ...(trimmedText.length > 0 ? { text: trimmedText } : {}),
  };
};

const setEntry = (
  state: Record<string, SubmitFeedbackState>,
  feedbackRunId: string,
  patch: Partial<SubmitFeedbackState>,
): Record<string, SubmitFeedbackState> => ({
  ...state,
  [feedbackRunId]: {
    ...(state[feedbackRunId] ?? INITIAL_STATE),
    ...patch,
  },
});

export const useSubmitFeedback = (): UseSubmitFeedbackState => {
  const [stateByFeedbackRunId, setStateByFeedbackRunId] = useState<
    Record<string, SubmitFeedbackState>
  >({});

  const submit = useCallback(
    async (
      item: RunFeedbackRequestSummary,
      draft: SubmitFeedbackDraft,
    ): Promise<SubmitFeedbackOutcome> => {
      const feedbackRunId = item.feedbackRunId;
      const respondedBy = draft.respondedBy.trim();

      setStateByFeedbackRunId((previous) =>
        setEntry(previous, feedbackRunId, {
          isSubmitting: true,
          errorMessage: null,
          validationDetails: null,
          conflict: null,
        }),
      );

      try {
        const response = await workflowApiClient.submitHumanFeedbackResponse(feedbackRunId, {
          respondedBy,
          response: toPayload(item, draft),
        });

        setStateByFeedbackRunId((previous) =>
          setEntry(previous, feedbackRunId, {
            isSubmitting: false,
            acceptedAt: response.acceptedAt,
            errorMessage: null,
            validationDetails: null,
            conflict: null,
          }),
        );

        return { kind: 'success', acceptedAt: response.acceptedAt };
      } catch (error) {
        if (error instanceof WorkflowPanelError && error.status === 400) {
          setStateByFeedbackRunId((previous) =>
            setEntry(previous, feedbackRunId, {
              isSubmitting: false,
              acceptedAt: null,
              conflict: null,
              validationDetails: error.details,
              errorMessage: error.message,
            }),
          );

          return { kind: 'validation', message: error.message };
        }

        if (
          error instanceof WorkflowPanelError &&
          error.status === 409 &&
          error.feedbackConflict !== null
        ) {
          setStateByFeedbackRunId((previous) =>
            setEntry(previous, feedbackRunId, {
              isSubmitting: false,
              acceptedAt: null,
              validationDetails: null,
              conflict: error.feedbackConflict,
              errorMessage: error.message,
            }),
          );

          return { kind: 'conflict', conflict: error.feedbackConflict };
        }

        const message = toErrorMessage(error, 'Failed to submit feedback response.');

        setStateByFeedbackRunId((previous) =>
          setEntry(previous, feedbackRunId, {
            isSubmitting: false,
            acceptedAt: null,
            validationDetails: null,
            conflict: null,
            errorMessage: message,
          }),
        );

        return { kind: 'error', message };
      }
    },
    [],
  );

  const clearSubmitState = useCallback((feedbackRunId: string): void => {
    setStateByFeedbackRunId((previous) => {
      if (!(feedbackRunId in previous)) {
        return previous;
      }

      const next = { ...previous };
      delete next[feedbackRunId];
      return next;
    });
  }, []);

  return useMemo(
    () => ({
      submit,
      stateByFeedbackRunId,
      clearSubmitState,
    }),
    [submit, stateByFeedbackRunId, clearSubmitState],
  );
};
