/**
 * ITX-WEB-003: Panel failure isolation and retry behavior are panel-scoped.
 *
 * B-WEB-005: Panel errors are isolated; one panel failure does not cascade.
 *
 * Validates that:
 * - WorkflowPanelError carries panel scope for targeted retry.
 * - parsePanelErrorResponse isolates errors to the requesting panel.
 * - Error envelope parsing extracts code, message, requestId without cascading.
 * - Different panel scopes produce independently scoped errors.
 * - Error category classification is deterministic for 400, 409, 500, and unknown.
 */

import { describe, expect, it } from 'vitest';

import {
  WorkflowPanelError,
  parsePanelErrorResponse,
  tryParseErrorEnvelope,
  formatErrorEnvelopeMessage,
} from '../../../src/transport/errors';
import { classifyErrorStatus, resolveErrorToken } from '../../../src/theme/tokens';

describe('integration.routes.ITX-WEB-003', () => {
  it('WorkflowPanelError carries panel scope for targeted retry', () => {
    const error = new WorkflowPanelError({
      panel: 'events',
      status: 500,
      message: 'Internal server error',
      code: 'INTERNAL_ERROR',
      requestId: 'req_003_1',
    });

    expect(error.panel).toBe('events');
    expect(error.status).toBe(500);
    expect(error.message).toBe('Internal server error');
    expect(error.code).toBe('INTERNAL_ERROR');
    expect(error.requestId).toBe('req_003_1');
    expect(error.name).toBe('WorkflowPanelError');
    expect(error).toBeInstanceOf(Error);
  });

  it('different panel scopes produce independently scoped errors', () => {
    const summaryError = new WorkflowPanelError({
      panel: 'summary',
      status: 500,
      message: 'Summary failed',
    });
    const eventsError = new WorkflowPanelError({
      panel: 'events',
      status: 502,
      message: 'Events failed',
    });
    const logsError = new WorkflowPanelError({
      panel: 'logs',
      status: 503,
      message: 'Logs failed',
    });

    expect(summaryError.panel).toBe('summary');
    expect(eventsError.panel).toBe('events');
    expect(logsError.panel).toBe('logs');
    expect(summaryError.message).not.toBe(eventsError.message);
    expect(eventsError.message).not.toBe(logsError.message);
  });

  it('parsePanelErrorResponse isolates error to the requesting panel scope', async () => {
    const errorPayload = {
      code: 'RESOURCE_EXHAUSTED',
      message: 'Rate limit exceeded',
      requestId: 'req_003_2',
    };

    const response = new Response(JSON.stringify(errorPayload), {
      status: 429,
      headers: { 'Content-Type': 'application/json' },
    });

    const panelError = await parsePanelErrorResponse(response, {
      panel: 'tree',
      fallbackMessage: 'Failed to load execution tree.',
    });

    expect(panelError.panel).toBe('tree');
    expect(panelError.status).toBe(429);
    expect(panelError.code).toBe('RESOURCE_EXHAUSTED');
    expect(panelError.message).toContain('Rate limit exceeded');
    expect(panelError.requestId).toBe('req_003_2');
  });

  it('parsePanelErrorResponse uses fallback when response body is not valid JSON', async () => {
    const response = new Response('not json', {
      status: 500,
      headers: { 'Content-Type': 'text/plain' },
    });

    const panelError = await parsePanelErrorResponse(response, {
      panel: 'definition',
      fallbackMessage: 'Failed to load workflow definition.',
    });

    expect(panelError.panel).toBe('definition');
    expect(panelError.status).toBe(500);
    expect(panelError.message).toBe('Failed to load workflow definition.');
    expect(panelError.code).toBeNull();
  });

  it('tryParseErrorEnvelope extracts structured error fields', () => {
    const envelope = tryParseErrorEnvelope({
      code: 'NOT_FOUND',
      message: 'Run not found',
      requestId: 'req_003_3',
    });

    expect(envelope).not.toBeNull();
    expect(envelope!.code).toBe('NOT_FOUND');
    expect(envelope!.message).toBe('Run not found');
    expect(envelope!.requestId).toBe('req_003_3');
  });

  it('tryParseErrorEnvelope returns null for non-envelope payloads', () => {
    expect(tryParseErrorEnvelope(null)).toBeNull();
    expect(tryParseErrorEnvelope(undefined)).toBeNull();
    expect(tryParseErrorEnvelope({ unexpected: true })).toBeNull();
    expect(tryParseErrorEnvelope('string')).toBeNull();
  });

  it('formatErrorEnvelopeMessage produces code: message (requestId) format', () => {
    const formatted = formatErrorEnvelopeMessage({
      code: 'VALIDATION_ERROR',
      message: 'Invalid input',
      requestId: 'req_003_4',
    });

    expect(formatted).toBe('VALIDATION_ERROR: Invalid input (req_003_4)');
  });

  it('classifies error status codes deterministically', () => {
    expect(classifyErrorStatus(400)).toBe('validation');
    expect(classifyErrorStatus(409)).toBe('conflict');
    expect(classifyErrorStatus(500)).toBe('transport');
    expect(classifyErrorStatus(502)).toBe('transport');
    expect(classifyErrorStatus(503)).toBe('transport');
    expect(classifyErrorStatus(0)).toBe('transport');
    expect(classifyErrorStatus(401)).toBe('unknown');
    expect(classifyErrorStatus(403)).toBe('unknown');
    expect(classifyErrorStatus(404)).toBe('unknown');
    expect(classifyErrorStatus(429)).toBe('unknown');
  });

  it('resolveErrorToken produces distinct tokens for each error category', () => {
    const validation = resolveErrorToken(400);
    const conflict = resolveErrorToken(409);
    const transport = resolveErrorToken(500);
    const unknown = resolveErrorToken(404);

    expect(validation.label).toBe('Validation Error');
    expect(validation.recoverable).toBe(false);
    expect(conflict.label).toBe('Conflict');
    expect(conflict.recoverable).toBe(false);
    expect(transport.label).toBe('Connection Error');
    expect(transport.recoverable).toBe(true);
    expect(unknown.label).toBe('Unexpected Error');
    expect(unknown.recoverable).toBe(true);
  });
});
