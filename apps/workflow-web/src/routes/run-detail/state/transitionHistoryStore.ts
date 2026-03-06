import { create } from 'zustand';

import type { RunEventsResponse } from '@composable-workflow/workflow-api-types';

import { EVENTS_MAX_LIMIT, workflowApiClient } from '../../../transport/workflowApiClient';
import type { TransitionHistorySelectionTarget } from '../history/buildTransitionHistory';

export type TransitionHistorySelection = {
  requestId: number;
  source: 'history' | 'timeline' | 'graph';
  runId: string;
  eventId: string | null;
  sequence: number | null;
  timestamp: string | null;
  target: TransitionHistorySelectionTarget;
};

export type ChildHistoryState = {
  status: 'idle' | 'loading' | 'loaded' | 'error';
  response: RunEventsResponse | null;
  errorMessage: string | null;
};

export type TransitionHistoryStoreState = {
  expandedSections: Record<string, boolean>;
  childHistories: Record<string, ChildHistoryState>;
  selection: TransitionHistorySelection | null;
  setSectionExpanded: (sectionKey: string, expanded: boolean) => void;
  toggleSectionExpanded: (sectionKey: string) => void;
  ensureChildHistoryLoaded: (runId: string) => Promise<void>;
  selectEntry: (params: {
    source: TransitionHistorySelection['source'];
    runId: string;
    eventId?: string | null;
    sequence?: number | null;
    timestamp?: string | null;
    target: TransitionHistorySelectionTarget;
  }) => void;
  clearSelection: () => void;
  reset: () => void;
};

export type TransitionHistoryStoreDependencies = {
  getRunEvents: (runId: string) => Promise<RunEventsResponse>;
};

const defaultChildHistoryState = (): ChildHistoryState => ({
  status: 'idle',
  response: null,
  errorMessage: null,
});

const defaultDependencies: TransitionHistoryStoreDependencies = {
  getRunEvents: (runId) => workflowApiClient.getRunEvents(runId, { limit: EVENTS_MAX_LIMIT }),
};

export const createTransitionHistoryStore = (
  dependencies: TransitionHistoryStoreDependencies = defaultDependencies,
) =>
  create<TransitionHistoryStoreState>((set, get) => ({
    expandedSections: {},
    childHistories: {},
    selection: null,
    setSectionExpanded: (sectionKey, expanded) =>
      set((state) => ({
        expandedSections: {
          ...state.expandedSections,
          [sectionKey]: expanded,
        },
      })),
    toggleSectionExpanded: (sectionKey) =>
      set((state) => ({
        expandedSections: {
          ...state.expandedSections,
          [sectionKey]: !state.expandedSections[sectionKey],
        },
      })),
    ensureChildHistoryLoaded: async (runId) => {
      const existing = get().childHistories[runId];
      if (existing && (existing.status === 'loading' || existing.status === 'loaded')) {
        return;
      }

      set((state) => ({
        childHistories: {
          ...state.childHistories,
          [runId]: {
            status: 'loading',
            response: state.childHistories[runId]?.response ?? null,
            errorMessage: null,
          },
        },
      }));

      try {
        const response = await dependencies.getRunEvents(runId);
        set((state) => ({
          childHistories: {
            ...state.childHistories,
            [runId]: {
              status: 'loaded',
              response,
              errorMessage: null,
            },
          },
        }));
      } catch (error) {
        set((state) => ({
          childHistories: {
            ...state.childHistories,
            [runId]: {
              status: 'error',
              response: state.childHistories[runId]?.response ?? null,
              errorMessage:
                error instanceof Error && error.message.length > 0
                  ? error.message
                  : 'Failed to load child transition history.',
            },
          },
        }));
      }
    },
    selectEntry: ({ source, runId, eventId = null, sequence = null, timestamp = null, target }) =>
      set((state) => ({
        selection: {
          requestId: (state.selection?.requestId ?? 0) + 1,
          source,
          runId,
          eventId,
          sequence,
          timestamp,
          target,
        },
      })),
    clearSelection: () => set({ selection: null }),
    reset: () =>
      set({
        expandedSections: {},
        childHistories: {},
        selection: null,
      }),
  }));

export const useTransitionHistoryStore = createTransitionHistoryStore();

export const getChildHistoryState = (
  childHistories: Record<string, ChildHistoryState>,
  runId: string,
): ChildHistoryState => childHistories[runId] ?? defaultChildHistoryState();
