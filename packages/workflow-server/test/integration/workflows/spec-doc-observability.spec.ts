import { describe, expect, it } from 'vitest';

import type {
  WorkflowEvent,
  WorkflowInstrumentation,
} from '@composable-workflow/workflow-lib/contracts';

import { createInstrumentedEventRepository } from '../../../src/observability/instrumentation-adapter.js';
import type {
  EventInsert,
  EventRepository,
  PersistedEvent,
} from '../../../src/persistence/event-repository.js';
import type { RunRepository } from '../../../src/persistence/run-repository.js';

// ---------------------------------------------------------------------------
// Known stable template IDs from app-builder.spec-doc.v1
// (hardcoded to avoid cross-package dependency; these are stable observability
// keys per spec section 7.2)
// ---------------------------------------------------------------------------

const SPEC_DOC_TEMPLATE_IDS = {
  integrate: 'spec-doc.integrate.v1',
  consistencyCheck: 'spec-doc.consistency-check.v1',
  classifyCustomPrompt: 'spec-doc.classify-custom-prompt.v1',
  expandClarification: 'spec-doc.expand-clarification.v1',
};

const SPEC_DOC_OBS_TYPES = {
  delegationStarted: 'spec-doc.delegation.started',
  integrationPassCompleted: 'spec-doc.integration-pass.completed',
  consistencyOutcome: 'spec-doc.consistency-check.completed',
  questionGenerated: 'spec-doc.question.generated',
  responseReceived: 'spec-doc.response.received',
  classificationOutcome: 'spec-doc.classification.completed',
  clarificationGenerated: 'spec-doc.clarification.generated',
  terminalCompleted: 'spec-doc.terminal.completed',
};

// ---------------------------------------------------------------------------
// In-memory repository helpers (follows hook-ordering.spec.ts pattern)
// ---------------------------------------------------------------------------

const RUN_ID = 'wr_spec_doc_obs';
const WORKFLOW_TYPE = 'app-builder.spec-doc.v1';

const createBaseEventRepository = (): EventRepository => {
  const sequenceByRun = new Map<string, number>();

  return {
    appendEvent: async (_client, input: EventInsert): Promise<PersistedEvent> => {
      const sequence = (sequenceByRun.get(input.runId) ?? 0) + 1;
      sequenceByRun.set(input.runId, sequence);

      return {
        eventId: input.eventId,
        runId: input.runId,
        eventType: input.eventType,
        sequence,
        timestamp: input.timestamp,
        payload: input.payload ?? null,
        error: (input.error as PersistedEvent['error']) ?? null,
      };
    },
  };
};

