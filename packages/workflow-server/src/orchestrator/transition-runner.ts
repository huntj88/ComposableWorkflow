import type { DbClient } from '../persistence/db.js';
import type { EventRepository } from '../persistence/event-repository.js';
import type { WorkflowLifecycle } from '../lifecycle/lifecycle-machine.js';
import { appendWorkflowLifecycleEvent } from '../lifecycle/lifecycle-events.js';
import type { IdempotencyRepository } from '../persistence/idempotency-repository.js';
import type { RunRepository, RunSummary } from '../persistence/run-repository.js';
import type { WorkflowRegistration, WorkflowRegistry } from '../registry/workflow-registry.js';
import {
  type CommandPolicy,
  type NormalizedCommandRequest,
  type CommandRequest,
  CommandPolicyError,
  defaultCommandPolicy,
  evaluateCommandPolicy,
} from '../command/command-policy.js';
import {
  createSpawnCommandRunnerAdapter,
  mapCommandOutcome,
  type CommandRunnerAdapter,
} from '../command/command-runner.js';
import { redactPayloadFields } from '../command/redaction.js';
import { truncateCommandPayload } from '../command/truncation.js';
import { awaitChild } from './child/await-child.js';
import {
  assertChildLaunchAllowed,
  toChildLaunchRequest,
  toChildLifecyclePayload,
} from './child/child-lineage.js';
import { launchChild } from './child/launch-child.js';

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

interface NormalizedWorkflowLog {
  level: string;
  message: string;
  metadata?: Record<string, unknown>;
}

interface CommandEventPayload {
  command?: string;
  args: string[];
  stdin: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  timeoutMs?: number;
  truncated: boolean;
  redactedFields: string[];
  timeout?: boolean;
}

type CommandLifecycleEventType = 'command.started' | 'command.completed' | 'command.failed';

