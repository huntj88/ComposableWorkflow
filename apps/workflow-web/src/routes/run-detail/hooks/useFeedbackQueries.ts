import { useCallback, useEffect, useMemo, useState } from 'react';

import type {
  ListRunFeedbackRequestsResponse,
  RunFeedbackRequestSummary,
} from '@composable-workflow/workflow-api-types';

import { FEEDBACK_DEFAULT_LIMIT, workflowApiClient } from '../../../transport/workflowApiClient';
import { WorkflowPanelError } from '../../../transport/errors';

type UseFeedbackQueriesState = {
  items: RunFeedbackRequestSummary[];
  isLoading: boolean;
  isLoadingNextPage: boolean;
  errorMessage: string | null;
  nextCursor: string | null;
  refresh: () => Promise<void>;
  loadNextPage: () => Promise<void>;
  upsertItem: (item: RunFeedbackRequestSummary) => void;
};

const sortFeedbackItems = (
  left: RunFeedbackRequestSummary,
  right: RunFeedbackRequestSummary,
): number => {
  if (left.requestedAt !== right.requestedAt) {
    return right.requestedAt.localeCompare(left.requestedAt);
  }

  return left.feedbackRunId.localeCompare(right.feedbackRunId);
};

const mergeFeedbackItems = (
  currentItems: RunFeedbackRequestSummary[],
  incomingItems: RunFeedbackRequestSummary[],
): RunFeedbackRequestSummary[] => {
  const merged = new Map<string, RunFeedbackRequestSummary>();

  for (const item of currentItems) {
    merged.set(item.feedbackRunId, item);
  }

  for (const item of incomingItems) {
    merged.set(item.feedbackRunId, item);
  }

  return Array.from(merged.values()).sort(sortFeedbackItems);
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

const fetchFeedbackPage = async (
  runId: string,
  cursor?: string,
): Promise<ListRunFeedbackRequestsResponse> =>
  workflowApiClient.listRunFeedbackRequests(runId, {
    status: 'awaiting_response,responded',
    limit: FEEDBACK_DEFAULT_LIMIT,
    cursor,
  });

export const useFeedbackQueries = (runId: string): UseFeedbackQueriesState => {
  const [items, setItems] = useState<RunFeedbackRequestSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingNextPage, setIsLoadingNextPage] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await fetchFeedbackPage(runId);
      setItems(mergeFeedbackItems([], response.items));
      setNextCursor(response.nextCursor ?? null);
    } catch (error) {
      setItems([]);
      setNextCursor(null);
      setErrorMessage(toErrorMessage(error, 'Failed to load feedback requests.'));
    } finally {
      setIsLoading(false);
    }
  }, [runId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const loadNextPage = useCallback(async (): Promise<void> => {
    if (isLoading || isLoadingNextPage || !nextCursor) {
      return;
    }

    setIsLoadingNextPage(true);
    setErrorMessage(null);

    try {
      const response = await fetchFeedbackPage(runId, nextCursor);
      setItems((previous) => mergeFeedbackItems(previous, response.items));
      setNextCursor(response.nextCursor ?? null);
    } catch (error) {
      setErrorMessage(toErrorMessage(error, 'Failed to load additional feedback requests.'));
    } finally {
      setIsLoadingNextPage(false);
    }
  }, [isLoading, isLoadingNextPage, nextCursor, runId]);

  const upsertItem = useCallback((item: RunFeedbackRequestSummary): void => {
    setItems((previous) => mergeFeedbackItems(previous, [item]));
  }, []);

  return useMemo(
    () => ({
      items,
      isLoading,
      isLoadingNextPage,
      errorMessage,
      nextCursor,
      refresh,
      loadNextPage,
      upsertItem,
    }),
    [
      items,
      isLoading,
      isLoadingNextPage,
      errorMessage,
      nextCursor,
      refresh,
      loadNextPage,
      upsertItem,
    ],
  );
};
