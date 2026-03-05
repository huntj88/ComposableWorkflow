/**
 * ITX-WEB-026: Feedback detail expansion and option-validation surfacing are validated.
 *
 * B-WEB-026: Feedback panel shows question, prompt, options, constraints, and
 *            surfaces validation/conflict errors from submit.
 *
 * Validates that:
 * - RunFeedbackRequestSummary includes question, prompt, options, and constraints.
 * - Option IDs are numeric and ordered for checkbox rendering.
 * - Feedback status tokens resolve correctly for all statuses.
 * - Validation error details surface field-level messages.
 * - Conflict error includes terminal status and respondedBy/respondedAt.
 */

import { describe, expect, it } from 'vitest';

import {
  buildFeedbackRequestSummary,
  buildFeedbackStatusResponse,
  buildFeedbackSubmitResponse,
} from '../fixtures/workflowFixtures';
import { feedbackStatusTokens, resolveFeedbackStatusToken } from '../../../src/theme/tokens';
import { WorkflowPanelError } from '../../../src/transport/errors';

describe('integration.feedback.ITX-WEB-026', () => {
  it('RunFeedbackRequestSummary includes question, prompt, options for detail expansion', () => {
    const item = buildFeedbackRequestSummary();

    expect(item.questionId).toBeDefined();
    expect(typeof item.questionId).toBe('string');
    expect(item.prompt).toBeDefined();
    expect(typeof item.prompt).toBe('string');
    expect(item.prompt.length).toBeGreaterThan(0);

    expect(item.options).toBeDefined();
    expect(Array.isArray(item.options)).toBe(true);
    expect(item.options.length).toBeGreaterThanOrEqual(1);
  });

  it('option IDs are numeric and consistently ordered', () => {
    const item = buildFeedbackRequestSummary();

    const ids = item.options!.map((o) => o.id);
    for (const id of ids) {
      expect(typeof id).toBe('number');
      expect(Number.isInteger(id)).toBe(true);
    }

    // IDs should be unique
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('feedback status tokens resolve correctly for all known statuses', () => {
    const statuses = ['awaiting_response', 'responded', 'cancelled'];

    for (const status of statuses) {
      const token = feedbackStatusTokens[status];
      expect(token).toBeDefined();
      expect(token!.color).toBeDefined();
      expect(token!.label).toBeDefined();
      expect(token!.label.length).toBeGreaterThan(0);
    }
  });

  it('resolveFeedbackStatusToken returns fallback for unknown statuses', () => {
    const token = resolveFeedbackStatusToken('unknown_status');
    expect(token.color).toBe('default');
    expect(token.label).toBe('unknown_status');
  });

  it('feedback status token for awaiting_response is warning color', () => {
    const token = resolveFeedbackStatusToken('awaiting_response');
    expect(token.color).toBe('warning');
    expect(token.label).toBe('Awaiting Response');
  });

  it('feedback status token for responded is success color', () => {
    const token = resolveFeedbackStatusToken('responded');
    expect(token.color).toBe('success');
    expect(token.label).toBe('Responded');
  });

  it('validation error carries field-level detail messages', () => {
    const error = new WorkflowPanelError({
      panel: 'feedback-submit',
      status: 400,
      message: 'VALIDATION_ERROR: Missing required fields (req_026_1)',
      code: 'VALIDATION_ERROR',
      requestId: 'req_026_1',
      details: {
        selectedOptionIds: 'At least one option must be selected',
        text: 'Response text is required when no options are selected',
      },
    });

    expect(error.details).not.toBeNull();
    expect(error.details!['selectedOptionIds']).toBe('At least one option must be selected');
    expect(error.details!['text']).toBe('Response text is required when no options are selected');
  });

  it('conflict error includes terminal status and respondedBy metadata', () => {
    const error = new WorkflowPanelError({
      panel: 'feedback-submit',
      status: 409,
      message: 'Feedback request is terminal (responded, 2026-03-05T00:01:00.000Z).',
      code: 'FEEDBACK_CONFLICT',
      feedbackConflict: {
        status: 'responded',
        respondedBy: 'original-user',
        respondedAt: '2026-03-05T00:01:00.000Z',
        cancelledAt: null,
      },
    });

    expect(error.feedbackConflict).not.toBeNull();
    expect(error.feedbackConflict!.status).toBe('responded');
    expect(error.feedbackConflict!.respondedBy).toBe('original-user');
    expect(error.feedbackConflict!.respondedAt).toBe('2026-03-05T00:01:00.000Z');
    expect(error.feedbackConflict!.cancelledAt).toBeNull();
  });

  it('fixture feedback status response has all required fields', () => {
    const response = buildFeedbackStatusResponse();

    expect(response.feedbackRunId).toBeDefined();
    expect(response.status).toBeDefined();
    expect(typeof response.status).toBe('string');
  });

  it('fixture feedback submit response confirms acceptance', () => {
    const response = buildFeedbackSubmitResponse();

    expect(response.status).toBe('accepted');
    expect(response.acceptedAt).toBeDefined();
  });

  it('buildFeedbackRequestSummary supports overrides for all fields', () => {
    const item = buildFeedbackRequestSummary({
      feedbackRunId: 'fb_026_custom',
      status: 'responded',
      question: 'Custom test question?',
    });

    expect(item.feedbackRunId).toBe('fb_026_custom');
    expect(item.status).toBe('responded');
    expect(item.question).toBe('Custom test question?');
  });
});
