import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  errorEnvelopeSchema,
  listRunFeedbackRequestsResponseSchema,
  runSummaryResponseSchema,
  runTreeResponseSchema,
  type CancelRunResponse,
  type ListRunFeedbackRequestsResponse,
  type RunEventsResponse,
  type RunLogsResponse,
  type RunSummaryResponse,
  type RunTreeResponse,
} from '@composable-workflow/workflow-api-types';

import { workflowApiClient } from '../../transport/workflowApiClient';
import {
  toEventsTransportQuery,
  toLogsTransportQuery,
  useRunDetailFilterStore,
} from './state/filterStore';

type DashboardPanelKey = 'summary' | 'tree' | 'events' | 'logs' | 'feedback';

type DashboardPanelState<TData> = {
  data: TData | null;
  isLoading: boolean;
  errorMessage: string | null;
};

type DashboardPanelsState = {
  summary: DashboardPanelState<RunSummaryResponse>;
  tree: DashboardPanelState<RunTreeResponse>;
  events: DashboardPanelState<RunEventsResponse>;
  logs: DashboardPanelState<RunLogsResponse>;
  feedback: DashboardPanelState<ListRunFeedbackRequestsResponse>;
};

type RunDashboardState = {
  runId: string;
  panels: DashboardPanelsState;
  isRefreshing: boolean;
  isNotFound: boolean;
  streamOpenTriggered: boolean;
  retryPanel: (panel: DashboardPanelKey) => Promise<void>;
  refreshAll: () => Promise<void>;
  cancelRun: () => Promise<CancelRunResponse | null>;
  isCancelling: boolean;
  cancelError: string | null;
  lastUpdatedAt: string | null;
};

const ACTIVE_CANCELABLE_LIFECYCLES = new Set([
  'running',
  'pausing',
  'paused',
  'resuming',
  'recovering',
]);

const createPanelState = <TData>(): DashboardPanelState<TData> => ({
  data: null,
  isLoading: true,
  errorMessage: null,
});

const createInitialPanelsState = (): DashboardPanelsState => ({
  summary: createPanelState<RunSummaryResponse>(),
  tree: createPanelState<RunTreeResponse>(),
  events: createPanelState<RunEventsResponse>(),
  logs: createPanelState<RunLogsResponse>(),
  feedback: createPanelState<ListRunFeedbackRequestsResponse>(),
});

const setLoadingPanel = <TData>(panel: DashboardPanelState<TData>): DashboardPanelState<TData> => ({
  ...panel,
  isLoading: true,
  errorMessage: null,
});

const toErrorMessage = async (response: Response, fallback: string): Promise<string> => {
  try {
    const payload = (await response.json()) as unknown;
    const parsed = errorEnvelopeSchema.safeParse(payload);

    if (parsed.success) {
      return `${parsed.data.code}: ${parsed.data.message} (${parsed.data.requestId})`;
    }
  } catch {
    return fallback;
  }

  return fallback;
};

const getJson = async <TData>(
  endpoint: string,
  schema: { parse: (value: unknown) => TData },
  options?: RequestInit,
): Promise<TData> => {
  const response = await fetch(endpoint, options);

  if (!response.ok) {
    const message = await toErrorMessage(response, `Request failed (${response.status})`);
    const error = new Error(message) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }

  const payload = (await response.json()) as unknown;
  return schema.parse(payload);
};

const getSummary = (runId: string): Promise<RunSummaryResponse> =>
  getJson(`/api/v1/workflows/runs/${runId}`, runSummaryResponseSchema);

const getTree = (runId: string): Promise<RunTreeResponse> =>
  getJson(`/api/v1/workflows/runs/${runId}/tree`, runTreeResponseSchema);

const getEvents = async (runId: string): Promise<RunEventsResponse> => {
  const filters = useRunDetailFilterStore.getState().events;
  return workflowApiClient.getRunEvents(runId, toEventsTransportQuery(filters));
};

const getLogs = async (runId: string): Promise<RunLogsResponse> => {
  const filters = useRunDetailFilterStore.getState().logs;
  return workflowApiClient.getRunLogs(runId, toLogsTransportQuery(filters));
};

