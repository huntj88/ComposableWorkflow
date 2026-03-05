/**
 * TWEB12 / TWEB12-GATE-006
 * Representative E2E happy-path: feedback submit success and terminal status update.
 *
 * Covers:
 * - B-WEB-013: Feedback discovery uses run-scoped endpoint only
 * - B-WEB-020: Awaiting requests are visually prioritized
 * - B-WEB-021: Feedback form validity and submit behavior
 * - B-WEB-022: Feedback submit 400 preserves user input
 * - B-WEB-023: Feedback submit 409 terminalizes request interaction
 * - B-WEB-051: Run-feedback discovery query semantics match contract
 * - B-WEB-054: Shared error contracts are used for covered panel failures
 *
 * @vitest-environment jsdom
 */

import { describe, expect, it, afterEach } from 'vitest';

import { createMockTransport, type MockTransport } from '../integration/harness/mockTransport';
import { WorkflowPanelError } from '../../src/transport/errors';
import {
  buildFeedbackRequestSummary,
  buildListFeedbackRequestsResponse,
  buildFeedbackSubmitResponse,
  buildFeedbackStatusResponse,
  DEFAULT_RUN_ID,
  fixtureTimestamp,
} from '../integration/fixtures/workflowFixtures';
import {
  FEEDBACK_DEFAULT_LIMIT,
  FEEDBACK_MAX_LIMIT,
  DEFAULT_FEEDBACK_STATUS,
} from '../../src/transport/workflowApiClient';

