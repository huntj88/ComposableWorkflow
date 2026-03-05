/**
 * ITX-WEB-041: Shared error-envelope and feedback-conflict rendering is enforced.
 *
 * Validates that:
 * - parsePanelErrorResponse extracts ErrorEnvelope fields from JSON response.
 * - WorkflowPanelError carries panel, status, code, requestId, details.
 * - 409 feedback conflict is parsed into feedbackConflict property.
 * - Non-JSON responses fall back to fallbackMessage.
 * - tryParseErrorEnvelope / formatErrorEnvelopeMessage work correctly.
 */

import { describe, expect, it } from 'vitest';

import {
  WorkflowPanelError,
  parsePanelErrorResponse,
  tryParseErrorEnvelope,
  formatErrorEnvelopeMessage,
} from '../../../src/transport/errors';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const textResponse = (status: number, body: string): Response => new Response(body, { status });

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('integration.transport.ITX-WEB-041', () => {
  describe('error envelope parsing', () => {
    it('extracts code, message, requestId from valid envelope', async () => {
      const envelope = {
        code: 'RUN_NOT_FOUND',
        message: 'Run wr_041 not found',
        requestId: 'req_abc',
        details: { runId: 'wr_041' },
      };

      const error = await parsePanelErrorResponse(jsonResponse(404, envelope), {
        panel: 'summary',
        fallbackMessage: 'Failed',
      });

      expect(error).toBeInstanceOf(WorkflowPanelError);
      expect(error.panel).toBe('summary');
      expect(error.status).toBe(404);
      expect(error.code).toBe('RUN_NOT_FOUND');
      expect(error.requestId).toBe('req_abc');
      expect(error.message).toContain('RUN_NOT_FOUND');
      expect(error.message).toContain('Run wr_041 not found');
    });

    it('falls back to fallbackMessage for non-JSON response', async () => {
      const error = await parsePanelErrorResponse(textResponse(500, 'Internal Server Error'), {
        panel: 'events',
        fallbackMessage: 'Request failed (500)',
      });

      expect(error.status).toBe(500);
      expect(error.message).toBe('Request failed (500)');
      expect(error.code).toBeNull();
      expect(error.requestId).toBeNull();
    });

    it('falls back for JSON that does not match envelope schema', async () => {
      const error = await parsePanelErrorResponse(jsonResponse(400, { error: 'bad request' }), {
        panel: 'logs',
        fallbackMessage: 'Bad request',
      });

      expect(error.message).toBe('Bad request');
      expect(error.code).toBeNull();
    });
  });

  describe('feedback conflict (409)', () => {
    it('parses 409 feedback conflict with respondedAt', async () => {
      const conflict = {
        feedbackRunId: 'fr_041',
        status: 'responded',
        respondedAt: '2026-03-05T00:01:00.000Z',
        cancelledAt: null,
        respondedBy: 'user@example.com',
      };

      const error = await parsePanelErrorResponse(jsonResponse(409, conflict), {
        panel: 'feedback-submit',
        fallbackMessage: 'Conflict',
        parseFeedbackConflict: true,
      });

      expect(error.status).toBe(409);
      expect(error.code).toBe('FEEDBACK_CONFLICT');
      expect(error.feedbackConflict).toBeDefined();
      expect(error.feedbackConflict?.status).toBe('responded');
      expect(error.feedbackConflict?.respondedAt).toBe('2026-03-05T00:01:00.000Z');
    });

    it('409 without parseFeedbackConflict falls back to envelope parsing', async () => {
      const envelope = {
        code: 'CONFLICT',
        message: 'Conflict occurred',
        requestId: 'req_conflict',
      };

      const error = await parsePanelErrorResponse(jsonResponse(409, envelope), {
        panel: 'summary',
        fallbackMessage: 'Conflict',
      });

      // parseFeedbackConflict not set, should parse as regular envelope
      expect(error.code).toBe('CONFLICT');
      expect(error.feedbackConflict).toBeNull();
    });
  });

  describe('tryParseErrorEnvelope', () => {
    it('returns envelope for valid payload', () => {
      const result = tryParseErrorEnvelope({
        code: 'ERR',
        message: 'fail',
        requestId: 'r1',
      });
      expect(result).toEqual({
        code: 'ERR',
        message: 'fail',
        requestId: 'r1',
      });
    });

    it('returns null for invalid payload', () => {
      expect(tryParseErrorEnvelope(null)).toBeNull();
      expect(tryParseErrorEnvelope({ random: 'data' })).toBeNull();
    });
  });

  describe('formatErrorEnvelopeMessage', () => {
    it('formats code, message, and requestId', () => {
      const formatted = formatErrorEnvelopeMessage({
        code: 'RUN_NOT_FOUND',
        message: 'Not found',
        requestId: 'req_1',
      });
      expect(formatted).toBe('RUN_NOT_FOUND: Not found (req_1)');
    });
  });

  describe('WorkflowPanelError properties', () => {
    it('has expected error name', () => {
      const error = new WorkflowPanelError({
        panel: 'runs',
        status: 500,
        message: 'Server error',
      });
      expect(error.name).toBe('WorkflowPanelError');
      expect(error).toBeInstanceOf(Error);
    });

    it('defaults nullable fields to null', () => {
      const error = new WorkflowPanelError({
        panel: 'runs',
        status: 400,
        message: 'Bad request',
      });
      expect(error.code).toBeNull();
      expect(error.requestId).toBeNull();
      expect(error.details).toBeNull();
      expect(error.feedbackConflict).toBeNull();
    });
  });
});
