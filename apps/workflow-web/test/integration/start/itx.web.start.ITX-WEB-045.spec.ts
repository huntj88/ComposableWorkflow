/**
 * ITX-WEB-045: Start workflow error handling and keyboard-only completion.
 *
 * B-WEB-059 / B-WEB-060.
 *
 * @vitest-environment jsdom
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { FakeEventSource } from '../harness/mockTransport';
import { renderWebApp } from '../harness/renderWebApp';
import {
  buildDefinitionSummary,
  buildListDefinitionsResponse,
  buildListRunsResponse,
} from '../fixtures/workflowFixtures';

// @ts-expect-error testing dependency is available in the workspace test runtime.
import { fireEvent, waitFor, within } from '@testing-library/react';

const jsonResponse = (body: unknown, status: number): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const installBrowserStubs = (): void => {
  vi.stubGlobal(
    'ResizeObserver',
    class ResizeObserver {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    },
  );
};

const installErrorFlowFetch = (): void => {
  const definitions = buildListDefinitionsResponse([
    buildDefinitionSummary({ workflowType: 'reference.success.v1', workflowVersion: '9.9.9' }),
  ]);
  let startAttempts = 0;

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? 'GET').toUpperCase();

      if (url === '/api/v1/workflows/definitions' && method === 'GET') {
        return jsonResponse(definitions, 200);
      }

      if (url.startsWith('/api/v1/workflows/runs')) {
        return jsonResponse(buildListRunsResponse([]), 200);
      }

      if (url === '/api/v1/workflows/start' && method === 'POST') {
        startAttempts += 1;

        if (startAttempts === 1) {
          return jsonResponse(
            {
              code: 'WORKFLOW_TYPE_NOT_FOUND',
              message: 'Unknown workflow type: reference.success.v1',
              requestId: 'req-404',
            },
            404,
          );
        }

        if (startAttempts === 2) {
          return jsonResponse(
            {
              code: 'INVALID_START_REQUEST',
              message: 'Request body failed validation.',
              requestId: 'req-400',
              details: {
                input: ['Expected object payload for this workflow.'],
                metadata: ['Metadata keys must be lowercase.'],
              },
            },
            400,
          );
        }

        throw new Error('Network unavailable while starting workflow.');
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    }),
  );
  vi.stubGlobal('EventSource', FakeEventSource as unknown as typeof EventSource);
};

describe('integration.start.ITX-WEB-045', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('preserves form state across 404, 400, and transport failures while remaining keyboard-reachable', async () => {
    installBrowserStubs();
    installErrorFlowFetch();
    const app = renderWebApp({ route: '/runs' });

    try {
      const openButton = await app.renderResult.findByRole('button', {
        name: 'Start workflow',
      });
      openButton.focus();
      expect(document.activeElement).toBe(openButton);
      fireEvent.click(openButton);

      const dialog = await app.renderResult.findByRole('dialog', { name: 'Start workflow' });
      const dialogQueries = within(dialog);
      const workflowTypeField = dialogQueries.getByLabelText(/Workflow type/i);

      await waitFor(() => {
        expect((workflowTypeField as HTMLSelectElement).disabled).toBe(false);
      });

      const inputField = dialogQueries.getByRole('textbox', { name: /Input JSON/i });
      const idempotencyField = dialogQueries.getByRole('textbox', {
        name: /Idempotency key/i,
      });
      const metadataField = dialogQueries.getByRole('textbox', { name: /Metadata JSON/i });
      const submitButton = dialogQueries.getByRole('button', { name: 'Start workflow' });

      expect(document.activeElement).toBe(inputField);

      workflowTypeField.focus();
      expect(document.activeElement).toBe(workflowTypeField);
      fireEvent.change(workflowTypeField, { target: { value: 'reference.success.v1' } });

      inputField.focus();
      fireEvent.change(inputField, { target: { value: '{"approval":true}' } });

      idempotencyField.focus();
      fireEvent.change(idempotencyField, { target: { value: 'idem-error-flow' } });

      metadataField.focus();
      fireEvent.change(metadataField, { target: { value: '{"source":"keyboard"}' } });

      await waitFor(() => {
        expect((submitButton as HTMLButtonElement).disabled).toBe(false);
      });

      submitButton.focus();
      expect(document.activeElement).toBe(submitButton);
      fireEvent.click(submitButton);

      await app.renderResult.findByText(/WORKFLOW_TYPE_NOT_FOUND: Unknown workflow type/);
      expect((workflowTypeField as HTMLInputElement).value).toBe('reference.success.v1');
      expect((inputField as HTMLInputElement).value).toBe('{"approval":true}');
      expect((idempotencyField as HTMLInputElement).value).toBe('idem-error-flow');
      expect((metadataField as HTMLInputElement).value).toBe('{"source":"keyboard"}');

      fireEvent.click(submitButton);

      await app.renderResult.findByText(/INVALID_START_REQUEST: Request body failed validation/);
      await app.renderResult.findByText(/Expected object payload for this workflow/);
      await app.renderResult.findByText(/Metadata keys must be lowercase/);
      expect((workflowTypeField as HTMLInputElement).value).toBe('reference.success.v1');
      expect((inputField as HTMLInputElement).value).toBe('{"approval":true}');
      expect((idempotencyField as HTMLInputElement).value).toBe('idem-error-flow');
      expect((metadataField as HTMLInputElement).value).toBe('{"source":"keyboard"}');

      fireEvent.click(submitButton);

      await app.renderResult.findByText('Network unavailable while starting workflow.');
      expect(dialogQueries.getByRole('button', { name: 'Retry submit' })).toBeDefined();
      expect((workflowTypeField as HTMLInputElement).value).toBe('reference.success.v1');
      expect((inputField as HTMLInputElement).value).toBe('{"approval":true}');
      expect((idempotencyField as HTMLInputElement).value).toBe('idem-error-flow');
      expect((metadataField as HTMLInputElement).value).toBe('{"source":"keyboard"}');
    } finally {
      app.unmount();
    }
  }, 20000);
});