const getFeedback = (runId: string): Promise<ListRunFeedbackRequestsResponse> =>
  getJson(
    `/api/v1/workflows/runs/${runId}/feedback-requests?status=awaiting_response,responded&limit=50`,
    listRunFeedbackRequestsResponseSchema,
  );

const postCancelRun = (runId: string): Promise<CancelRunResponse> =>
  workflowApiClient.cancelRun(runId);

const getErrorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message.length > 0 ? error.message : fallback;

export const useRunDashboardQueries = (runId: string): RunDashboardState => {
  const [panels, setPanels] = useState<DashboardPanelsState>(() => createInitialPanelsState());
  const [isRefreshing, setIsRefreshing] = useState(true);
  const [isNotFound, setIsNotFound] = useState(false);
  const [streamOpenTriggered, setStreamOpenTriggered] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);

  const runInitialSnapshot = useCallback(async (): Promise<void> => {
    setIsRefreshing(true);
    setIsNotFound(false);
    setStreamOpenTriggered(false);
    setCancelError(null);
    setPanels(createInitialPanelsState());

    let summary: RunSummaryResponse | null = null;

    try {
      summary = await getSummary(runId);
      setPanels((previous) => ({
        ...previous,
        summary: { data: summary, isLoading: false, errorMessage: null },
      }));
    } catch (error) {
      const status = (error as Error & { status?: number }).status;
      const message = getErrorMessage(error, 'Failed to load run summary.');

      setPanels((previous) => ({
        ...previous,
        summary: { data: null, isLoading: false, errorMessage: message },
      }));

      if (status === 404) {
        setIsNotFound(true);
        setPanels((previous) => ({
          ...previous,
          tree: { data: null, isLoading: false, errorMessage: null },
          events: { data: null, isLoading: false, errorMessage: null },
          logs: { data: null, isLoading: false, errorMessage: null },
          feedback: { data: null, isLoading: false, errorMessage: null },
        }));
        setIsRefreshing(false);
        return;
      }
    }

    try {
      const tree = await getTree(runId);
      setPanels((previous) => ({
        ...previous,
        tree: { data: tree, isLoading: false, errorMessage: null },
      }));
    } catch (error) {
      setPanels((previous) => ({
        ...previous,
        tree: {
          data: null,
          isLoading: false,
          errorMessage: getErrorMessage(error, 'Failed to load execution tree.'),
        },
      }));
    }

    try {
      const events = await getEvents(runId);
      setPanels((previous) => ({
        ...previous,
        events: { data: events, isLoading: false, errorMessage: null },
      }));
    } catch (error) {
      setPanels((previous) => ({
        ...previous,
        events: {
          data: null,
          isLoading: false,
          errorMessage: getErrorMessage(error, 'Failed to load event timeline.'),
        },
      }));
    }

    try {
      const logs = await getLogs(runId);
      setPanels((previous) => ({
        ...previous,
        logs: { data: logs, isLoading: false, errorMessage: null },
      }));
    } catch (error) {
      setPanels((previous) => ({
        ...previous,
        logs: {
          data: null,
          isLoading: false,
          errorMessage: getErrorMessage(error, 'Failed to load run logs.'),
        },
      }));
    }

    try {
      const feedback = await getFeedback(runId);
      setPanels((previous) => ({
        ...previous,
        feedback: { data: feedback, isLoading: false, errorMessage: null },
      }));
    } catch (error) {
      setPanels((previous) => ({
        ...previous,
        feedback: {
          data: null,
          isLoading: false,
          errorMessage: getErrorMessage(error, 'Failed to load feedback requests.'),
        },
      }));
    }

    setStreamOpenTriggered(true);
    setLastUpdatedAt(new Date().toISOString());
    setIsRefreshing(false);
  }, [runId]);

  useEffect(() => {
    void runInitialSnapshot();
  }, [runInitialSnapshot]);

  const retryPanel = useCallback(
    async (panel: DashboardPanelKey): Promise<void> => {
      if (panel === 'summary') {
        setPanels((previous) => ({
          ...previous,
          summary: setLoadingPanel(previous.summary),
        }));

        try {
          const summary = await getSummary(runId);
          setPanels((previous) => ({
            ...previous,
            summary: { data: summary, isLoading: false, errorMessage: null },
          }));

          setIsNotFound(false);
          setLastUpdatedAt(new Date().toISOString());
          return;
        } catch (error) {
          const status = (error as Error & { status?: number }).status;
          setPanels((previous) => ({
            ...previous,
            summary: {
              data: null,
              isLoading: false,
              errorMessage: getErrorMessage(error, 'Failed to load run summary.'),
            },
          }));

          if (status === 404) {
            setIsNotFound(true);
          }

          return;
        }
      }

      if (panel === 'tree') {
        setPanels((previous) => ({ ...previous, tree: setLoadingPanel(previous.tree) }));

        try {
          const tree = await getTree(runId);
          setPanels((previous) => ({
            ...previous,
            tree: { data: tree, isLoading: false, errorMessage: null },
          }));
        } catch (error) {
          setPanels((previous) => ({
            ...previous,
            tree: {
              data: null,
              isLoading: false,
              errorMessage: getErrorMessage(error, 'Failed to load execution tree.'),
            },
          }));
        }

        return;
      }

      if (panel === 'events') {
        setPanels((previous) => ({ ...previous, events: setLoadingPanel(previous.events) }));

        try {
          const events = await getEvents(runId);
          setPanels((previous) => ({
            ...previous,
            events: { data: events, isLoading: false, errorMessage: null },
          }));
        } catch (error) {
          setPanels((previous) => ({
            ...previous,
            events: {
              data: null,
              isLoading: false,
              errorMessage: getErrorMessage(error, 'Failed to load event timeline.'),
            },
          }));
        }

        return;
      }

      if (panel === 'logs') {
        setPanels((previous) => ({ ...previous, logs: setLoadingPanel(previous.logs) }));

        try {
          const logs = await getLogs(runId);
          setPanels((previous) => ({
            ...previous,
            logs: { data: logs, isLoading: false, errorMessage: null },
          }));
        } catch (error) {
          setPanels((previous) => ({
            ...previous,
            logs: {
              data: null,
              isLoading: false,
              errorMessage: getErrorMessage(error, 'Failed to load run logs.'),
            },
          }));
        }

        return;
      }

      setPanels((previous) => ({ ...previous, feedback: setLoadingPanel(previous.feedback) }));

      try {
        const feedback = await getFeedback(runId);
        setPanels((previous) => ({
          ...previous,
          feedback: { data: feedback, isLoading: false, errorMessage: null },
        }));
      } catch (error) {
        setPanels((previous) => ({
          ...previous,
          feedback: {
            data: null,
            isLoading: false,
            errorMessage: getErrorMessage(error, 'Failed to load feedback requests.'),
          },
        }));
      }
    },
    [runId],
  );

  const refreshAll = useCallback(async (): Promise<void> => {
    await runInitialSnapshot();
  }, [runInitialSnapshot]);

  const cancelRun = useCallback(async (): Promise<CancelRunResponse | null> => {
    const lifecycle = panels.summary.data?.lifecycle;

    if (!lifecycle || !ACTIVE_CANCELABLE_LIFECYCLES.has(lifecycle)) {
      return null;
    }

    setIsCancelling(true);
    setCancelError(null);

    try {
      const response = await postCancelRun(runId);
      setPanels((previous) => {
        const summary = previous.summary.data;

        if (!summary) {
          return previous;
        }

        return {
          ...previous,
          summary: {
            ...previous.summary,
            data: {
              ...summary,
              lifecycle: response.lifecycle,
            },
          },
        };
      });

      setLastUpdatedAt(new Date().toISOString());
      return response;
    } catch (error) {
      setCancelError(getErrorMessage(error, 'Failed to cancel run.'));
      return null;
    } finally {
      setIsCancelling(false);
    }
  }, [panels.summary.data?.lifecycle, runId]);

  return useMemo(
    () => ({
      runId,
      panels,
      isRefreshing,
      isNotFound,
      streamOpenTriggered,
      retryPanel,
      refreshAll,
      cancelRun,
      isCancelling,
      cancelError,
      lastUpdatedAt,
    }),
    [
      cancelError,
      cancelRun,
      isCancelling,
      isNotFound,
      isRefreshing,
      lastUpdatedAt,
      panels,
      refreshAll,
      retryPanel,
      runId,
      streamOpenTriggered,
    ],
  );
};

export type { DashboardPanelKey, DashboardPanelState, RunDashboardState };