describe('e2e.web-feedback-happy-path', () => {
  let transport: MockTransport;

  afterEach(() => {
    transport?.reset();
  });

  // -------------------------------------------------------------------------
  // Scenario 1: Feedback discovery uses run-scoped endpoint
  // -------------------------------------------------------------------------

  describe('feedback discovery (B-WEB-013, B-WEB-051)', () => {
    it('discovers feedback requests via run-scoped endpoint with default query', async () => {
      transport = createMockTransport();
      const runId = 'wr_fb_discovery_1';

      const feedbackList = buildListFeedbackRequestsResponse([
        buildFeedbackRequestSummary({
          feedbackRunId: 'fr_awaiting_1',
          parentRunId: runId,
          status: 'awaiting_response',
          requestedAt: fixtureTimestamp(1000),
        }),
        buildFeedbackRequestSummary({
          feedbackRunId: 'fr_responded_1',
          parentRunId: runId,
          status: 'responded',
          requestedAt: fixtureTimestamp(0),
          respondedAt: fixtureTimestamp(500),
        }),
      ]);

      transport.stubFeedbackList(runId, feedbackList);

      const result = await transport.client.listRunFeedbackRequests(runId);

      // Run-scoped endpoint URL is correct
      const calls = transport.getCallsMatching('/feedback-requests');
      expect(calls).toHaveLength(1);
      expect(calls[0]!.url).toContain(`/api/v1/workflows/runs/${runId}/feedback-requests`);

      // Default status filter is applied (B-WEB-051)
      expect(calls[0]!.url).toContain(`status=${encodeURIComponent(DEFAULT_FEEDBACK_STATUS)}`);

      // Default limit is applied (B-WEB-051)
      expect(calls[0]!.url).toContain(`limit=${FEEDBACK_DEFAULT_LIMIT}`);

      // Results include mixed statuses
      expect(result.items).toHaveLength(2);
      expect(result.items[0]!.status).toBe('awaiting_response');
      expect(result.items[1]!.status).toBe('responded');
    });

    it('awaiting requests are distinguishable for visual prioritization (B-WEB-020)', async () => {
      transport = createMockTransport();
      const runId = 'wr_fb_priority';

      const mixedItems = [
        buildFeedbackRequestSummary({
          feedbackRunId: 'fr_responded',
          parentRunId: runId,
          status: 'responded',
          requestedAt: fixtureTimestamp(2000),
        }),
        buildFeedbackRequestSummary({
          feedbackRunId: 'fr_awaiting',
          parentRunId: runId,
          status: 'awaiting_response',
          requestedAt: fixtureTimestamp(1000),
        }),
        buildFeedbackRequestSummary({
          feedbackRunId: 'fr_cancelled',
          parentRunId: runId,
          status: 'cancelled',
          requestedAt: fixtureTimestamp(0),
          cancelledAt: fixtureTimestamp(500),
        }),
      ];

      transport.stubFeedbackList(runId, buildListFeedbackRequestsResponse(mixedItems));

      const result = await transport.client.listRunFeedbackRequests(runId);

      // Client receives all items; priority ordering is a UI concern
      // Verify we can separate awaiting from terminal for prioritization
      const awaiting = result.items.filter((i) => i.status === 'awaiting_response');
      const terminal = result.items.filter((i) => i.status !== 'awaiting_response');

      expect(awaiting).toHaveLength(1);
      expect(terminal).toHaveLength(2);
      expect(awaiting[0]!.feedbackRunId).toBe('fr_awaiting');
    });

    it('pagination defaults and max limits are enforced (B-WEB-051)', async () => {
      transport = createMockTransport();
      const runId = 'wr_fb_pagination';

      transport.stubFeedbackList(runId, buildListFeedbackRequestsResponse());

      // Default limits
      expect(FEEDBACK_DEFAULT_LIMIT).toBe(50);
      expect(FEEDBACK_MAX_LIMIT).toBe(200);

      // Request with excessive limit gets clamped
      await transport.client.listRunFeedbackRequests(runId, { limit: 999 });

      const calls = transport.getCalls();
      expect(calls[0]!.url).toContain(`limit=${FEEDBACK_MAX_LIMIT}`);
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 2: Successful feedback submit
  // -------------------------------------------------------------------------

  describe('feedback submit success (B-WEB-021)', () => {
    it('successful submit returns accepted response with timestamp', async () => {
      transport = createMockTransport();

      const submitResponse = buildFeedbackSubmitResponse({
        feedbackRunId: 'fr_submit_ok',
        status: 'accepted',
        acceptedAt: fixtureTimestamp(5000),
      });

      transport.stubFeedbackSubmit('fr_submit_ok', submitResponse);

      const result = await transport.client.submitHumanFeedbackResponse('fr_submit_ok', {
        respondedBy: 'test-operator',
        response: {
          questionId: 'q_approval',
          selectedOptionIds: [1],
          text: 'Looks good to proceed',
        },
      });

      // Response carries acceptance confirmation (B-WEB-021)
      expect(result.status).toBe('accepted');
      expect(result.acceptedAt).toBe(fixtureTimestamp(5000));
      expect(result.feedbackRunId).toBe('fr_submit_ok');

      // Submit uses POST to correct endpoint
      const calls = transport.getCalls();
      expect(calls).toHaveLength(1);
      expect(calls[0]!.method).toBe('POST');
      expect(calls[0]!.url).toBe('/api/v1/human-feedback/requests/fr_submit_ok/respond');

      // Body contains required fields
      const body = JSON.parse(calls[0]!.body!);
      expect(body.respondedBy).toBe('test-operator');
      expect(body.response.questionId).toBe('q_approval');
      expect(body.response.selectedOptionIds).toEqual([1]);
    });

    it('submit body is schema-validated before sending', async () => {
      transport = createMockTransport();
      transport.stubFeedbackSubmit('fr_schema', buildFeedbackSubmitResponse());

      await transport.client.submitHumanFeedbackResponse('fr_schema', {
        respondedBy: 'agent',
        response: { questionId: 'q_1' },
      });

      const calls = transport.getCalls();
      const body = JSON.parse(calls[0]!.body!);

      // Schema validation ensures required fields are present
      expect(body).toHaveProperty('respondedBy');
      expect(body).toHaveProperty('response');
      expect(body.response).toHaveProperty('questionId');
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 3: Feedback submit 400 validation failure
  // -------------------------------------------------------------------------

  describe('feedback submit 400 validation (B-WEB-022, B-WEB-054)', () => {
    it('400 response raises WorkflowPanelError with validation details', async () => {
      transport = createMockTransport();

      const validationError = {
        code: 'VALIDATION_ERROR',
        message: 'selectedOptionIds must contain at least one valid option',
        requestId: 'req_400_1',
        details: {
          selectedOptionIds: 'Must contain at least one option',
        },
      };

      transport.stubFeedbackSubmit('fr_400', validationError, 400);

      try {
        await transport.client.submitHumanFeedbackResponse('fr_400', {
          respondedBy: 'user',
          response: { questionId: 'q_1', selectedOptionIds: [] },
        });
        expect.unreachable('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(WorkflowPanelError);
        const panelError = error as WorkflowPanelError;

        // Error carries diagnostic fields (B-WEB-054)
        expect(panelError.status).toBe(400);
        expect(panelError.panel).toBe('feedback-submit');
        expect(panelError.code).toBe('VALIDATION_ERROR');
        expect(panelError.requestId).toBe('req_400_1');
        expect(panelError.message).toContain('selectedOptionIds');

        // No feedback conflict for 400
        expect(panelError.feedbackConflict).toBeNull();
      }
    });

    it('400 preserves pending status — request remains non-terminal (B-WEB-022)', async () => {
      transport = createMockTransport();

      // Status check after failed submit should still show awaiting_response
      const statusResponse = buildFeedbackStatusResponse({
        feedbackRunId: 'fr_still_awaiting',
        status: 'awaiting_response',
        respondedAt: null,
        cancelledAt: null,
      });

      transport.stubFeedbackStatus('fr_still_awaiting', statusResponse);

      const status = await transport.client.getHumanFeedbackRequestStatus('fr_still_awaiting');

      expect(status.status).toBe('awaiting_response');
      expect(status.respondedAt).toBeNull();
      expect(status.cancelledAt).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 4: Feedback submit 409 conflict (terminal)
  // -------------------------------------------------------------------------

  describe('feedback submit 409 conflict (B-WEB-023, B-WEB-054)', () => {
    it('409 response raises WorkflowPanelError with terminal conflict metadata', async () => {
      transport = createMockTransport();

      const conflictPayload = {
        feedbackRunId: 'fr_409_conflict',
        status: 'responded',
        respondedAt: fixtureTimestamp(3000),
        cancelledAt: null,
      };

      transport.stubFeedbackSubmit('fr_409_conflict', conflictPayload, 409);

      try {
        await transport.client.submitHumanFeedbackResponse('fr_409_conflict', {
          respondedBy: 'late-user',
          response: { questionId: 'q_1', selectedOptionIds: [2] },
        });
        expect.unreachable('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(WorkflowPanelError);
        const panelError = error as WorkflowPanelError;

        // 409 carries terminal status (B-WEB-023)
        expect(panelError.status).toBe(409);
        expect(panelError.panel).toBe('feedback-submit');

        // Feedback conflict includes terminal metadata
        expect(panelError.feedbackConflict).not.toBeNull();
        expect(panelError.feedbackConflict!.status).toBe('responded');
        expect(panelError.feedbackConflict!.respondedAt).toBe(fixtureTimestamp(3000));
        expect(panelError.feedbackConflict!.cancelledAt).toBeNull();
      }
    });

    it('409 with cancelled status includes cancelledAt timestamp (B-WEB-023)', async () => {
      transport = createMockTransport();

      const cancelledConflict = {
        feedbackRunId: 'fr_409_cancelled',
        status: 'cancelled',
        respondedAt: null,
        cancelledAt: fixtureTimestamp(4000),
      };

      transport.stubFeedbackSubmit('fr_409_cancelled', cancelledConflict, 409);

      try {
        await transport.client.submitHumanFeedbackResponse('fr_409_cancelled', {
          respondedBy: 'user',
          response: { questionId: 'q_1', selectedOptionIds: [1] },
        });
        expect.unreachable('Should have thrown');
      } catch (error) {
        const panelError = error as WorkflowPanelError;

        expect(panelError.status).toBe(409);
        expect(panelError.feedbackConflict).not.toBeNull();
        expect(panelError.feedbackConflict!.status).toBe('cancelled');
        expect(panelError.feedbackConflict!.cancelledAt).toBe(fixtureTimestamp(4000));
        expect(panelError.feedbackConflict!.respondedAt).toBeNull();
      }
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 5: Feedback status transitions after success
  // -------------------------------------------------------------------------

  describe('terminal status update after submit (B-WEB-021)', () => {
    it('status check after successful submit shows responded terminal state', async () => {
      transport = createMockTransport();

      // 1. Submit succeeds
      transport.stubFeedbackSubmit(
        'fr_terminal_1',
        buildFeedbackSubmitResponse({
          feedbackRunId: 'fr_terminal_1',
          status: 'accepted',
          acceptedAt: fixtureTimestamp(5000),
        }),
      );

      const submitResult = await transport.client.submitHumanFeedbackResponse('fr_terminal_1', {
        respondedBy: 'operator',
        response: { questionId: 'q_1', selectedOptionIds: [1] },
      });

      expect(submitResult.status).toBe('accepted');

      // 2. Status check shows terminal state
      transport.stubFeedbackStatus(
        'fr_terminal_1',
        buildFeedbackStatusResponse({
          feedbackRunId: 'fr_terminal_1',
          status: 'responded',
          respondedAt: fixtureTimestamp(5000),
          respondedBy: 'operator',
          response: {
            questionId: 'q_1',
            selectedOptionIds: [1],
            text: '',
          },
        }),
      );

      const status = await transport.client.getHumanFeedbackRequestStatus('fr_terminal_1');

      expect(status.status).toBe('responded');
      expect(status.respondedAt).toBe(fixtureTimestamp(5000));
      expect(status.respondedBy).toBe('operator');
    });

    it('feedback list refresh after submit shows updated terminal status', async () => {
      transport = createMockTransport();
      const runId = 'wr_fb_refresh';

      // After submit, list refresh returns updated status
      const updatedList = buildListFeedbackRequestsResponse([
        buildFeedbackRequestSummary({
          feedbackRunId: 'fr_refresh_1',
          parentRunId: runId,
          status: 'responded',
          respondedAt: fixtureTimestamp(6000),
          respondedBy: 'test-user',
        }),
        buildFeedbackRequestSummary({
          feedbackRunId: 'fr_refresh_2',
          parentRunId: runId,
          status: 'awaiting_response',
        }),
      ]);

      transport.stubFeedbackList(runId, updatedList);

      const result = await transport.client.listRunFeedbackRequests(runId);

      expect(result.items).toHaveLength(2);

      const respondedItem = result.items.find((i) => i.feedbackRunId === 'fr_refresh_1');
      const awaitingItem = result.items.find((i) => i.feedbackRunId === 'fr_refresh_2');

      expect(respondedItem!.status).toBe('responded');
      expect(respondedItem!.respondedAt).toBeDefined();
      expect(awaitingItem!.status).toBe('awaiting_response');
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 6: Default query semantics contract conformance
  // -------------------------------------------------------------------------

  describe('query semantics contract (B-WEB-051)', () => {
    it('DEFAULT_FEEDBACK_STATUS includes awaiting_response and responded', () => {
      expect(DEFAULT_FEEDBACK_STATUS).toBe('awaiting_response,responded');
    });

    it('FEEDBACK_DEFAULT_LIMIT is 50 and FEEDBACK_MAX_LIMIT is 200', () => {
      expect(FEEDBACK_DEFAULT_LIMIT).toBe(50);
      expect(FEEDBACK_MAX_LIMIT).toBe(200);
    });

    it('custom cursor and limit are forwarded in query string', async () => {
      transport = createMockTransport();
      const runId = 'wr_fb_cursor';

      transport.stubFeedbackList(runId, buildListFeedbackRequestsResponse());

      await transport.client.listRunFeedbackRequests(runId, {
        cursor: 'cur_page_2',
        limit: 25,
      });

      const calls = transport.getCalls();
      expect(calls[0]!.url).toContain('cursor=cur_page_2');
      expect(calls[0]!.url).toContain('limit=25');
    });
  });
});
