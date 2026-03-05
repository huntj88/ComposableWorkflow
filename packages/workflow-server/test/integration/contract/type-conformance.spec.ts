import type { FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  humanFeedbackRequestStatusResponseSchema,
  listRunFeedbackRequestsResponseSchema,
  listRunsResponseSchema,
  runEventsResponseSchema,
  runLogsResponseSchema,
  runSummaryResponseSchema,
  runTreeResponseSchema,
  startWorkflowRequestSchema,
  startWorkflowResponseSchema,
  submitHumanFeedbackResponseConflictSchema,
  submitHumanFeedbackResponseRequestSchema,
  submitHumanFeedbackResponseResponseSchema,
  workflowDefinitionResponseSchema,
  workflowEventDtoSchema,
  workflowStreamFrameSchema,
  type HumanFeedbackRequestStatusResponse,
  type ListRunFeedbackRequestsResponse,
  type ListRunsResponse,
  type RunEventsResponse,
  type RunFeedbackRequestSummary,
  type RunLogsResponse,
  type RunSummaryResponse,
  type RunTreeNode,
  type RunTreeResponse,
  type StartWorkflowRequest,
  type StartWorkflowResponse,
  type SubmitHumanFeedbackResponseConflict,
  type SubmitHumanFeedbackResponsePayload,
  type SubmitHumanFeedbackResponseRequest,
  type SubmitHumanFeedbackResponseResponse,
  type WorkflowDefinitionResponse,
  type WorkflowEventDto,
  type WorkflowStreamFrame,
} from '@composable-workflow/workflow-api-types';

import type {
  FollowEventChunk,
  HumanFeedbackRequestStatus as CliHumanFeedbackRequestStatus,
  HumanFeedbackRequestSummary as CliHumanFeedbackRequestSummary,
  HumanFeedbackRespondAccepted as CliHumanFeedbackRespondAccepted,
  HumanFeedbackRespondConflict as CliHumanFeedbackRespondConflict,
  HumanFeedbackResponsePayload as CliHumanFeedbackResponsePayload,
  RunSummary as CliRunSummary,
  RunTreeNode as CliRunTreeNode,
  StartRunRequest as CliStartRunRequest,
  WorkflowDefinition as CliWorkflowDefinition,
  WorkflowEvent as CliWorkflowEvent,
} from '../../../../../apps/workflow-cli/src/http/client.js';
import type { WorkflowWebStreamFrame } from '../../../../../apps/workflow-web/src/index.js';
import { registerDefinitionRoutes } from '../../../src/api/routes/definitions.js';
import { registerEventRoutes } from '../../../src/api/routes/events.js';
import { registerHumanFeedbackRoutes } from '../../../src/api/routes/human-feedback.js';
import { registerRunFeedbackRequestRoutes } from '../../../src/api/routes/run-feedback-requests.js';
import { getRunSummaryById, registerRunRoutes } from '../../../src/api/routes/runs.js';
import { registerWorkflowRoutes } from '../../../src/api/routes/workflows.js';
import { startWorkflowBodySchema } from '../../../src/api/schemas.js';
import type { ApiServerDependencies } from '../../../src/api/server.js';
import { registerSseRunRoute, serializeWorkflowEventFrame } from '../../../src/stream/sse-route.js';

type Assert<T extends true> = T;
type IsAssignable<From, To> = [From] extends [To] ? true : false;
type IsExact<Left, Right> =
  IsAssignable<Left, Right> extends true
    ? IsAssignable<Right, Left> extends true
      ? true
      : false
    : false;

export type ServerStartRequestConforms = Assert<
  IsExact<z.infer<typeof startWorkflowBodySchema>, StartWorkflowRequest>
>;
export type SharedStartRequestConforms = Assert<
  IsExact<z.infer<typeof startWorkflowRequestSchema>, StartWorkflowRequest>
>;
export type SharedStartResponseConforms = Assert<
  IsExact<z.infer<typeof startWorkflowResponseSchema>, StartWorkflowResponse>
>;
export type SharedListRunsConforms = Assert<
  IsExact<z.infer<typeof listRunsResponseSchema>, ListRunsResponse>
>;
export type SharedRunSummaryConforms = Assert<
  IsExact<z.infer<typeof runSummaryResponseSchema>, RunSummaryResponse>
>;
export type SharedRunTreeConforms = Assert<
  IsExact<z.infer<typeof runTreeResponseSchema>, RunTreeResponse>
>;
export type SharedRunEventsConforms = Assert<
  IsExact<z.infer<typeof runEventsResponseSchema>, RunEventsResponse>
>;
export type SharedRunLogsConforms = Assert<
  IsExact<z.infer<typeof runLogsResponseSchema>, RunLogsResponse>
