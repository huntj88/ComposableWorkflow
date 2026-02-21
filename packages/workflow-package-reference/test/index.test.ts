import { describe, expect, it } from 'vitest';

import { referenceWorkflowPackageName } from '../src/index.js';

describe('workflow-package-reference', () => {
  it('exposes package name', () => {
    expect(referenceWorkflowPackageName).toBe('reference-workflow');
  });
});
