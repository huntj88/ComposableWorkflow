import type { DbClient } from '../persistence/db.js';
import type { EventRepository } from '../persistence/event-repository.js';
import { shouldBlockChildLaunch, type WorkflowLifecycle } from '../lifecycle/lifecycle-machine.js';
import type { RunRepository, RunSummary } from '../persistence/run-repository.js';
import type { WorkflowRegistration, WorkflowRegistry } from '../registry/workflow-registry.js';

interface WorkflowTransitionDescriptor {
  from: string;
  to: string;
  name?: string;
}

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
  transitions?: readonly WorkflowTransitionDescriptor[];
}

interface WorkflowFailure {
  name: string;
  message: string;
  stack?: string;
}

const assertTransitionAllowed = (
  from: string,
  to: string,
  transitions?: readonly WorkflowTransitionDescriptor[],
): void => {
  if (!transitions || transitions.length === 0) {
    return;
  }

  const isAllowed = transitions.some(
    (transition) => transition.from === from && transition.to === to,
  );
  if (isAllowed) {
    return;
  }

  throw new Error(`Invalid transition from "${from}" to "${to}"`);
};

interface TransitionIntent {
  to: string;
  data?: unknown;
}

interface CompletionIntent {
  output?: unknown;
}

interface FailureIntent {
  error: unknown;
}

export interface TransitionRunnerDependencies {
  registry: WorkflowRegistry;
  runRepository: RunRepository;
  eventRepository: EventRepository;
  now?: () => Date;
  eventIdFactory: () => string;
}

export interface TransitionStepResult {
  run: RunSummary;
  progressed: boolean;
  terminal: boolean;
}

const toFailure = (error: unknown): WorkflowFailure => {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    name: 'Error',
    message: typeof error === 'string' ? error : 'Unknown workflow error',
  };
};

const isTerminalLifecycle = (lifecycle: string): boolean =>
  lifecycle === 'completed' || lifecycle === 'failed' || lifecycle === 'cancelled';

const applyLifecycleSafePoint = async (params: {
  client: DbClient;
  run: RunSummary;
  runRepository: RunRepository;
  eventRepository: EventRepository;
  now: () => Date;
  eventIdFactory: () => string;
}): Promise<TransitionStepResult | null> => {
  if (params.run.lifecycle === 'pausing') {
    await params.eventRepository.appendEvent(params.client, {
      eventId: params.eventIdFactory(),
      runId: params.run.runId,
      eventType: 'workflow.paused',
      timestamp: params.now().toISOString(),
    });

    const pausedRun = await params.runRepository.upsertRunSummary(params.client, {
      ...params.run,
      lifecycle: 'paused',
    });

    return {
      run: pausedRun,
      progressed: true,
      terminal: false,
    };
  }

  if (params.run.lifecycle === 'resuming') {
    await params.eventRepository.appendEvent(params.client, {
      eventId: params.eventIdFactory(),
      runId: params.run.runId,
      eventType: 'workflow.resumed',
      timestamp: params.now().toISOString(),
    });

    const resumedRun = await params.runRepository.upsertRunSummary(params.client, {
      ...params.run,
      lifecycle: 'running',
    });

    return {
      run: resumedRun,
      progressed: true,
      terminal: false,
    };
  }

  if (params.run.lifecycle === 'recovering') {
    await params.eventRepository.appendEvent(params.client, {
      eventId: params.eventIdFactory(),
      runId: params.run.runId,
      eventType: 'workflow.recovered',
      timestamp: params.now().toISOString(),
    });

    const recoveredRun = await params.runRepository.upsertRunSummary(params.client, {
      ...params.run,
      lifecycle: 'running',
    });

    return {
      run: recoveredRun,
      progressed: true,
      terminal: false,
    };
  }

  if (params.run.lifecycle === 'paused') {
    return {
      run: params.run,
      progressed: false,
      terminal: false,
    };
  }

  return null;
};

const resolveTransitionName = (
  descriptors: readonly WorkflowTransitionDescriptor[] | undefined,
  from: string,
  to: string,
): string | undefined => descriptors?.find((item) => item.from === from && item.to === to)?.name;

