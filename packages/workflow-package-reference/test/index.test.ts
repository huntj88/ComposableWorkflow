import { describe, expect, it } from 'vitest';

import manifest, { REFERENCE_WORKFLOW_TYPES } from '../src/manifest.js';

describe('workflow-package-reference', () => {
  it('exposes single manifest entrypoint', () => {
    expect(manifest.packageName).toBe('@composable-workflow/workflow-package-reference');
    expect(manifest.workflows).toHaveLength(REFERENCE_WORKFLOW_TYPES.length);
    expect(manifest.workflows.map((workflow) => workflow.workflowType)).toEqual(
      REFERENCE_WORKFLOW_TYPES,
    );
  });
});
