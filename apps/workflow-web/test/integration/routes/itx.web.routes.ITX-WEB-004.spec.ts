/**
 * ITX-WEB-004: Run-summary 404 not-found behavior is verified.
 *
 * B-WEB-006: Run not found on summary → isNotFound=true, dashboard shows not-found state.
 *
 * Validates that:
 * - A 404 response from the summary endpoint raises an error with status 404.
 * - Error parsing extracts the 404 status on the error object.
 * - Transport client rejects with parseable error for 404 responses.
 * - Error envelope from a 404 is interpretable as not-found.
 * - Panel error carries correct panel scope for a summary 404.
 */

import { describe, expect, it } from 'vitest';

import { createWorkflowApiClient } from '../../../src/transport/workflowApiClient';
import { parsePanelErrorResponse, tryParseErrorEnvelope } from '../../../src/transport/errors';

describe('integration.routes.ITX-WEB-004', () => {
  it('transport client rejects getRunSummary with error for 404 response', async () => {
    const client = createWorkflowApiClient({
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            code: 'NOT_FOUND',
            message: 'Run wr_missing_1 not found',
            requestId: 'req_004_1',
          }),
          { status: 404, headers: { 'Content-Type': 'application/json' } },
        ),
      eventSourceFactory: (url) => ({ url, close() {} }) as unknown as EventSource,
    });

    await expect(client.getRunSummary('wr_missing_1')).rejects.toThrow();
  });

  it('parsePanelErrorResponse extracts 404 status for summary panel scope', async () => {
    const response = new Response(
      JSON.stringify({
        code: 'NOT_FOUND',
        message: 'Run wr_missing_2 not found',
        requestId: 'req_004_2',
      }),
      { status: 404, headers: { 'Content-Type': 'application/json' } },
    );

    const error = await parsePanelErrorResponse(response, {
      panel: 'summary',
      fallbackMessage: 'Failed to load run summary.',
    });

    expect(error.panel).toBe('summary');
    expect(error.status).toBe(404);
    expect(error.code).toBe('NOT_FOUND');
    expect(error.message).toContain('Run wr_missing_2 not found');
  });

  it('error envelope from 404 is interpretable as not-found', () => {
    const envelope = tryParseErrorEnvelope({
      code: 'NOT_FOUND',
      message: 'Workflow run does not exist',
      requestId: 'req_004_3',
    });

    expect(envelope).not.toBeNull();
    expect(envelope!.code).toBe('NOT_FOUND');
    expect(envelope!.message).toBe('Workflow run does not exist');
  });

  it('transport client rejects getRunTree with error for non-existent run', async () => {
    const client = createWorkflowApiClient({
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            code: 'NOT_FOUND',
            message: 'Run not found',
            requestId: 'req_004_4',
          }),
          { status: 404, headers: { 'Content-Type': 'application/json' } },
        ),
      eventSourceFactory: (url) => ({ url, close() {} }) as unknown as EventSource,
    });

    await expect(client.getRunTree('wr_missing_3')).rejects.toThrow();
  });

  it('404 error object preserves status for not-found detection in hook', async () => {
    const client = createWorkflowApiClient({
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            code: 'NOT_FOUND',
            message: 'Not found',
            requestId: 'req_004_5',
          }),
          { status: 404, headers: { 'Content-Type': 'application/json' } },
        ),
      eventSourceFactory: (url) => ({ url, close() {} }) as unknown as EventSource,
    });

    try {
      await client.getRunSummary('wr_missing_4');
      expect.unreachable('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error & { status?: number }).status).toBe(404);
    }
  });

  it('fallback message is used when 404 response body lacks valid error envelope', async () => {
    const response = new Response('', {
      status: 404,
      headers: { 'Content-Type': 'text/plain' },
    });

    const error = await parsePanelErrorResponse(response, {
      panel: 'summary',
      fallbackMessage: 'Run not found. Check the run ID.',
    });

    expect(error.status).toBe(404);
    expect(error.message).toBe('Run not found. Check the run ID.');
    expect(error.code).toBeNull();
  });
});