const createExecutionContext = (
  run: RunSummary,
  input: unknown,
): {
  context: RuntimeWorkflowContext<unknown, unknown>;
  readTransitionIntent: () => TransitionIntent | undefined;
  readCompletionIntent: () => CompletionIntent | undefined;
  readFailureIntent: () => FailureIntent | undefined;
} => {
  let transitionIntent: TransitionIntent | undefined;
  let completionIntent: CompletionIntent | undefined;
  let failureIntent: FailureIntent | undefined;

  const ensureNoResolutionConflict = (kind: string): void => {
    const resolvedCount = [transitionIntent, completionIntent, failureIntent].filter(
      (value) => value !== undefined,
    ).length;

    if (resolvedCount > 0) {
      throw new Error(`Workflow state has already resolved; cannot apply ${kind}`);
    }
  };

  const context: RuntimeWorkflowContext<unknown, unknown> = {
    runId: run.runId,
    workflowType: run.workflowType,
    input,
    now: () => new Date(),
    log: () => {
      return;
    },
    transition: (to, data) => {
      ensureNoResolutionConflict('transition');
      transitionIntent = {
        to,
        data,
      };
    },
    launchChild: async () => {
      if (shouldBlockChildLaunch(run.lifecycle as WorkflowLifecycle)) {
        throw new Error(`Child launch blocked in lifecycle ${run.lifecycle}`);
      }
      throw new Error('launchChild is not implemented in the orchestrator MVP');
    },
    runCommand: async (): Promise<unknown> => {
      throw new Error('runCommand is not implemented in the orchestrator MVP');
    },
    complete: (output) => {
      ensureNoResolutionConflict('complete');
      completionIntent = {
        output,
      };
    },
    fail: (error) => {
      ensureNoResolutionConflict('fail');
      failureIntent = {
        error,
      };
    },
  };

  return {
    context,
    readTransitionIntent: () => transitionIntent,
    readCompletionIntent: () => completionIntent,
    readFailureIntent: () => failureIntent,
  };
};

const failRun = async (params: {
  client: DbClient;
  run: RunSummary;
  fromState: string;
  toState?: string;
  error: unknown;
  runRepository: RunRepository;
  eventRepository: EventRepository;
  now: () => Date;
  eventIdFactory: () => string;
}): Promise<RunSummary> => {
  const failure = toFailure(params.error);

  await params.eventRepository.appendEvent(params.client, {
    eventId: params.eventIdFactory(),
    runId: params.run.runId,
    eventType: 'transition.failed',
    timestamp: params.now().toISOString(),
    payload: {
      from: params.fromState,
      to: params.toState,
    },
    error: failure as unknown as Record<string, unknown>,
  });

  await params.eventRepository.appendEvent(params.client, {
    eventId: params.eventIdFactory(),
    runId: params.run.runId,
    eventType: 'workflow.failed',
    timestamp: params.now().toISOString(),
    error: failure as unknown as Record<string, unknown>,
  });

  return params.runRepository.upsertRunSummary(params.client, {
    ...params.run,
    lifecycle: 'failed',
    endedAt: params.now().toISOString(),
  });
};

const getRegistration = (
  registry: WorkflowRegistry,
  workflowType: string,
): WorkflowRegistration => {
  const registration = registry.getByType(workflowType);
  if (!registration) {
    throw new Error(`Unknown workflow type ${workflowType}`);
  }

  return registration;
};

