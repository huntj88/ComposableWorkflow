import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import type {
  CancelRunResponse,
  GetRunLogsQuery,
  HumanFeedbackRequestStatusResponse,
  ListRunFeedbackRequestsQuery,
  ListRunFeedbackRequestsResponse,
  ListRunsResponse,
  RunEventsResponse,
  RunLogsResponse,
  RunSummaryResponse,
  RunTreeResponse,
  SubmitHumanFeedbackResponseRequest,
  SubmitHumanFeedbackResponseResponse,
  WorkflowDefinitionResponse,
} from '@composable-workflow/workflow-api-types';

import type { GetRunEventsQuery, ListRunsQuery, WebGetRunLogsQuery } from '../../../src/transport';
import { createWorkflowApiClient } from '../../../src/transport';

type Assert<T extends true> = T;
type IsAssignable<From, To> = [From] extends [To] ? true : false;
type IsPromiseOf<Actual, Expected> =
  Actual extends Promise<infer Resolved> ? IsAssignable<Resolved, Expected> : false;

type Client = ReturnType<typeof createWorkflowApiClient>;

type _listRuns = Assert<
  IsPromiseOf<ReturnType<Client['listRuns']>, ListRunsResponse> &
    IsAssignable<Parameters<Client['listRuns']>[0], ListRunsQuery>
>;
type _runSummary = Assert<IsPromiseOf<ReturnType<Client['getRunSummary']>, RunSummaryResponse>>;
type _runTree = Assert<IsPromiseOf<ReturnType<Client['getRunTree']>, RunTreeResponse>>;
type _runEvents = Assert<
  IsPromiseOf<ReturnType<Client['getRunEvents']>, RunEventsResponse> &
    IsAssignable<Parameters<Client['getRunEvents']>[1], GetRunEventsQuery>
>;
type _runLogs = Assert<
  IsPromiseOf<ReturnType<Client['getRunLogs']>, RunLogsResponse> &
    IsAssignable<Parameters<Client['getRunLogs']>[1], WebGetRunLogsQuery & GetRunLogsQuery>
>;
type _definition = Assert<
  IsPromiseOf<ReturnType<Client['getWorkflowDefinition']>, WorkflowDefinitionResponse>
>;
type _cancel = Assert<IsPromiseOf<ReturnType<Client['cancelRun']>, CancelRunResponse>>;
type _feedbackList = Assert<
  IsPromiseOf<ReturnType<Client['listRunFeedbackRequests']>, ListRunFeedbackRequestsResponse> &
    IsAssignable<
      Exclude<Parameters<Client['listRunFeedbackRequests']>[1], undefined>,
      ListRunFeedbackRequestsQuery
    >
>;
type _feedbackSubmit = Assert<
  IsPromiseOf<
    ReturnType<Client['submitHumanFeedbackResponse']>,
    SubmitHumanFeedbackResponseResponse
  > &
    IsAssignable<
      Parameters<Client['submitHumanFeedbackResponse']>[1],
      SubmitHumanFeedbackResponseRequest
    >
>;
type _feedbackStatus = Assert<
  IsPromiseOf<
    ReturnType<Client['getHumanFeedbackRequestStatus']>,
    HumanFeedbackRequestStatusResponse
  >
>;

describe('integration.transport.ITX-WEB-009', () => {
  it('keeps covered transport signatures aligned with shared api types', () => {
    const client = createWorkflowApiClient({
      fetchImpl: async () => new Response(JSON.stringify({ items: [] }), { status: 200 }),
      eventSourceFactory: (url) => ({ url }) as unknown as EventSource,
    });

    expect(client).toHaveProperty('listRuns');
    expect(client).toHaveProperty('getRunSummary');
    expect(client).toHaveProperty('getRunTree');
    expect(client).toHaveProperty('getRunEvents');
    expect(client).toHaveProperty('getRunLogs');
    expect(client).toHaveProperty('getWorkflowDefinition');
    expect(client).toHaveProperty('cancelRun');
    expect(client).toHaveProperty('listRunFeedbackRequests');
    expect(client).toHaveProperty('submitHumanFeedbackResponse');
    expect(client).toHaveProperty('getHumanFeedbackRequestStatus');
  });

  it('does not declare local duplicate covered DTO aliases in transport client', () => {
    const workspaceRoot = resolve(import.meta.dirname, '../../../../..');
    const clientPath = resolve(
      workspaceRoot,
      'apps/workflow-web/src/transport/workflowApiClient.ts',
    );
    const source = readFileSync(clientPath, 'utf8');

    const duplicateDtoAliasPattern =
      /type\s+(?:StartWorkflowRequest|StartWorkflowResponse|ListRunsResponse|RunSummaryResponse|RunTreeResponse|RunEventsResponse|GetRunLogsQuery|RunLogsResponse|WorkflowDefinitionResponse|CancelRunResponse|SubmitHumanFeedbackResponseRequest|SubmitHumanFeedbackResponseResponse|SubmitHumanFeedbackResponseConflict|HumanFeedbackRequestStatusResponse|ListRunFeedbackRequestsQuery|ListRunFeedbackRequestsResponse|RunFeedbackRequestSummary|WorkflowStreamFrame|ErrorEnvelope)\s*=/;

    expect(duplicateDtoAliasPattern.test(source)).toBe(false);
  });
});
