/**
 * ITX-WEB-044: Start workflow happy-path transport and validation contract.
 *
 * B-WEB-057 / B-WEB-058 / B-WEB-009.
 *
 * @vitest-environment jsdom
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { FakeEventSource } from '../harness/mockTransport';
import { renderWebApp } from '../harness/renderWebApp';
import {
  buildDefinitionResponse,
  buildDefinitionSummary,
  buildListDefinitionsResponse,
  buildListFeedbackRequestsResponse,
  buildListRunsResponse,
  buildRunEventsResponse,
  buildRunLogsResponse,
  buildRunSummary,
  buildRunTreeResponse,
  buildStartWorkflowResponse,
} from '../fixtures/workflowFixtures';

// @ts-expect-error testing dependency is available in the workspace test runtime.
import { fireEvent, waitFor, within } from '@testing-library/react';

type RecordedCall = {
  url: string;
  method: string;
  body: string | null;
};

const jsonResponse = (body: unknown, status: number = 200): Response =>
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

const installHappyPathFetch = (startStatus: 200 | 201, runId: string): RecordedCall[] => {
  const calls: RecordedCall[] = [];
  const definitionSummary = buildDefinitionSummary({
    workflowType: 'reference.success.v1',
    workflowVersion: '2.3.4',
  });
  const definitions = buildListDefinitionsResponse([definitionSummary]);
  const startResponse = buildStartWorkflowResponse({
    runId,
    workflowType: definitionSummary.workflowType,
    workflowVersion: definitionSummary.workflowVersion,
  });
  const runSummary = buildRunSummary({
    runId,
    workflowType: definitionSummary.workflowType,
    workflowVersion: definitionSummary.workflowVersion,
  });

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? 'GET').toUpperCase();
      const body = typeof init?.body === 'string' ? init.body : null;
      calls.push({ url, method, body });

      if (url.startsWith('/api/v1/workflows/runs/') && url.endsWith('/tree')) {
        return jsonResponse(
          buildRunTreeResponse({ runId, workflowType: definitionSummary.workflowType }),
        );
      }

      if (url.startsWith('/api/v1/workflows/runs/') && url.includes('/events')) {
        return jsonResponse(buildRunEventsResponse(0));
      }

      if (url.startsWith('/api/v1/workflows/runs/') && url.includes('/logs')) {
        return jsonResponse(buildRunLogsResponse(0));
      }

      if (
        url.startsWith('/api/v1/workflows/runs/') &&
        url.endsWith('/feedback-requests?status=awaiting_response%2Cresponded&limit=50')
      ) {
        return jsonResponse(buildListFeedbackRequestsResponse([]));
      }

      if (url === `/api/v1/workflows/runs/${runId}`) {
        return jsonResponse(runSummary);
      }

      if (url === '/api/v1/workflows/definitions') {
        return jsonResponse(definitions);
      }

      if (
        url ===
        `/api/v1/workflows/definitions/${encodeURIComponent(definitionSummary.workflowType)}`
      ) {
        return jsonResponse(
          buildDefinitionResponse({
            workflowType: definitionSummary.workflowType,
            workflowVersion: definitionSummary.workflowVersion,
          }),
        );
      }

      if (url === '/api/v1/workflows/start' && method === 'POST') {
        return jsonResponse(startResponse, startStatus);
      }

      if (url.startsWith('/api/v1/workflows/runs')) {
        return jsonResponse(buildListRunsResponse([]));
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    }),
  );
  vi.stubGlobal('EventSource', FakeEventSource as unknown as typeof EventSource);

  return calls;
};

describe('integration.start.ITX-WEB-044', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads definitions, enforces JSON gating, and submits shared start DTO fields for 201 responses', async () => {
    installBrowserStubs();
    const calls = installHappyPathFetch(201, 'wr_started_201');
    const app = renderWebApp({ route: '/runs' });

    try {
      const openButton = await app.renderResult.findByRole(
        'button',
        { name: 'Start workflow' },
        { timeout: 10000 },
      );
      fireEvent.click(openButton);

      const dialog = await app.renderResult.findByRole(
        'dialog',
        { name: 'Start workflow' },
        { timeout: 10000 },
      );
      const dialogQueries = within(dialog);
      const submitButton = dialogQueries.getByRole('button', { name: 'Start workflow' });
      const workflowTypeField = dialogQueries.getByLabelText(/Workflow type/i);

      await waitFor(() => {
        expect((workflowTypeField as HTMLSelectElement).disabled).toBe(false);
      });

      const inputField = dialogQueries.getByRole('textbox', { name: /Input JSON/i });
      const idempotencyField = dialogQueries.getByRole('textbox', { name: /Idempotency key/i });
      const metadataField = dialogQueries.getByRole('textbox', { name: /Metadata JSON/i });

      expect((submitButton as HTMLButtonElement).disabled).toBe(true);
      fireEvent.change(workflowTypeField, { target: { value: 'reference.success.v1' } });
      expect((submitButton as HTMLButtonElement).disabled).toBe(true);

      fireEvent.change(inputField, { target: { value: '{"customerId":"cust_123"}' } });
      fireEvent.change(idempotencyField, { target: { value: 'idem-201' } });
      fireEvent.change(metadataField, {
        target: { value: '{"source":"integration-test","priority":1}' },
      });

      await waitFor(() => {
        expect((submitButton as HTMLButtonElement).disabled).toBe(false);
      });

      fireEvent.click(submitButton);

      await app.renderResult.findByRole('heading', { name: 'Run Dashboard' }, { timeout: 10000 });
      await app.renderResult.findByText(/Run: wr_started_201/, undefined, {
        timeout: 10000,
      });

      const startCall = calls.find((call) => call.url === '/api/v1/workflows/start');
      expect(startCall).toBeDefined();
      expect(startCall?.method).toBe('POST');
      expect(JSON.parse(startCall?.body ?? '{}')).toEqual({
        workflowType: 'reference.success.v1',
        input: { customerId: 'cust_123' },
        idempotencyKey: 'idem-201',
        metadata: { source: 'integration-test', priority: 1 },
      });

      expect(calls.some((call) => call.url === '/api/v1/workflows/definitions')).toBe(true);
    } finally {
      app.unmount();
    }
  }, 20000);

  it('navigates to the run detail page when start returns an idempotent 200 response', async () => {
    installBrowserStubs();
    installHappyPathFetch(200, 'wr_existing_200');
    const app = renderWebApp({ route: '/runs' });

    try {
      fireEvent.click(
        await app.renderResult.findByRole('button', { name: 'Start workflow' }, { timeout: 10000 }),
      );

      const dialog = await app.renderResult.findByRole(
        'dialog',
        { name: 'Start workflow' },
        { timeout: 10000 },
      );
      const dialogQueries = within(dialog);

      await waitFor(() => {
        expect((dialogQueries.getByLabelText(/Workflow type/i) as HTMLSelectElement).disabled).toBe(
          false,
        );
      });

      fireEvent.change(dialogQueries.getByLabelText(/Workflow type/i), {
        target: { value: 'reference.success.v1' },
      });
      fireEvent.change(dialogQueries.getByRole('textbox', { name: /Input JSON/i }), {
        target: { value: '{"input":"ok"}' },
      });

      await waitFor(() => {
        expect(
          (dialogQueries.getByRole('button', { name: 'Start workflow' }) as HTMLButtonElement)
            .disabled,
        ).toBe(false);
      });

      fireEvent.click(dialogQueries.getByRole('button', { name: 'Start workflow' }));

      await app.renderResult.findByRole('heading', { name: 'Run Dashboard' }, { timeout: 10000 });
      await app.renderResult.findByText(/Run: wr_existing_200/, undefined, {
        timeout: 10000,
      });
    } finally {
      app.unmount();
    }
  }, 20000);
});
