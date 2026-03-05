import { useMemo, useState } from 'react';

import type { WorkflowLifecycle } from '@composable-workflow/workflow-api-types';

const ACTIVE_LIFECYCLES: WorkflowLifecycle[] = [
  'running',
  'pausing',
  'paused',
  'resuming',
  'recovering',
  'cancelling',
];

export type RunsFilters = {
  lifecycle: WorkflowLifecycle[];
  workflowType: string;
};

export type RunsFilterState = {
  filters: RunsFilters;
  setLifecycle: (lifecycle: WorkflowLifecycle[]) => void;
  setWorkflowType: (workflowType: string) => void;
  queryString: string;
};

export const useRunsFilters = (): RunsFilterState => {
  const [lifecycle, setLifecycle] = useState<WorkflowLifecycle[]>(ACTIVE_LIFECYCLES);
  const [workflowType, setWorkflowType] = useState('');

  const queryString = useMemo(() => {
    const query = new URLSearchParams();

    if (lifecycle.length > 0) {
      query.set('lifecycle', lifecycle.join(','));
    }

    const normalizedWorkflowType = workflowType.trim();

    if (normalizedWorkflowType.length > 0) {
      query.set('workflowType', normalizedWorkflowType);
    }

    return query.toString();
  }, [lifecycle, workflowType]);

  return {
    filters: {
      lifecycle,
      workflowType,
    },
    setLifecycle,
    setWorkflowType,
    queryString,
  };
};
