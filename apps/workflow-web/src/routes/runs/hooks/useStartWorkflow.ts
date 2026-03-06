import { useCallback, useMemo, useState } from 'react';

import type {
  StartWorkflowRequest,
  StartWorkflowResponse,
} from '../../../transport/workflowApiClient';
import { WorkflowPanelError } from '../../../transport/errors';
import { workflowApiClient } from '../../../transport/workflowApiClient';

type StartWorkflowState = {
  readonly isSubmitting: boolean;
  readonly errorMessage: string | null;
  readonly validationDetails: Record<string, unknown> | null;
  readonly status: number | null;
  readonly code: string | null;
};

type StartWorkflowOutcome =
  | { kind: 'success'; response: StartWorkflowResponse }
  | {
      kind: 'error';
      status: number | null;
      code: string | null;
      message: string;
      details: Record<string, unknown> | null;
    };

type UseStartWorkflowState = {
  readonly submit: (request: StartWorkflowRequest) => Promise<StartWorkflowOutcome>;
  readonly clearState: () => void;
  readonly state: StartWorkflowState;
};

const INITIAL_STATE: StartWorkflowState = {
  isSubmitting: false,
  errorMessage: null,
  validationDetails: null,
  status: null,
  code: null,
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

export const useStartWorkflow = (): UseStartWorkflowState => {
  const [state, setState] = useState<StartWorkflowState>(INITIAL_STATE);

  const submit = useCallback(
    async (request: StartWorkflowRequest): Promise<StartWorkflowOutcome> => {
      setState({
        isSubmitting: true,
        errorMessage: null,
        validationDetails: null,
        status: null,
        code: null,
      });

      try {
        const response = await workflowApiClient.startWorkflow(request);
        setState(INITIAL_STATE);
        return { kind: 'success', response };
      } catch (error) {
        if (error instanceof WorkflowPanelError) {
          const nextState: StartWorkflowState = {
            isSubmitting: false,
            errorMessage: error.message,
            validationDetails: error.details,
            status: error.status,
            code: error.code,
          };
          setState(nextState);
          return {
            kind: 'error',
            status: error.status,
            code: error.code,
            message: error.message,
            details: error.details,
          };
        }

        const message = toErrorMessage(error, 'Failed to start workflow.');
        setState({
          isSubmitting: false,
          errorMessage: message,
          validationDetails: null,
          status: null,
          code: null,
        });

        return {
          kind: 'error',
          status: null,
          code: null,
          message,
          details: null,
        };
      }
    },
    [],
  );

  const clearState = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  return useMemo(
    () => ({
      submit,
      clearState,
      state,
    }),
    [submit, clearState, state],
  );
};
