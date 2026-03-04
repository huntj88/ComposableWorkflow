import type { DbClient } from '../../persistence/db.js';
import type { EventRepository, PersistedEvent } from '../../persistence/event-repository.js';
import type { HumanFeedbackProjectionRepository } from '../../persistence/human-feedback-projection-repository.js';
import type { IdempotencyRepository } from '../../persistence/idempotency-repository.js';
import type { RunRepository, RunSummary } from '../../persistence/run-repository.js';
import type { WorkflowRegistry } from '../../registry/workflow-registry.js';
import type { WorkflowLifecycle } from '../../lifecycle/lifecycle-machine.js';
import { defaultRunIdFactory } from '../start-run.js';
import {
  parseHumanFeedbackRequestInput,
  SERVER_HUMAN_FEEDBACK_WORKFLOW_TYPE,
} from '../../internal-workflows/human-feedback/contracts.js';
import {
  toChildLifecyclePayload,
  type ChildLaunchRequest,
  type ChildLifecyclePayload,
} from './child-lineage.js';
import type { RuntimeWorkflowContext } from '../../registry/runtime-types.js';

interface StartDecisionCreate {
  decision: 'create';
  runId: string;
}

interface StartDecisionExisting {
  decision: 'existing';
  runId: string;
}

type StartDecision = StartDecisionCreate | StartDecisionExisting;

const createFactoryContext = <I, O>(
  workflowType: string,
  runId: string,
  input: I,
): RuntimeWorkflowContext<I, O> => ({
  runId,
  workflowType,
  input,
  now: () => new Date(),
  log: () => {
    throw new Error('log is not available during start definition inspection');
  },
  transition: () => {
    throw new Error('transition is not available during start definition inspection');
  },
  launchChild: async () => {
    throw new Error('launchChild is not available during start definition inspection');
  },
  runCommand: async () => {
    throw new Error('runCommand is not available during start definition inspection');
  },
  complete: () => {
    throw new Error('complete is not available during start definition inspection');
  },
  fail: () => {
    throw new Error('fail is not available during start definition inspection');
  },
});

const getInitialState = (params: {
  registry: WorkflowRegistry;
  workflowType: string;
  runId: string;
  input: unknown;
}): { workflowVersion: string; initialState: string } => {
  const registration = params.registry.getByType(params.workflowType);

  if (!registration) {
    throw new Error(`Unknown workflow type ${params.workflowType}`);
  }

  const definition = registration.factory(
    createFactoryContext(params.workflowType, params.runId, params.input),
  );

  if (!definition.initialState || !definition.states[definition.initialState]) {
    throw new Error(
      `Workflow ${params.workflowType} does not provide a valid initial state ${definition.initialState}`,
    );
  }

  return {
    workflowVersion: registration.workflowVersion,
    initialState: definition.initialState,
  };
};

const decideStartAction = (params: {
  reservedRecordRunId: string | null;
  existingRecordRunId: string | null;
  candidateRunId: string;
}): StartDecision => {
  if (params.reservedRecordRunId) {
    return {
      decision: 'create',
      runId: params.reservedRecordRunId,
    };
  }

  if (params.existingRecordRunId) {
    return {
      decision: 'existing',
      runId: params.existingRecordRunId,
    };
  }

  return {
    decision: 'create',
    runId: params.candidateRunId,
  };
};

export interface LaunchChildDependencies {
  registry: WorkflowRegistry;
  runRepository: RunRepository;
  eventRepository: EventRepository;
  humanFeedbackProjectionRepository?: HumanFeedbackProjectionRepository;
  idempotencyRepository: IdempotencyRepository;
  now: () => Date;
  eventIdFactory: () => string;
  runIdFactory?: () => string;
}

export interface LaunchChildResult {
  childRun: RunSummary;
  childLifecyclePayload: ChildLifecyclePayload;
  startedParentEvent: PersistedEvent | null;
}

