import { randomBytes } from 'node:crypto';

import type { Pool } from 'pg';

import { withTransaction } from '../persistence/db.js';
import {
  createEventRepository,
  type EventRepository,
  type PersistedEvent,
} from '../persistence/event-repository.js';
import {
  createIdempotencyRepository,
  type IdempotencyRepository,
} from '../persistence/idempotency-repository.js';
import {
  createRunRepository,
  type RunRepository,
  type RunSummary,
} from '../persistence/run-repository.js';
import type { WorkflowRegistry } from '../registry/workflow-registry.js';

interface RuntimeWorkflowContext<I = unknown, O = unknown> {
  runId: string;
  workflowType: string;
  input: I;
  now(): Date;
  log(event: unknown): void;
  transition<TState extends string>(to: TState, data?: unknown): void;
  launchChild<CO>(req: unknown): Promise<CO>;
  runCommand(req: unknown): Promise<unknown>;
  complete(output: O): void;
  fail(error: Error): void;
}

interface RuntimeWorkflowDefinition<I = unknown, O = unknown> {
  initialState: string;
  states: Record<
    string,
    (ctx: RuntimeWorkflowContext<I, O>, data?: unknown) => void | Promise<void>
  >;
}

const CROCKFORD_BASE32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export interface StartRunRequest {
  workflowType: string;
  input?: unknown;
  idempotencyKey?: string;
  parentRunId?: string | null;
}

export interface StartRunResponse {
  run: RunSummary;
  startedEvent: PersistedEvent | null;
  created: boolean;
}

interface StartDecisionCreate {
  decision: 'create';
  runId: string;
}

interface StartDecisionExisting {
  decision: 'existing';
  runId: string;
}

export type StartDecision = StartDecisionCreate | StartDecisionExisting;

export interface StartRunDependencies {
  pool: Pool;
  registry: WorkflowRegistry;
  runRepository?: RunRepository;
  eventRepository?: EventRepository;
  idempotencyRepository?: IdempotencyRepository;
  now?: () => Date;
  runIdFactory?: () => string;
  eventIdFactory?: () => string;
}

const encodeBase32 = (value: bigint, length: number): string => {
  let result = '';
  let remaining = value;

  for (let index = 0; index < length; index += 1) {
    const digit = Number(remaining & 31n);
    result = `${CROCKFORD_BASE32[digit]}${result}`;
    remaining >>= 5n;
  }

  return result;
};

export const generateUlid = (date: Date = new Date()): string => {
  const timestamp = BigInt(date.getTime());
  const timePart = encodeBase32(timestamp, 10);
  const entropy = randomBytes(10);
  let entropyValue = 0n;

  for (const byte of entropy.values()) {
    entropyValue = (entropyValue << 8n) | BigInt(byte);
  }

  const randomPart = encodeBase32(entropyValue, 16);
  return `${timePart}${randomPart}`;
};

export const defaultRunIdFactory = (): string => `wr_${generateUlid()}`;
export const defaultEventIdFactory = (): string => `evt_${generateUlid()}`;

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
  ) as RuntimeWorkflowDefinition<unknown, unknown>;

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

export const decideStartAction = (params: {
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

export const startRun = async (
  deps: StartRunDependencies,
  request: StartRunRequest,
): Promise<StartRunResponse> => {
  const runRepository = deps.runRepository ?? createRunRepository();
  const eventRepository = deps.eventRepository ?? createEventRepository();
  const idempotencyRepository = deps.idempotencyRepository ?? createIdempotencyRepository();
  const now = deps.now ?? (() => new Date());
  const runIdFactory = deps.runIdFactory ?? defaultRunIdFactory;
  const eventIdFactory = deps.eventIdFactory ?? defaultEventIdFactory;

  const candidateRunId = runIdFactory();
  const { initialState, workflowVersion } = getInitialState({
    registry: deps.registry,
    workflowType: request.workflowType,
    runId: candidateRunId,
    input: request.input,
  });

  return withTransaction(deps.pool, async (client) => {
    const startedAt = now().toISOString();
    let decision: StartDecision = {
      decision: 'create',
      runId: candidateRunId,
    };

    if (request.idempotencyKey) {
      const reservedRecord = await idempotencyRepository.reserveStartKey(client, {
        workflowType: request.workflowType,
        idempotencyKey: request.idempotencyKey,
        runId: candidateRunId,
        createdAt: startedAt,
      });

      const existingRecord =
        reservedRecord === null
          ? await idempotencyRepository.getByKey(
              client,
              request.workflowType,
              request.idempotencyKey,
            )
          : null;

      decision = decideStartAction({
        reservedRecordRunId: reservedRecord?.runId ?? null,
        existingRecordRunId: existingRecord?.runId ?? null,
        candidateRunId,
      });
    }

    if (decision.decision === 'existing') {
      const existingRun = await runRepository.getRunSummary(client, decision.runId);
      if (!existingRun) {
        throw new Error(`Idempotency points to unknown run ${decision.runId}`);
      }

      return {
        run: existingRun,
        startedEvent: null,
        created: false,
      };
    }

    const runSummary = await runRepository.upsertRunSummary(client, {
      runId: decision.runId,
      workflowType: request.workflowType,
      workflowVersion,
      lifecycle: 'running',
      currentState: initialState,
      parentRunId: request.parentRunId ?? null,
      startedAt,
      endedAt: null,
    });

    const startedEvent = await eventRepository.appendEvent(client, {
      eventId: eventIdFactory(),
      runId: runSummary.runId,
      eventType: 'workflow.started',
      timestamp: now().toISOString(),
      payload: {
        workflowType: request.workflowType,
        workflowVersion,
      },
    });

    return {
      run: runSummary,
      startedEvent,
      created: true,
    };
  });
};
