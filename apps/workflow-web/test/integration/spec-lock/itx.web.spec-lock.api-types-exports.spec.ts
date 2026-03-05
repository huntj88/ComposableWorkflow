import { describe, expect, it } from 'vitest';

import {
  cancelRunResponseSchema,
  errorEnvelopeSchema,
  eventCursorBrandSchema,
  getRunLogsQuerySchema,
  humanFeedbackRequestStatusResponseSchema,
  listRunFeedbackRequestsQuerySchema,
  listRunFeedbackRequestsResponseSchema,
  listRunsResponseSchema,
  runEventsResponseSchema,
  runSummaryResponseSchema,
  runTreeNodeSchema,
  runTreeResponseSchema,
  startWorkflowRequestSchema,
  startWorkflowResponseSchema,
  submitHumanFeedbackResponseConflictSchema,
  submitHumanFeedbackResponseRequestSchema,
  submitHumanFeedbackResponseResponseSchema,
  workflowDefinitionResponseSchema,
  workflowEventDtoSchema,
  workflowLifecycleSchema,
  workflowLogEntryDtoSchema,
  workflowStreamEventSchema,
  workflowStreamFrameSchema,
  type CancelRunResponse,
  type ErrorEnvelope,
  type EventCursor,
  type GetRunLogsQuery,
  type HumanFeedbackRequestStatusResponse,
  type ListRunFeedbackRequestsQuery,
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
  type SubmitHumanFeedbackResponseRequest,
  type SubmitHumanFeedbackResponseResponse,
  type WorkflowDefinitionResponse,
  type WorkflowEventDto,
  type WorkflowLifecycle,
  type WorkflowLogEntryDto,
  type WorkflowStreamEvent,
  type WorkflowStreamFrame,
} from '@composable-workflow/workflow-api-types';

type Assert<T extends true> = T;
type IsAssignable<From, To> = [From] extends [To] ? true : false;

type _startReq = Assert<IsAssignable<StartWorkflowRequest, StartWorkflowRequest>>;
type _startRes = Assert<IsAssignable<StartWorkflowResponse, StartWorkflowResponse>>;
type _listRuns = Assert<IsAssignable<ListRunsResponse, ListRunsResponse>>;
type _runSummary = Assert<IsAssignable<RunSummaryResponse, RunSummaryResponse>>;
type _runTree = Assert<IsAssignable<RunTreeResponse, RunTreeResponse>>;
type _runTreeNode = Assert<IsAssignable<RunTreeNode, RunTreeNode>>;
type _runEvents = Assert<IsAssignable<RunEventsResponse, RunEventsResponse>>;
type _workflowEvent = Assert<IsAssignable<WorkflowEventDto, WorkflowEventDto>>;
type _eventCursor = Assert<IsAssignable<EventCursor, EventCursor>>;
type _logsQuery = Assert<IsAssignable<GetRunLogsQuery, GetRunLogsQuery>>;
type _runLogs = Assert<IsAssignable<RunLogsResponse, RunLogsResponse>>;
type _logEntry = Assert<IsAssignable<WorkflowLogEntryDto, WorkflowLogEntryDto>>;
type _lifecycle = Assert<IsAssignable<WorkflowLifecycle, WorkflowLifecycle>>;
type _definition = Assert<IsAssignable<WorkflowDefinitionResponse, WorkflowDefinitionResponse>>;
type _cancel = Assert<IsAssignable<CancelRunResponse, CancelRunResponse>>;
type _feedbackReq = Assert<
  IsAssignable<SubmitHumanFeedbackResponseRequest, SubmitHumanFeedbackResponseRequest>
>;
type _feedbackRes = Assert<
  IsAssignable<SubmitHumanFeedbackResponseResponse, SubmitHumanFeedbackResponseResponse>
>;
type _feedbackConflict = Assert<
  IsAssignable<SubmitHumanFeedbackResponseConflict, SubmitHumanFeedbackResponseConflict>
>;
type _feedbackStatus = Assert<
  IsAssignable<HumanFeedbackRequestStatusResponse, HumanFeedbackRequestStatusResponse>
>;
type _feedbackQuery = Assert<
  IsAssignable<ListRunFeedbackRequestsQuery, ListRunFeedbackRequestsQuery>
>;
type _feedbackList = Assert<
  IsAssignable<ListRunFeedbackRequestsResponse, ListRunFeedbackRequestsResponse>
>;
type _feedbackSummary = Assert<IsAssignable<RunFeedbackRequestSummary, RunFeedbackRequestSummary>>;
type _streamEvent = Assert<IsAssignable<WorkflowStreamEvent, WorkflowStreamEvent>>;
type _streamFrame = Assert<IsAssignable<WorkflowStreamFrame, WorkflowStreamFrame>>;
type _errorEnvelope = Assert<IsAssignable<ErrorEnvelope, ErrorEnvelope>>;

describe('integration.spec-lock.api-types-exports', () => {
  it('exposes required Section 6.1 schema symbols for web transport usage', () => {
    expect(startWorkflowRequestSchema).toBeDefined();
    expect(startWorkflowResponseSchema).toBeDefined();
    expect(listRunsResponseSchema).toBeDefined();
    expect(runSummaryResponseSchema).toBeDefined();
    expect(runTreeResponseSchema).toBeDefined();
    expect(runTreeNodeSchema).toBeDefined();
    expect(runEventsResponseSchema).toBeDefined();
    expect(workflowEventDtoSchema).toBeDefined();
    expect(eventCursorBrandSchema).toBeDefined();
    expect(getRunLogsQuerySchema).toBeDefined();
    expect(workflowLogEntryDtoSchema).toBeDefined();
    expect(workflowLifecycleSchema).toBeDefined();
    expect(workflowDefinitionResponseSchema).toBeDefined();
    expect(cancelRunResponseSchema).toBeDefined();
    expect(submitHumanFeedbackResponseRequestSchema).toBeDefined();
    expect(submitHumanFeedbackResponseResponseSchema).toBeDefined();
    expect(submitHumanFeedbackResponseConflictSchema).toBeDefined();
    expect(humanFeedbackRequestStatusResponseSchema).toBeDefined();
    expect(listRunFeedbackRequestsQuerySchema).toBeDefined();
    expect(listRunFeedbackRequestsResponseSchema).toBeDefined();
    expect(workflowStreamEventSchema).toBeDefined();
    expect(workflowStreamFrameSchema).toBeDefined();
    expect(errorEnvelopeSchema).toBeDefined();
  });
});