>;
export type SharedDefinitionConforms = Assert<
  IsExact<z.infer<typeof workflowDefinitionResponseSchema>, WorkflowDefinitionResponse>
>;
export type SharedFeedbackRespondRequestConforms = Assert<
  IsExact<
    z.infer<typeof submitHumanFeedbackResponseRequestSchema>,
    SubmitHumanFeedbackResponseRequest
  >
>;
export type SharedFeedbackRespondAcceptedConforms = Assert<
  IsExact<
    z.infer<typeof submitHumanFeedbackResponseResponseSchema>,
    SubmitHumanFeedbackResponseResponse
  >
>;
export type SharedFeedbackRespondConflictConforms = Assert<
  IsExact<
    z.infer<typeof submitHumanFeedbackResponseConflictSchema>,
    SubmitHumanFeedbackResponseConflict
  >
>;
export type SharedFeedbackStatusConforms = Assert<
  IsExact<
    z.infer<typeof humanFeedbackRequestStatusResponseSchema>,
    HumanFeedbackRequestStatusResponse
  >
>;
export type SharedRunFeedbackListConforms = Assert<
  IsExact<z.infer<typeof listRunFeedbackRequestsResponseSchema>, ListRunFeedbackRequestsResponse>
>;
export type SharedWorkflowEventConforms = Assert<
  IsExact<z.infer<typeof workflowEventDtoSchema>, WorkflowEventDto>
>;
export type SharedWorkflowStreamConforms = Assert<
  IsExact<z.infer<typeof workflowStreamFrameSchema>, WorkflowStreamFrame>
>;

export type CliStartRequestConforms = Assert<IsExact<CliStartRunRequest, StartWorkflowRequest>>;
export type CliRunSummaryConforms = Assert<IsExact<CliRunSummary, RunSummaryResponse>>;
export type CliRunTreeNodeConforms = Assert<IsExact<CliRunTreeNode, RunTreeNode>>;
export type CliWorkflowEventConforms = Assert<IsExact<CliWorkflowEvent, WorkflowEventDto>>;
export type CliWorkflowDefinitionConforms = Assert<
  IsExact<CliWorkflowDefinition, WorkflowDefinitionResponse>
>;
export type CliFeedbackPayloadConforms = Assert<
  IsExact<CliHumanFeedbackResponsePayload, SubmitHumanFeedbackResponsePayload>
>;
export type CliFeedbackStatusConforms = Assert<
  IsExact<CliHumanFeedbackRequestStatus, HumanFeedbackRequestStatusResponse>
>;
export type CliFeedbackSummaryConforms = Assert<
  IsExact<CliHumanFeedbackRequestSummary, RunFeedbackRequestSummary>
>;
export type CliFeedbackAcceptedConforms = Assert<
  IsExact<CliHumanFeedbackRespondAccepted, SubmitHumanFeedbackResponseResponse>
>;
export type CliFeedbackConflictConforms = Assert<
  IsExact<CliHumanFeedbackRespondConflict, SubmitHumanFeedbackResponseConflict>
>;
export type CliFollowChunkUsesSharedEvents = Assert<
  IsExact<FollowEventChunk['event'], WorkflowEventDto>
>;
export type WebStreamFrameConforms = Assert<IsExact<WorkflowWebStreamFrame, WorkflowStreamFrame>>;

const section8RouteRegistrars = [
  registerWorkflowRoutes,
  registerRunRoutes,
  registerRunFeedbackRequestRoutes,
  registerEventRoutes,
  registerDefinitionRoutes,
  registerHumanFeedbackRoutes,
  registerSseRunRoute,
] satisfies Array<(server: FastifyInstance, deps: ApiServerDependencies) => Promise<void>>;

export const routeRegistrarCount: 7 = section8RouteRegistrars.length as 7;
export const getRunSummaryReturnType: Promise<RunSummaryResponse | null> =
  null as unknown as ReturnType<typeof getRunSummaryById>;