export interface TransitionRunnerDependencies {
  registry: WorkflowRegistry;
  runRepository: RunRepository;
  eventRepository: EventRepository;
  idempotencyRepository: IdempotencyRepository;
  commandPolicy?: CommandPolicy;
  commandRunner?: CommandRunnerAdapter;
  now?: () => Date;
  eventIdFactory: () => string;
  runIdFactory?: () => string;
  maxChildIterations?: number;
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
    await appendWorkflowLifecycleEvent({
      client: params.client,
      eventRepository: params.eventRepository,
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
    await appendWorkflowLifecycleEvent({
      client: params.client,
      eventRepository: params.eventRepository,
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
    await appendWorkflowLifecycleEvent({
      client: params.client,
      eventRepository: params.eventRepository,
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

class SafePointInterruption extends Error {
  readonly result: TransitionStepResult;

  constructor(result: TransitionStepResult) {
    super('Workflow execution interrupted by lifecycle safe point');
    this.name = 'SafePointInterruption';
    this.result = result;
  }
}

const resolveTransitionName = (
  descriptors: readonly WorkflowTransitionDescriptor[] | undefined,
  from: string,
  to: string,
): string | undefined => descriptors?.find((item) => item.from === from && item.to === to)?.name;

const normalizeWorkflowLogLevel = (value: unknown): string => {
  if (typeof value !== 'string') {
    return 'info';
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'warning') {
    return 'warn';
  }

  if (['trace', 'debug', 'info', 'warn', 'error', 'fatal'].includes(normalized)) {
    return normalized;
  }

  return 'info';
};

const normalizeWorkflowLog = (event: unknown): NormalizedWorkflowLog => {
  if (typeof event === 'string') {
    return {
      level: 'info',
      message: event,
    };
  }

  if (!event || typeof event !== 'object') {
    return {
      level: 'info',
      message: 'Workflow log event emitted',
      metadata: {
        value: event,
      },
    };
  }

  const value = event as Record<string, unknown>;
  const level = normalizeWorkflowLogLevel(value.level ?? value.severity);
  const message =
    typeof value.message === 'string' && value.message.trim().length > 0
      ? value.message
      : 'Workflow log event emitted';

  const metadata: Record<string, unknown> = {
    ...value,
  };
  delete metadata.level;
  delete metadata.severity;
  delete metadata.message;

  return {
    level,
    message,
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
  };
};

const createExecutionContext = (
  client: DbClient,
  deps: TransitionRunnerDependencies,
  run: RunSummary,
  input: unknown,
): {
  context: RuntimeWorkflowContext<unknown, unknown>;
  readTransitionIntent: () => TransitionIntent | undefined;
  readCompletionIntent: () => CompletionIntent | undefined;
  readFailureIntent: () => FailureIntent | undefined;
  flushPendingLogs: () => Promise<void>;
} => {
  let transitionIntent: TransitionIntent | undefined;
  let completionIntent: CompletionIntent | undefined;
  let failureIntent: FailureIntent | undefined;
  const pendingLogWrites: Promise<void>[] = [];
  const now = deps.now ?? (() => new Date());
  const commandPolicy = deps.commandPolicy ?? defaultCommandPolicy();
  const commandRunner = deps.commandRunner ?? createSpawnCommandRunnerAdapter();

  const ensureNoResolutionConflict = (kind: string): void => {
    const resolvedCount = [transitionIntent, completionIntent, failureIntent].filter(
      (value) => value !== undefined,
    ).length;

    if (resolvedCount > 0) {
      throw new Error(`Workflow state has already resolved; cannot apply ${kind}`);
    }
  };

  const enforceLifecycleSafePoint = async (): Promise<RunSummary> => {
    const latestRun = await deps.runRepository.getRunSummary(client, run.runId);
    if (!latestRun) {
      throw new Error(`Run ${run.runId} not found`);
    }

    const safePointResult = await applyLifecycleSafePoint({
      client,
      run: latestRun,
      runRepository: deps.runRepository,
      eventRepository: deps.eventRepository,
      now,
      eventIdFactory: deps.eventIdFactory,
    });
    if (safePointResult) {
      throw new SafePointInterruption(safePointResult);
    }

    if (latestRun.lifecycle === 'cancelling') {
      await deps.eventRepository.appendEvent(client, {
        eventId: deps.eventIdFactory(),
        runId: latestRun.runId,
        eventType: 'workflow.cancelled',
        timestamp: now().toISOString(),
      });

      const cancelledRun = await deps.runRepository.upsertRunSummary(client, {
        ...latestRun,
        lifecycle: 'cancelled',
        endedAt: now().toISOString(),
      });

      throw new SafePointInterruption({
        run: cancelledRun,
        progressed: true,
        terminal: true,
      });
    }

    if (isTerminalLifecycle(latestRun.lifecycle)) {
      throw new SafePointInterruption({
        run: latestRun,
        progressed: false,
        terminal: true,
      });
    }

    return latestRun;
  };

  const toCommandRequest = (request: unknown): CommandRequest => {
    if (!request || typeof request !== 'object') {
      throw new Error('Command request must be an object');
    }

    return request as CommandRequest;
  };

  const sanitizeCommandPayload = (
    payload: Omit<CommandEventPayload, 'truncated' | 'redactedFields'>,
  ) => {
    const redacted = redactPayloadFields({
      payload,
      redactFields: commandPolicy.redactFields,
    });

    const truncated = truncateCommandPayload({
      payload: redacted.value,
      outputMaxBytes: commandPolicy.outputMaxBytes,
    });

    return {
      payload: {
        ...truncated.value,
        truncated: truncated.truncated,
        redactedFields: redacted.redactedFields,
      } as CommandEventPayload,
      truncated: truncated.truncated,
      redactedFields: redacted.redactedFields,
    };
  };

  const appendCommandEventWithLinkedLog = async (params: {
    eventType: CommandLifecycleEventType;
    payload: CommandEventPayload;
    error?: Record<string, unknown>;
  }): Promise<void> => {
    const timestamp = now().toISOString();
    const commandEvent = await deps.eventRepository.appendEvent(client, {
      eventId: deps.eventIdFactory(),
      runId: run.runId,
      eventType: params.eventType,
      timestamp,
      payload: params.payload as unknown as Record<string, unknown>,
      error: params.error,
    });

    const severity = params.eventType === 'command.failed' ? 'error' : 'info';
    const message =
      params.eventType === 'command.started'
        ? 'Workflow command started'
        : params.eventType === 'command.completed'
          ? 'Workflow command completed'
          : 'Workflow command failed';

    await deps.eventRepository.appendEvent(client, {
      eventId: deps.eventIdFactory(),
      runId: run.runId,
      eventType: 'log',
      timestamp,
      payload: {
        level: severity,
        severity,
        message,
        linkedEventId: commandEvent.eventId,
        linkedEventType: commandEvent.eventType,
        linkedSequence: commandEvent.sequence,
        command: params.payload.command,
        args: params.payload.args,
        stdin: params.payload.stdin,
        stdout: params.payload.stdout,
        stderr: params.payload.stderr,
        exitCode: params.payload.exitCode,
        durationMs: params.payload.durationMs,
        timeoutMs: params.payload.timeoutMs,
        truncated: params.payload.truncated,
        redactedFields: params.payload.redactedFields,
      },
    });
  };

  const flushPendingLogs = async (): Promise<void> => {
    if (pendingLogWrites.length === 0) {
      return;
    }

    const writes = pendingLogWrites.splice(0, pendingLogWrites.length);
    await Promise.all(writes);
  };

  const context: RuntimeWorkflowContext<unknown, unknown> = {
    runId: run.runId,
    workflowType: run.workflowType,
    input,
    now: () => new Date(),
    log: (event) => {
      const normalized = normalizeWorkflowLog(event);

      const write = deps.eventRepository
        .appendEvent(client, {
          eventId: deps.eventIdFactory(),
          runId: run.runId,
          eventType: 'log',
          timestamp: now().toISOString(),
          payload: {
            level: normalized.level,
            severity: normalized.level,
            message: normalized.message,
            metadata: normalized.metadata,
          },
        })
        .then(() => {
          return;
        });

      pendingLogWrites.push(write);
    },
    transition: (to, data) => {
      ensureNoResolutionConflict('transition');
      transitionIntent = {
        to,
        data,
      };
    },
    launchChild: async <CO>(request: unknown): Promise<CO> => {
      const beforeChildRun = await enforceLifecycleSafePoint();
      const parsedRequest = toChildLaunchRequest(request);
      assertChildLaunchAllowed(beforeChildRun.lifecycle as WorkflowLifecycle);

      const { childRun } = await launchChild({
        client,
        deps: {
          registry: deps.registry,
          runRepository: deps.runRepository,
          eventRepository: deps.eventRepository,
          idempotencyRepository: deps.idempotencyRepository,
          now,
          eventIdFactory: deps.eventIdFactory,
          runIdFactory: deps.runIdFactory,
        },
        parentRun: run,
        request: parsedRequest,
      });

      try {
        const awaited = await awaitChild({
          client,
          deps: {
            getRunSummary: deps.runRepository.getRunSummary,
            runStep: async (childRun) =>
              runTransitionStep({
                client,
                deps,
                run: childRun,
              }),
            maxIterations: deps.maxChildIterations,
          },
          childRunId: childRun.runId,
        });

        await deps.eventRepository.appendEvent(client, {
          eventId: deps.eventIdFactory(),
          runId: run.runId,
          eventType: 'child.completed',
          timestamp: now().toISOString(),
          payload: toChildLifecyclePayload(
            awaited.childRun.runId,
            awaited.childRun.workflowType,
            awaited.childRun.lifecycle as WorkflowLifecycle,
          ) as unknown as Record<string, unknown>,
        });

        return awaited.output as CO;
      } catch (error) {
        const latestChild = await deps.runRepository.getRunSummary(client, childRun.runId);
        const childLifecycle = latestChild?.lifecycle ?? 'failed';

        await deps.eventRepository.appendEvent(client, {
          eventId: deps.eventIdFactory(),
          runId: run.runId,
          eventType: 'child.failed',
          timestamp: now().toISOString(),
          payload: toChildLifecyclePayload(
            childRun.runId,
            childRun.workflowType,
            childLifecycle as WorkflowLifecycle,
          ) as unknown as Record<string, unknown>,
        });

        throw error;
      } finally {
        await enforceLifecycleSafePoint();
      }
    },
    runCommand: async (request): Promise<unknown> => {
      await enforceLifecycleSafePoint();

      const parsedRequest = toCommandRequest(request);
      let normalizedRequest: NormalizedCommandRequest;

      try {
        normalizedRequest = evaluateCommandPolicy({
          policy: commandPolicy,
          request: parsedRequest,
        });
      } catch (error) {
        if (error instanceof CommandPolicyError) {
          const failurePayload = sanitizeCommandPayload({
            command: parsedRequest.command,
            args: parsedRequest.args ?? [],
            stdin: parsedRequest.stdin ?? '',
            stdout: '',
            stderr: '',
            exitCode: -1,
            startedAt: now().toISOString(),
            completedAt: now().toISOString(),
            durationMs: 0,
            timeoutMs: parsedRequest.timeoutMs,
          });

          await appendCommandEventWithLinkedLog({
            eventType: 'command.failed',
            payload: failurePayload.payload,
            error: {
              name: error.name,
              message: error.message,
              code: error.code,
            },
          });
        }

        throw error;
      }

      const startedPayload = sanitizeCommandPayload({
        command: normalizedRequest.command,
        args: normalizedRequest.args,
        stdin: normalizedRequest.stdin,
        stdout: '',
        stderr: '',
        exitCode: 0,
        startedAt: now().toISOString(),
        completedAt: now().toISOString(),
        durationMs: 0,
        timeoutMs: normalizedRequest.timeoutMs,
      });

      await appendCommandEventWithLinkedLog({
        eventType: 'command.started',
        payload: startedPayload.payload,
      });

      const commandResult = await commandRunner.run(normalizedRequest);
      const finalizedPayload = sanitizeCommandPayload({
        command: normalizedRequest.command,
        args: normalizedRequest.args,
        stdin: normalizedRequest.stdin,
        stdout: commandResult.stdout,
        stderr: commandResult.stderr,
        exitCode: commandResult.exitCode,
        startedAt: commandResult.startedAt,
        completedAt: commandResult.completedAt,
        durationMs: commandResult.durationMs,
        timeoutMs: normalizedRequest.timeoutMs,
      });

      const outcome = mapCommandOutcome({
        exitCode: commandResult.exitCode,
        timedOut: commandResult.timedOut,
        allowNonZeroExit: normalizedRequest.allowNonZeroExit,
      });

      if (commandResult.timedOut) {
        await appendCommandEventWithLinkedLog({
          eventType: 'command.failed',
          payload: {
            ...finalizedPayload.payload,
            timeout: true,
          },
          error: {
            name: 'CommandTimeoutError',
            message: `Command timed out after ${normalizedRequest.timeoutMs}ms`,
          },
        });

        throw new Error(`Command timed out after ${normalizedRequest.timeoutMs}ms`);
      }

      if (outcome === 'command.failed') {
        await appendCommandEventWithLinkedLog({
          eventType: 'command.failed',
          payload: finalizedPayload.payload,
          error: {
            name: 'CommandExitCodeError',
            message: `Command exited with code ${commandResult.exitCode}`,
          },
        });

        throw new Error(`Command exited with code ${commandResult.exitCode}`);
      }

      await appendCommandEventWithLinkedLog({
        eventType: 'command.completed',
        payload: finalizedPayload.payload,
      });

      await enforceLifecycleSafePoint();

      return {
        exitCode: commandResult.exitCode,
        stdin: finalizedPayload.payload.stdin,
        stdout: finalizedPayload.payload.stdout,
        stderr: finalizedPayload.payload.stderr,
        startedAt: commandResult.startedAt,
        completedAt: commandResult.completedAt,
        durationMs: commandResult.durationMs,
        truncated: finalizedPayload.truncated,
        redactedFields: finalizedPayload.redactedFields,
      };
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
    flushPendingLogs,
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
  const startedInput =
    params.input === undefined
      ? await params.deps.eventRepository.getStartedInput?.(params.client, params.run.runId)
      : undefined;
  const resolvedInput =
    params.input !== undefined
      ? params.input
      : startedInput?.present
        ? startedInput.value
        : undefined;

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
  const {
    context,
    readCompletionIntent,
    readFailureIntent,
    readTransitionIntent,
    flushPendingLogs,
  } = createExecutionContext(params.client, params.deps, params.run, resolvedInput);

  const definition = registration.factory(context) as RuntimeWorkflowDefinition<unknown, unknown>;
  const handler = definition.states[params.run.currentState];
  const stateData = await params.deps.eventRepository.getLatestTransitionData?.(
    params.client,
    params.run.runId,
    params.run.currentState,
  );

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
    await handler(context, stateData);
    await flushPendingLogs();
  } catch (error) {
    let resolvedError: unknown = error;

    try {
      await flushPendingLogs();
    } catch (logFlushError) {
      resolvedError = logFlushError;
    }

    if (resolvedError instanceof SafePointInterruption) {
      return resolvedError.result;
    }

    const failedRun = await failRun({
      client: params.client,
      run: params.run,
      fromState: params.run.currentState,
      error: resolvedError,
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
