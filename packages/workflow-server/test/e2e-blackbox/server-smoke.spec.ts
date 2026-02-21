import { describe, expect, it } from 'vitest';

const describeIfBlackbox =
  process.env.WORKFLOW_BLACKBOX_REQUIRED === 'true' ? describe : describe.skip;

const resolveBaseUrl = (): string => {
  if (process.env.WORKFLOW_BLACKBOX_BASE_URL) {
    return process.env.WORKFLOW_BLACKBOX_BASE_URL;
  }

  if (process.env.WORKFLOW_API_BASE_URL) {
    return process.env.WORKFLOW_API_BASE_URL;
  }

  const port = process.env.WORKFLOW_SERVER_PORT ?? '3000';
  return `http://127.0.0.1:${port}`;
};

const requestJson = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`${resolveBaseUrl()}${path}`, {
    ...init,
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${path}`);
  }

  return (await response.json()) as T;
};

describeIfBlackbox('e2e.blackbox.server-smoke', () => {
  it('serves production API routes from launched server process', async () => {
    const definition = await requestJson<{
      workflowType: string;
      workflowVersion: string;
      states: string[];
    }>('/api/v1/workflows/definitions/reference.success.v1');

    expect(definition.workflowType).toBe('reference.success.v1');
    expect(definition.workflowVersion).toBe('1.0.0');
    expect(definition.states.length).toBeGreaterThan(0);
  });
});