describe('integration.contract.type-conformance', () => {
  it('ITX-031 keeps SSE frame serialization aligned to WorkflowStreamFrame', () => {
    const event: WorkflowEventDto = workflowEventDtoSchema.parse({
      eventId: 'evt_itx031_1',
      runId: 'wr_itx031_1',
      workflowType: 'wf.test.itx031',
      parentRunId: null,
      sequence: 1,
      eventType: 'workflow.started',
      state: 'running',
      transition: null,
      child: null,
      command: null,
      timestamp: '2026-03-05T00:00:00.000Z',
      payload: null,
      error: null,
    });

    const frame = serializeWorkflowEventFrame({
      cursorPayload: { runId: event.runId, sequence: event.sequence },
      event,
    });

    const lines = frame.trim().split('\n');
    const eventLine = lines.find((line) => line.startsWith('event: '));
    const idLine = lines.find((line) => line.startsWith('id: '));
    const dataLine = lines.find((line) => line.startsWith('data: '));
    expect(eventLine).toBeDefined();
    expect(idLine).toBeDefined();
    expect(dataLine).toBeDefined();

    const parsed = workflowStreamFrameSchema.parse({
      event: (eventLine as string).slice('event: '.length),
      id: (idLine as string).slice('id: '.length),
      data: JSON.parse((dataLine as string).slice('data: '.length)),
    });
    expect(parsed.event).toBe('workflow-event');
    expect(parsed.data.eventId).toBe('evt_itx031_1');
  });

  it('ITX-031 shared schemas parse canonical section 8 payload shapes', () => {
    startWorkflowRequestSchema.parse({
      workflowType: 'wf.test.section8',
      input: { k: 'v' },
      idempotencyKey: 'idem_itx031',
      metadata: { source: 'integration' },
    });

    startWorkflowResponseSchema.parse({
      runId: 'wr_itx031_start',
      workflowType: 'wf.test.section8',
      workflowVersion: '1.0.0',
      lifecycle: 'running',
      startedAt: '2026-03-05T00:00:00.000Z',
    });

    listRunsResponseSchema.parse({
      items: [
        {
          runId: 'wr_itx031_summary',
          workflowType: 'wf.test.section8',
          workflowVersion: '1.0.0',
          lifecycle: 'running',
          currentState: 'collect_feedback',
          currentTransitionContext: null,
          parentRunId: null,
          childrenSummary: {
            total: 0,
            active: 0,
            completed: 0,
            failed: 0,
            cancelled: 0,
          },
          counters: {
            eventCount: 1,
            childCount: 0,
            logCount: 0,
          },
          startedAt: '2026-03-05T00:00:00.000Z',
          endedAt: null,
        },
      ],
    });

    runEventsResponseSchema.parse({ items: [], nextCursor: undefined });
    runLogsResponseSchema.parse({ items: [] });
    runTreeResponseSchema.parse({
      tree: {
        runId: 'wr_itx031_tree',
        workflowType: 'wf.test.section8',
        workflowVersion: '1.0.0',
        lifecycle: 'running',
        currentState: 'collect_feedback',
        parentRunId: null,
        startedAt: '2026-03-05T00:00:00.000Z',
        endedAt: null,
        children: [],
      },
      overlay: {
        runId: 'wr_itx031_tree',
        activeNode: 'collect_feedback',
        traversedEdges: [],
        pendingEdges: [],
        failedEdges: [],
        childGraphLinks: [],
        transitionTimeline: [],
      },
    });

    workflowDefinitionResponseSchema.parse({
      workflowType: 'wf.test.section8',
      workflowVersion: '1.0.0',
      states: ['collect_feedback'],
      transitions: [],
      childLaunchAnnotations: [],
      metadata: {},
    });

    submitHumanFeedbackResponseRequestSchema.parse({
      response: { questionId: 'q_itx031', selectedOptionIds: [1] },
      respondedBy: 'operator_itx031',
    });
    submitHumanFeedbackResponseResponseSchema.parse({
      feedbackRunId: 'wr_itx031_feedback',
      status: 'accepted',
      acceptedAt: '2026-03-05T00:00:01.000Z',
    });
    submitHumanFeedbackResponseConflictSchema.parse({
      feedbackRunId: 'wr_itx031_feedback',
      status: 'responded',
      respondedAt: '2026-03-05T00:00:02.000Z',
      cancelledAt: null,
    });

    humanFeedbackRequestStatusResponseSchema.parse({
      feedbackRunId: 'wr_itx031_feedback',
      parentRunId: 'wr_itx031_parent',
      parentWorkflowType: 'wf.test.section8',
      parentState: 'collect_feedback',
      questionId: 'q_itx031',
      requestEventId: 'evt_itx031_feedback',
      prompt: 'Respond please',
      options: [
        { id: 1, label: 'Approve' },
        { id: 2, label: 'Reject' },
      ],
      constraints: null,
      correlationId: null,
      status: 'awaiting_response',
      requestedAt: '2026-03-05T00:00:00.000Z',
      respondedAt: null,
      cancelledAt: null,
      response: null,
      respondedBy: null,
    });

    listRunFeedbackRequestsResponseSchema.parse({
      items: [
        {
          feedbackRunId: 'wr_itx031_feedback',
          parentRunId: 'wr_itx031_parent',
          questionId: 'q_itx031',
          status: 'awaiting_response',
          requestedAt: '2026-03-05T00:00:00.000Z',
          respondedAt: null,
          cancelledAt: null,
          respondedBy: null,
          prompt: 'Respond please',
          options: [
            { id: 1, label: 'Approve' },
            { id: 2, label: 'Reject' },
          ],
          constraints: null,
        },
      ],
      nextCursor: undefined,
    });
  });
});