export const launchChild = async (params: {
  client: DbClient;
  deps: LaunchChildDependencies;
  parentRun: RunSummary;
  request: ChildLaunchRequest;
}): Promise<LaunchChildResult> => {
  const runIdFactory = params.deps.runIdFactory ?? defaultRunIdFactory;
  const candidateRunId = runIdFactory();
  const { initialState, workflowVersion } = getInitialState({
    registry: params.deps.registry,
    workflowType: params.request.workflowType,
    runId: candidateRunId,
    input: params.request.input,
  });

  let decision: StartDecision = {
    decision: 'create',
    runId: candidateRunId,
  };

  if (params.request.idempotencyKey) {
    const reservedRecord = await params.deps.idempotencyRepository.reserveStartKey(params.client, {
      workflowType: params.request.workflowType,
      idempotencyKey: params.request.idempotencyKey,
      runId: candidateRunId,
      createdAt: params.deps.now().toISOString(),
    });

    const existingRecord =
      reservedRecord === null
        ? await params.deps.idempotencyRepository.getByKey(
            params.client,
            params.request.workflowType,
            params.request.idempotencyKey,
          )
        : null;

    decision = decideStartAction({
      reservedRecordRunId: reservedRecord?.runId ?? null,
      existingRecordRunId: existingRecord?.runId ?? null,
      candidateRunId,
    });
  }

  let childRun: RunSummary;

  if (decision.decision === 'existing') {
    const existingRun = await params.deps.runRepository.getRunSummary(
      params.client,
      decision.runId,
    );
    if (!existingRun) {
      throw new Error(`Idempotency points to unknown child run ${decision.runId}`);
    }
    childRun = existingRun;
  } else {
    const childStartedAt = params.deps.now().toISOString();
    childRun = await params.deps.runRepository.upsertRunSummary(params.client, {
      runId: decision.runId,
      workflowType: params.request.workflowType,
      workflowVersion,
      lifecycle: 'running',
      currentState: initialState,
      parentRunId: params.parentRun.runId,
      startedAt: childStartedAt,
      endedAt: null,
    });

    await params.deps.eventRepository.appendEvent(params.client, {
      eventId: params.deps.eventIdFactory(),
      runId: childRun.runId,
      eventType: 'workflow.started',
      timestamp: childStartedAt,
      payload: {
        workflowType: params.request.workflowType,
        workflowVersion,
        ...(params.request.input !== undefined ? { input: params.request.input } : {}),
      },
    });

    if (params.request.workflowType === SERVER_HUMAN_FEEDBACK_WORKFLOW_TYPE) {
      const requestInput = parseHumanFeedbackRequestInput(params.request.input);
      const requestedAt = params.deps.now().toISOString();
      const requestedEvent = await params.deps.eventRepository.appendEvent(params.client, {
        eventId: params.deps.eventIdFactory(),
        runId: childRun.runId,
        eventType: 'human-feedback.requested',
        timestamp: requestedAt,
        payload: {
          feedbackRunId: childRun.runId,
          parentRunId: params.parentRun.runId,
          parentWorkflowType: params.parentRun.workflowType,
          parentState: params.parentRun.currentState,
          questionId: requestInput.questionId,
          prompt: requestInput.prompt,
          options: requestInput.options,
          constraints: requestInput.constraints ?? null,
          correlationId: requestInput.correlationId ?? params.request.correlationId ?? null,
          requestedByRunId: requestInput.requestedByRunId,
          requestedByWorkflowType: requestInput.requestedByWorkflowType,
          requestedByState: requestInput.requestedByState ?? null,
        },
      });

      await params.deps.humanFeedbackProjectionRepository?.recordRequested(params.client, {
        feedbackRunId: childRun.runId,
        parentRunId: params.parentRun.runId,
        parentWorkflowType: params.parentRun.workflowType,
        parentState: params.parentRun.currentState,
        questionId: requestInput.questionId,
        requestEventId: requestedEvent.eventId,
        prompt: requestInput.prompt,
        options: requestInput.options,
        constraints: requestInput.constraints,
        correlationId: requestInput.correlationId ?? params.request.correlationId,
        requestedAt,
      });
    }
  }

  // Only emit child.started event and lineage entry for newly created children.
  // For idempotent re-entry (decision === 'existing') these already exist.
  let startedParentEvent: PersistedEvent | undefined;

  if (decision.decision === 'create') {
    startedParentEvent = await params.deps.eventRepository.appendEvent(params.client, {
      eventId: params.deps.eventIdFactory(),
      runId: params.parentRun.runId,
      eventType: 'child.started',
      timestamp: params.deps.now().toISOString(),
      payload: {
        ...toChildLifecyclePayload(
          childRun.runId,
          childRun.workflowType,
          childRun.lifecycle as WorkflowLifecycle,
        ),
      },
    });

    await params.client.query(
      `
INSERT INTO workflow_run_children (
  parent_run_id,
  child_run_id,
  parent_workflow_type,
  child_workflow_type,
  parent_state,
  created_at,
  linked_by_event_id
)
VALUES ($1, $2, $3, $4, $5, $6, $7)
ON CONFLICT (parent_run_id, child_run_id)
DO NOTHING
`,
      [
        params.parentRun.runId,
        childRun.runId,
        params.parentRun.workflowType,
        childRun.workflowType,
        params.parentRun.currentState,
        params.deps.now().toISOString(),
        startedParentEvent.eventId,
      ],
    );
  }

  return {
    childRun,
    childLifecyclePayload: toChildLifecyclePayload(
      childRun.runId,
      childRun.workflowType,
      childRun.lifecycle as WorkflowLifecycle,
    ),
    startedParentEvent: startedParentEvent ?? null,
  };
};
