import { describe, expect, it } from 'vitest';

import manifest, { APP_BUILDER_WORKFLOW_TYPES } from '../src/manifest.js';

describe('workflow-app-builder', () => {
  it('exposes single manifest entrypoint', () => {
    expect(manifest.packageName).toBe('@composable-workflow/workflow-app-builder');
    expect(manifest.workflows).toHaveLength(APP_BUILDER_WORKFLOW_TYPES.length);
    expect(manifest.workflows.map((workflow) => workflow.workflowType)).toEqual(
      APP_BUILDER_WORKFLOW_TYPES,
    );
  });
});