export const runTransitionStep = async (params: {
  client: DbClient;
  deps: TransitionRunnerDependencies;
  run: RunSummary;
  input?: unknown;
}): Promise<TransitionStepResult> => {
  const now = params.deps.now ?? (() => new Date());

  const safePointResult = await applyLifecycleSafePoint({
    client: params.client,
    run: params.run,
    runRepository: params.deps.runRepository,
    eventRepository: params.deps.eventRepository,
    now,
    eventIdFactory: params.deps.eventIdFactory,
  });
  if (safePointResult) {
    return safePointResult;
  }

  if (params.run.lifecycle === 'cancelling') {
    await params.deps.eventRepository.appendEvent(params.client, {
      eventId: params.deps.eventIdFactory(),
      runId: params.run.runId,
      eventType: 'workflow.cancelled',
      timestamp: now().toISOString(),
    });

    const cancelledRun = await params.deps.runRepository.upsertRunSummary(params.client, {
      ...params.run,
      lifecycle: 'cancelled',
      endedAt: now().toISOString(),
    });

    return {
      run: cancelledRun,
      progressed: true,
      terminal: true,
    };
  }

  if (isTerminalLifecycle(params.run.lifecycle)) {
    return {
      run: params.run,
      progressed: false,
      terminal: true,
    };
  }

  const registration = getRegistration(params.deps.registry, params.run.workflowType);
  const { context, readCompletionIntent, readFailureIntent, readTransitionIntent } =
    createExecutionContext(params.run, params.input);

  const definition = registration.factory(context) as RuntimeWorkflowDefinition<unknown, unknown>;
  const handler = definition.states[params.run.currentState];

  if (!handler) {
    const failedRun = await failRun({
      client: params.client,
      run: params.run,
      fromState: params.run.currentState,
      error: new Error(`Missing state handler for ${params.run.currentState}`),
      runRepository: params.deps.runRepository,
      eventRepository: params.deps.eventRepository,
      now,
      eventIdFactory: params.deps.eventIdFactory,
    });

    return {
      run: failedRun,
      progressed: true,
      terminal: true,
    };
  }

  try {
    await handler(context, undefined);
  } catch (error) {
    const failedRun = await failRun({
      client: params.client,
      run: params.run,
      fromState: params.run.currentState,
      error,
      runRepository: params.deps.runRepository,
      eventRepository: params.deps.eventRepository,
      now,
      eventIdFactory: params.deps.eventIdFactory,
    });

    return {
      run: failedRun,
      progressed: true,
      terminal: true,
    };
  }

  const failureIntent = readFailureIntent();
  if (failureIntent) {
    const failedRun = await failRun({
      client: params.client,
      run: params.run,
      fromState: params.run.currentState,
      error: failureIntent.error,
      runRepository: params.deps.runRepository,
      eventRepository: params.deps.eventRepository,
      now,
      eventIdFactory: params.deps.eventIdFactory,
    });

    return {
      run: failedRun,
      progressed: true,
      terminal: true,
    };
  }

  const completionIntent = readCompletionIntent();
  if (completionIntent) {
    await params.deps.eventRepository.appendEvent(params.client, {
      eventId: params.deps.eventIdFactory(),
      runId: params.run.runId,
      eventType: 'workflow.completed',
      timestamp: now().toISOString(),
      payload: {
        output: completionIntent.output ?? null,
      },
    });

    const completedRun = await params.deps.runRepository.upsertRunSummary(params.client, {
      ...params.run,
      lifecycle: 'completed',
      endedAt: now().toISOString(),
    });

    return {
      run: completedRun,
      progressed: true,
      terminal: true,
    };
  }

  const transitionIntent = readTransitionIntent();
  if (!transitionIntent) {
    return {
      run: params.run,
      progressed: false,
      terminal: false,
    };
  }

  try {
    assertTransitionAllowed(params.run.currentState, transitionIntent.to, definition.transitions);
  } catch (error) {
    const failedRun = await failRun({
      client: params.client,
      run: params.run,
      fromState: params.run.currentState,
      toState: transitionIntent.to,
      error,
      runRepository: params.deps.runRepository,
      eventRepository: params.deps.eventRepository,
      now,
      eventIdFactory: params.deps.eventIdFactory,
    });

    return {
      run: failedRun,
      progressed: true,
      terminal: true,
    };
  }

  const transitionName = resolveTransitionName(
    definition.transitions,
    params.run.currentState,
    transitionIntent.to,
  );

  await params.deps.eventRepository.appendEvent(params.client, {
    eventId: params.deps.eventIdFactory(),
    runId: params.run.runId,
    eventType: 'transition.requested',
    timestamp: now().toISOString(),
    payload: {
      from: params.run.currentState,
      to: transitionIntent.to,
      name: transitionName,
      data: transitionIntent.data ?? null,
    },
  });

  await params.deps.eventRepository.appendEvent(params.client, {
    eventId: params.deps.eventIdFactory(),
    runId: params.run.runId,
    eventType: 'transition.completed',
    timestamp: now().toISOString(),
    payload: {
      from: params.run.currentState,
      to: transitionIntent.to,
      name: transitionName,
      data: transitionIntent.data ?? null,
    },
  });

  await params.deps.eventRepository.appendEvent(params.client, {
    eventId: params.deps.eventIdFactory(),
    runId: params.run.runId,
    eventType: 'state.entered',
    timestamp: now().toISOString(),
    payload: {
      state: transitionIntent.to,
    },
  });

  const updatedRun = await params.deps.runRepository.upsertRunSummary(params.client, {
    ...params.run,
    currentState: transitionIntent.to,
  });

  return {
    run: updatedRun,
    progressed: true,
    terminal: false,
  };
};
