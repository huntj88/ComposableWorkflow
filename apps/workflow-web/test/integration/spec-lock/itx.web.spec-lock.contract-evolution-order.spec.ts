import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const workspaceRoot = resolve(import.meta.dirname, '../../../../..');

const apiTypesIndexPath = resolve(workspaceRoot, 'packages/workflow-api-types/src/index.ts');
const serverSpecPath = resolve(
  workspaceRoot,
  'packages/workflow-server/docs/typescript-server-workflow-spec.md',
);
const webSpecPath = resolve(workspaceRoot, 'apps/workflow-web/docs/workflow-web-spec.md');
const webTransportClientPath = resolve(
  workspaceRoot,
  'apps/workflow-web/src/transport/workflowApiClient.ts',
);

describe('integration.spec-lock.contract-evolution-order', () => {
  it('locks evolution order as workflow-api-types -> server -> web docs and web transport usage', () => {
    const apiTypesIndex = readFileSync(apiTypesIndexPath, 'utf8');
    const serverSpec = readFileSync(serverSpecPath, 'utf8');
    const webSpec = readFileSync(webSpecPath, 'utf8');
    const webTransportClient = readFileSync(webTransportClientPath, 'utf8');

    expect(apiTypesIndex).toContain('runSummaryResponseSchema');
    expect(apiTypesIndex).toContain('submitHumanFeedbackResponseConflictSchema');

    expect(serverSpec).toContain('## 6.9.1 Web SPA Endpoint Contract Lock');
    expect(serverSpec).toContain('must match web spec Section 6.2 exactly');
    expect(serverSpec).toContain('must import endpoint request/response/query/event contracts');

    expect(webSpec).toContain(
      'Contract evolution order: `packages/workflow-api-types` -> server spec + server handlers -> web spec + web client usage.',
    );

    expect(webTransportClient).toContain("from '@composable-workflow/workflow-api-types'");
    expect(webTransportClient).toContain("const API_BASE = '/api/v1'");

    const apiImportIndex = webTransportClient.indexOf(
      "from '@composable-workflow/workflow-api-types'",
    );
    const localImportIndex = webTransportClient.indexOf("from './errors'");
    expect(apiImportIndex).toBeGreaterThanOrEqual(0);
    expect(localImportIndex).toBeGreaterThan(apiImportIndex);
  });
});