const createRunRepository = (): RunRepository => ({
  upsertRunSummary: async () => {
    throw new Error('not used');
  },
  getRunSummary: async () => ({
    runId: RUN_ID,
    workflowType: WORKFLOW_TYPE,
    workflowVersion: '1.0.0',
    lifecycle: 'running' as const,
    currentState: 'IntegrateIntoSpec',
    parentRunId: null,
    startedAt: '2026-03-03T00:00:00.000Z',
    endedAt: null,
  }),
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('spec-doc observability – template traceability in event pipeline', () => {
  it('preserves promptTemplateId in delegation log event payloads', async () => {
    const observedEvents: WorkflowEvent[] = [];
    const instrumentation: WorkflowInstrumentation = {
      onEvent: async (event) => {
        observedEvents.push(event);
      },
      onMetric: async () => {
        return;
      },
      onTrace: async () => {
        return;
      },
    };

    const repository = createInstrumentedEventRepository({
      baseEventRepository: createBaseEventRepository(),
      runRepository: createRunRepository(),
      instrumentation,
    });

    // Simulate a delegation.started log event (as runtime would produce from ctx.log)
    await repository.appendEvent({} as never, {
      eventId: 'evt_1',
      runId: RUN_ID,
      eventType: 'log',
      timestamp: '2026-03-03T12:00:00.000Z',
      payload: {
        level: 'info',
        message: '[obs] Delegation started: spec-doc.integrate.v1',
        observabilityType: SPEC_DOC_OBS_TYPES.delegationStarted,
        state: 'IntegrateIntoSpec',
        promptTemplateId: SPEC_DOC_TEMPLATE_IDS.integrate,
        outputSchemaId:
          'https://composable-workflow.local/schemas/app-builder/spec-doc/spec-integration-output.schema.json',
      },
    });

    // Simulate an integration-pass.completed log event
    await repository.appendEvent({} as never, {
      eventId: 'evt_2',
      runId: RUN_ID,
      eventType: 'log',
      timestamp: '2026-03-03T12:00:01.000Z',
      payload: {
        level: 'info',
        message: '[obs] Integration pass 1 completed',
        observabilityType: SPEC_DOC_OBS_TYPES.integrationPassCompleted,
        state: 'IntegrateIntoSpec',
        promptTemplateId: SPEC_DOC_TEMPLATE_IDS.integrate,
        source: 'workflow-input',
        specPath: 'specs/todo.md',
        passNumber: 1,
        changeSummaryCount: 3,
        resolvedCount: 0,
        remainingCount: 2,
      },
    });

    expect(observedEvents).toHaveLength(2);

    // Delegation event preserves template ID
    const delegationEvent = observedEvents[0];
    expect(delegationEvent.eventType).toBe('log');
    expect(delegationEvent.runId).toBe(RUN_ID);
    expect(delegationEvent.workflowType).toBe(WORKFLOW_TYPE);
    expect(delegationEvent.payload?.promptTemplateId).toBe(SPEC_DOC_TEMPLATE_IDS.integrate);
    expect(delegationEvent.payload?.outputSchemaId).toContain('spec-integration-output');
    expect(delegationEvent.payload?.observabilityType).toBe(SPEC_DOC_OBS_TYPES.delegationStarted);
    expect(delegationEvent.state).toBe('IntegrateIntoSpec');

    // Integration pass event preserves template ID
    const integrationEvent = observedEvents[1];
    expect(integrationEvent.payload?.promptTemplateId).toBe(SPEC_DOC_TEMPLATE_IDS.integrate);
    expect(integrationEvent.payload?.observabilityType).toBe(
      SPEC_DOC_OBS_TYPES.integrationPassCompleted,
    );
  });

  it('all four template IDs survive the event pipeline', async () => {
    const observedEvents: WorkflowEvent[] = [];
    const instrumentation: WorkflowInstrumentation = {
      onEvent: async (event) => {
        observedEvents.push(event);
      },
      onMetric: async () => {
        return;
      },
      onTrace: async () => {
        return;
      },
    };

    const repository = createInstrumentedEventRepository({
      baseEventRepository: createBaseEventRepository(),
      runRepository: createRunRepository(),
      instrumentation,
    });

    const delegations = [
      {
        templateId: SPEC_DOC_TEMPLATE_IDS.integrate,
        state: 'IntegrateIntoSpec',
      },
      {
        templateId: SPEC_DOC_TEMPLATE_IDS.consistencyCheck,
        state: 'LogicalConsistencyCheckCreateFollowUpQuestions',
      },
      {
        templateId: SPEC_DOC_TEMPLATE_IDS.classifyCustomPrompt,
        state: 'ClassifyCustomPrompt',
      },
      {
        templateId: SPEC_DOC_TEMPLATE_IDS.expandClarification,
        state: 'ExpandQuestionWithClarification',
      },
    ];

    for (let i = 0; i < delegations.length; i++) {
      await repository.appendEvent({} as never, {
        eventId: `evt_deleg_${i + 1}`,
        runId: RUN_ID,
        eventType: 'log',
        timestamp: new Date(Date.UTC(2026, 2, 3, 12, 0, i)).toISOString(),
        payload: {
          level: 'info',
          message: `[obs] Delegation started: ${delegations[i].templateId}`,
          observabilityType: SPEC_DOC_OBS_TYPES.delegationStarted,
          state: delegations[i].state,
          promptTemplateId: delegations[i].templateId,
          outputSchemaId: `https://composable-workflow.local/schemas/app-builder/spec-doc/output-${i}.schema.json`,
        },
      });
    }

    expect(observedEvents).toHaveLength(4);

    for (let i = 0; i < 4; i++) {
      expect(observedEvents[i].payload?.promptTemplateId).toBe(delegations[i].templateId);
      expect(observedEvents[i].state).toBe(delegations[i].state);
    }
  });

  it('event sequences are monotonic for a single run', async () => {
    const observedEvents: WorkflowEvent[] = [];
    const instrumentation: WorkflowInstrumentation = {
      onEvent: async (event) => {
        observedEvents.push(event);
      },
      onMetric: async () => {
        return;
      },
      onTrace: async () => {
        return;
      },
    };

    const repository = createInstrumentedEventRepository({
      baseEventRepository: createBaseEventRepository(),
      runRepository: createRunRepository(),
      instrumentation,
    });

    // Simulate a full lifecycle: delegation → pass completed → question → response → terminal
    const events: EventInsert[] = [
      {
        eventId: 'evt_seq_1',
        runId: RUN_ID,
        eventType: 'log',
        timestamp: '2026-03-03T12:00:00.000Z',
        payload: {
          observabilityType: SPEC_DOC_OBS_TYPES.delegationStarted,
          state: 'IntegrateIntoSpec',
          promptTemplateId: SPEC_DOC_TEMPLATE_IDS.integrate,
        },
      },
      {
        eventId: 'evt_seq_2',
        runId: RUN_ID,
        eventType: 'log',
        timestamp: '2026-03-03T12:00:01.000Z',
        payload: {
          observabilityType: SPEC_DOC_OBS_TYPES.integrationPassCompleted,
          state: 'IntegrateIntoSpec',
          promptTemplateId: SPEC_DOC_TEMPLATE_IDS.integrate,
        },
      },
      {
        eventId: 'evt_seq_3',
        runId: RUN_ID,
        eventType: 'log',
        timestamp: '2026-03-03T12:00:02.000Z',
        payload: {
          observabilityType: SPEC_DOC_OBS_TYPES.questionGenerated,
          state: 'NumberedOptionsHumanRequest',
          questionId: 'q-1',
        },
      },
      {
        eventId: 'evt_seq_4',
        runId: RUN_ID,
        eventType: 'log',
        timestamp: '2026-03-03T12:00:03.000Z',
        payload: {
          observabilityType: SPEC_DOC_OBS_TYPES.responseReceived,
          state: 'NumberedOptionsHumanRequest',
          questionId: 'q-1',
        },
      },
      {
        eventId: 'evt_seq_5',
        runId: RUN_ID,
        eventType: 'log',
        timestamp: '2026-03-03T12:00:04.000Z',
        payload: {
          observabilityType: SPEC_DOC_OBS_TYPES.terminalCompleted,
          state: 'Done',
          specPath: 'specs/todo.md',
        },
      },
    ];

    for (const event of events) {
      await repository.appendEvent({} as never, event);
    }

    expect(observedEvents).toHaveLength(5);

    // Verify monotonic sequence ordering
    for (let i = 1; i < observedEvents.length; i++) {
      expect(observedEvents[i].sequence).toBeGreaterThan(observedEvents[i - 1].sequence);
    }
  });

  it('spec-doc observability payload fields survive persistence round-trip', async () => {
    const observedEvents: WorkflowEvent[] = [];
    const instrumentation: WorkflowInstrumentation = {
      onEvent: async (event) => {
        observedEvents.push(event);
      },
      onMetric: async () => {
        return;
      },
      onTrace: async () => {
        return;
      },
    };

    const repository = createInstrumentedEventRepository({
      baseEventRepository: createBaseEventRepository(),
      runRepository: createRunRepository(),
      instrumentation,
    });

    // Emit all observable operation types
    const allOperationEvents: EventInsert[] = [
      {
        eventId: 'evt_all_1',
        runId: RUN_ID,
        eventType: 'log',
        timestamp: '2026-03-03T12:00:00.000Z',
        payload: {
          observabilityType: SPEC_DOC_OBS_TYPES.delegationStarted,
          state: 'IntegrateIntoSpec',
          promptTemplateId: SPEC_DOC_TEMPLATE_IDS.integrate,
          outputSchemaId:
            'https://composable-workflow.local/schemas/app-builder/spec-doc/spec-integration-output.schema.json',
          inputSchemaId:
            'https://composable-workflow.local/schemas/app-builder/spec-doc/spec-integration-input.schema.json',
        },
      },
      {
        eventId: 'evt_all_2',
        runId: RUN_ID,
        eventType: 'log',
        timestamp: '2026-03-03T12:00:01.000Z',
        payload: {
          observabilityType: SPEC_DOC_OBS_TYPES.integrationPassCompleted,
          state: 'IntegrateIntoSpec',
          source: 'workflow-input',
          specPath: 'specs/todo.md',
          passNumber: 1,
          changeSummaryCount: 3,
          resolvedCount: 0,
          remainingCount: 2,
          promptTemplateId: SPEC_DOC_TEMPLATE_IDS.integrate,
        },
      },
      {
        eventId: 'evt_all_3',
        runId: RUN_ID,
        eventType: 'log',
        timestamp: '2026-03-03T12:00:02.000Z',
        payload: {
          observabilityType: SPEC_DOC_OBS_TYPES.consistencyOutcome,
          state: 'LogicalConsistencyCheckCreateFollowUpQuestions',
          blockingIssuesCount: 1,
          followUpQuestionsCount: 2,
          passNumber: 1,
          promptTemplateId: SPEC_DOC_TEMPLATE_IDS.consistencyCheck,
        },
      },
      {
        eventId: 'evt_all_4',
        runId: RUN_ID,
        eventType: 'log',
        timestamp: '2026-03-03T12:00:03.000Z',
        payload: {
          observabilityType: SPEC_DOC_OBS_TYPES.questionGenerated,
          state: 'NumberedOptionsHumanRequest',
          questionId: 'q-scope-1',
          kind: 'issue-resolution',
          queuePosition: 0,
          queueSize: 3,
        },
      },
      {
        eventId: 'evt_all_5',
        runId: RUN_ID,
        eventType: 'log',
        timestamp: '2026-03-03T12:00:04.000Z',
        payload: {
          observabilityType: SPEC_DOC_OBS_TYPES.responseReceived,
          state: 'NumberedOptionsHumanRequest',
          questionId: 'q-scope-1',
          selectedOptionIds: [2],
          hasCustomText: true,
        },
      },
      {
        eventId: 'evt_all_6',
        runId: RUN_ID,
        eventType: 'log',
        timestamp: '2026-03-03T12:00:05.000Z',
        payload: {
          observabilityType: SPEC_DOC_OBS_TYPES.classificationOutcome,
          state: 'ClassifyCustomPrompt',
          questionId: 'q-scope-1',
          intent: 'clarifying-question',
          promptTemplateId: SPEC_DOC_TEMPLATE_IDS.classifyCustomPrompt,
        },
      },
      {
        eventId: 'evt_all_7',
        runId: RUN_ID,
        eventType: 'log',
        timestamp: '2026-03-03T12:00:06.000Z',
        payload: {
          observabilityType: SPEC_DOC_OBS_TYPES.clarificationGenerated,
          state: 'ExpandQuestionWithClarification',
          sourceQuestionId: 'q-scope-1',
          followUpQuestionId: 'q-scope-1-c1',
          insertIndex: 1,
          promptTemplateId: SPEC_DOC_TEMPLATE_IDS.expandClarification,
        },
      },
      {
        eventId: 'evt_all_8',
        runId: RUN_ID,
        eventType: 'log',
        timestamp: '2026-03-03T12:00:07.000Z',
        payload: {
          observabilityType: SPEC_DOC_OBS_TYPES.terminalCompleted,
          state: 'Done',
          specPath: 'specs/todo.md',
          integrationPasses: 2,
          consistencyCheckPasses: 2,
        },
      },
    ];

    for (const event of allOperationEvents) {
      await repository.appendEvent({} as never, event);
    }

    expect(observedEvents).toHaveLength(8);

    // Verify each observable event type is present
    const obsTypes = observedEvents.map((e) => e.payload?.observabilityType);
    expect(obsTypes).toEqual([
      SPEC_DOC_OBS_TYPES.delegationStarted,
      SPEC_DOC_OBS_TYPES.integrationPassCompleted,
      SPEC_DOC_OBS_TYPES.consistencyOutcome,
      SPEC_DOC_OBS_TYPES.questionGenerated,
      SPEC_DOC_OBS_TYPES.responseReceived,
      SPEC_DOC_OBS_TYPES.classificationOutcome,
      SPEC_DOC_OBS_TYPES.clarificationGenerated,
      SPEC_DOC_OBS_TYPES.terminalCompleted,
    ]);

    // Verify delegation events carry template IDs
    const delegationEvents = observedEvents.filter(
      (e) =>
        e.payload?.observabilityType === SPEC_DOC_OBS_TYPES.delegationStarted ||
        (e.payload?.promptTemplateId !== undefined &&
          e.payload.observabilityType !== SPEC_DOC_OBS_TYPES.questionGenerated &&
          e.payload.observabilityType !== SPEC_DOC_OBS_TYPES.responseReceived &&
          e.payload.observabilityType !== SPEC_DOC_OBS_TYPES.terminalCompleted),
    );

    for (const event of delegationEvents) {
      expect(event.payload?.promptTemplateId).toBeDefined();
      expect(typeof event.payload?.promptTemplateId).toBe('string');
      expect((event.payload?.promptTemplateId as string).startsWith('spec-doc.')).toBe(true);
    }

    // Verify state field is populated from payload on all events
    for (const event of observedEvents) {
      expect(event.state).toBeDefined();
      expect(typeof event.state).toBe('string');
    }
  });
});
