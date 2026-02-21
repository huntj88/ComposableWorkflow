import { describe, expect, it } from 'vitest';

import { createWorkflowId } from '../src/index.js';

describe('workflow-lib', () => {
  it('creates a workflow id', () => {
    expect(createWorkflowId('wf-1')).toBe('wf-1');
  });
});
