/**
 * ITX-WEB-012: Submit 400/409 and success semantics are deterministic.
 *
 * B-WEB-012: Feedback submit handles 3 outcomes: success, validation (400), conflict (409).
 *
 * Validates that:
 * - Successful submit returns SubmitHumanFeedbackResponseResponse with acceptedAt.
 * - 400 validation failure raises WorkflowPanelError with details.
 * - 409 conflict raises WorkflowPanelError with feedbackConflict.
 * - Transport client sends correct submit endpoint and body.
 * - Error status classification is deterministic for 400 and 409.
 */

import { describe, expect, it } from 'vitest';

import { createWorkflowApiClient } from '../../../src/transport/workflowApiClient';
import { WorkflowPanelError, parsePanelErrorResponse } from '../../../src/transport/errors';
import { classifyErrorStatus } from '../../../src/theme/tokens';
import {
  buildFeedbackSubmitResponse,
  buildFeedbackRequestSummary,
} from '../fixtures/workflowFixtures';

describe('integration.feedback.ITX-WEB-012', () => {
  it('successful submit returns response with acceptedAt', async () => {
    const submitResponse = buildFeedbackSubmitResponse();
    const client = createWorkflowApiClient({
      fetchImpl: async () => new Response(JSON.stringify(submitResponse), { status: 200 }),
      eventSourceFactory: (url) => ({ url, close() {} }) as unknown as EventSource,
    });

    const result = await client.submitHumanFeedbackResponse('fb_012_1', {
      respondedBy: 'test-user',
      response: { questionId: 'q_1', selectedOptionIds: [1], text: 'Approved' },
    });

    expect(result.acceptedAt).toBeDefined();
    expect(typeof result.acceptedAt).toBe('string');
    expect(result.status).toBe('accepted');
  });

  it('transport client sends POST to /api/v1/human-feedback/requests/:feedbackRunId/respond', async () => {
    let capturedUrl = '';
    let capturedMethod = '';
    let capturedBody = '';

    const client = createWorkflowApiClient({
      fetchImpl: async (input, init) => {
        capturedUrl = String(input);
        capturedMethod = (init?.method ?? 'GET').toUpperCase();
        capturedBody = typeof init?.body === 'string' ? init.body : '';
        return new Response(JSON.stringify(buildFeedbackSubmitResponse()), { status: 200 });
      },
      eventSourceFactory: (url) => ({ url, close() {} }) as unknown as EventSource,
    });

    await client.submitHumanFeedbackResponse('fb_012_2', {
      respondedBy: 'agent',
      response: { questionId: 'q_2' },
    });

    expect(capturedUrl).toBe('/api/v1/human-feedback/requests/fb_012_2/respond');
    expect(capturedMethod).toBe('POST');
    expect(capturedBody.length).toBeGreaterThan(0);

    const parsed = JSON.parse(capturedBody);
    expect(parsed.respondedBy).toBe('agent');
    expect(parsed.response.questionId).toBe('q_2');
  });

  it('transport client supports text-only feedback payloads', async () => {
    let capturedBody = '';

    const client = createWorkflowApiClient({
      fetchImpl: async (_input, init) => {
        capturedBody = typeof init?.body === 'string' ? init.body : '';
        return new Response(JSON.stringify(buildFeedbackSubmitResponse()), { status: 200 });
      },
      eventSourceFactory: (url) => ({ url, close() {} }) as unknown as EventSource,
    });

    await client.submitHumanFeedbackResponse('fb_012_text_only', {
      respondedBy: 'agent',
      response: { questionId: 'q_text_only', text: 'Please keep the API surface flexible.' },
    });

    const parsed = JSON.parse(capturedBody);
    expect(parsed.response.questionId).toBe('q_text_only');
    expect(parsed.response.text).toBe('Please keep the API surface flexible.');
    expect(parsed.response).not.toHaveProperty('selectedOptionIds');
  });

  it('400 validation failure produces panel error with status 400', async () => {
    const errorPayload = {
      code: 'VALIDATION_ERROR',
      message: 'selectedOptionIds must contain at least one option',
      requestId: 'req_012_1',
      details: { selectedOptionIds: 'Required field' },
    };

    const response = new Response(JSON.stringify(errorPayload), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });

    const error = await parsePanelErrorResponse(response, {
      panel: 'feedback-submit',
      fallbackMessage: 'Failed to submit feedback.',
    });

    expect(error).toBeInstanceOf(WorkflowPanelError);
    expect(error.status).toBe(400);
    expect(error.panel).toBe('feedback-submit');
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.message).toContain('selectedOptionIds');
  });

  it('409 conflict failure produces panel error with feedback conflict details', async () => {
    const conflictPayload = {
      feedbackRunId: 'fb_012_conflict',
      status: 'responded',
      respondedAt: '2026-03-05T00:01:00.000Z',
      cancelledAt: null,
    };

    const response = new Response(JSON.stringify(conflictPayload), {
      status: 409,
      headers: { 'Content-Type': 'application/json' },
    });

    const error = await parsePanelErrorResponse(response, {
      panel: 'feedback-submit',
      fallbackMessage: 'Failed to submit feedback.',
      parseFeedbackConflict: true,
    });

    expect(error).toBeInstanceOf(WorkflowPanelError);
    expect(error.status).toBe(409);
    expect(error.feedbackConflict).not.toBeNull();
    expect(error.feedbackConflict!.status).toBe('responded');
    expect(error.feedbackConflict!.respondedAt).toBe('2026-03-05T00:01:00.000Z');
  });

  it('error status classification is deterministic for 400 and 409', () => {
    expect(classifyErrorStatus(400)).toBe('validation');
    expect(classifyErrorStatus(409)).toBe('conflict');
  });

  it('WorkflowPanelError carries all diagnostic fields for feedback submit errors', () => {
    const error = new WorkflowPanelError({
      panel: 'feedback-submit',
      status: 400,
      message: 'Validation failed',
      code: 'VALIDATION_ERROR',
      requestId: 'req_012_2',
      details: { text: 'Too short' },
    });

    expect(error.panel).toBe('feedback-submit');
    expect(error.status).toBe(400);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.requestId).toBe('req_012_2');
    expect(error.details).toEqual({ text: 'Too short' });
    expect(error.feedbackConflict).toBeNull();
  });

  it('fixture feedback submit response has required output fields', () => {
    const response = buildFeedbackSubmitResponse();
    expect(response.status).toBeDefined();
    expect(response.acceptedAt).toBeDefined();
    expect(typeof response.acceptedAt).toBe('string');
  });

  it('fixture feedback request summary has options for submit validation', () => {
    const item = buildFeedbackRequestSummary();
    expect(item.feedbackRunId).toBeDefined();
    expect(item.questionId).toBeDefined();
    expect(item.options).toBeDefined();
    expect(Array.isArray(item.options)).toBe(true);
    expect(item.options.length).toBeGreaterThan(0);

    for (const option of item.options!) {
      expect(typeof option.id).toBe('number');
      expect(typeof option.label).toBe('string');
    }
  });
});
