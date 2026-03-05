import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  errorEnvelopeSchema,
  submitHumanFeedbackResponseConflictSchema,
} from '@composable-workflow/workflow-api-types';
import { describe, expect, it } from 'vitest';

interface ErrorContractDescriptor {
  errorEnvelopeFields: string[];
  references400and404: boolean;
  references409ConflictContract: boolean;
  referencesTerminalMetadata: boolean;
}

const repoRoot = resolve(fileURLToPath(new URL('../../../../../', import.meta.url)));
const serverSpecPath = resolve(
  repoRoot,
  'packages/workflow-server/docs/typescript-server-workflow-spec.md',
);
const webSpecPath = resolve(repoRoot, 'apps/workflow-web/docs/workflow-web-spec.md');

const extractSection = (params: { markdownPath: string; sectionHeadingPrefix: string }): string => {
  const markdown = readFileSync(params.markdownPath, 'utf8');
  const lines = markdown.split(/\r?\n/u);
  const sectionStart = lines.findIndex((line) => line.startsWith(params.sectionHeadingPrefix));
  expect(sectionStart).toBeGreaterThanOrEqual(0);

  const nextSectionIndex = lines.findIndex(
    (line, index) => index > sectionStart && line.startsWith('## '),
  );

  const sectionEndExclusive = nextSectionIndex === -1 ? lines.length : nextSectionIndex;
  return lines.slice(sectionStart, sectionEndExclusive).join('\n');
};

const parseErrorEnvelopeFields = (sectionText: string): string[] => {
  const interfaceMatch = /interface\s+ErrorEnvelope\s*\{([\s\S]*?)\}/u.exec(sectionText);
  const inlineMatch = /ErrorEnvelope\s*=\s*\{([^}]*)\}/u.exec(sectionText);
  const body = interfaceMatch?.[1] ?? inlineMatch?.[1];
  expect(body).toBeDefined();

  const fieldMatches = Array.from((body as string).matchAll(/\b([A-Za-z][A-Za-z0-9]*)\??\s*:/gu));
  return [...new Set(fieldMatches.map((match) => match[1]))].sort((left, right) =>
    left.localeCompare(right),
  );
};

const toDescriptor = (sectionText: string): ErrorContractDescriptor => {
  const normalized = sectionText.replace(/\s+/gu, ' ').toLowerCase();

  return {
    errorEnvelopeFields: parseErrorEnvelopeFields(sectionText),
    references400and404: /400.*404|404.*400/u.test(normalized),
    references409ConflictContract:
      /409/u.test(normalized) && /submithumanfeedbackresponseconflict/u.test(normalized),
    referencesTerminalMetadata: /respondedat.*cancelledat|cancelledat.*respondedat/u.test(
      normalized,
    ),
  };
};

const throwDrift = (
  message: string,
  left: ErrorContractDescriptor,
  right: ErrorContractDescriptor,
) => {
  throw new Error(
    [
      message,
      `Left descriptor: ${JSON.stringify(left, null, 2)}`,
      `Right descriptor: ${JSON.stringify(right, null, 2)}`,
    ].join('\n'),
  );
};

const getZodObjectKeys = (schema: unknown): string[] => {
  const recordSchema = schema as {
    shape?: Record<string, unknown>;
    _def?: { shape?: (() => Record<string, unknown>) | Record<string, unknown> };
  };

  const directShape = recordSchema.shape;
  if (directShape && typeof directShape === 'object') {
    return Object.keys(directShape);
  }

  const defShape = recordSchema._def?.shape;
  if (typeof defShape === 'function') {
    return Object.keys(defShape());
  }

  if (defShape && typeof defShape === 'object') {
    return Object.keys(defShape);
  }

  throw new Error('Unable to read object schema keys from shared contract export');
};

describe('integration.contract.error-envelope-contract-lock-drift', () => {
  it('ITX-034 / B-CONTRACT-006 keeps error contract semantics synchronized across server spec, web spec, and shared exports', () => {
    const server80 = extractSection({
      markdownPath: serverSpecPath,
      sectionHeadingPrefix: '## 8.0 Error Envelope Contract (Normative)',
    });
    const server810 = extractSection({
      markdownPath: serverSpecPath,
      sectionHeadingPrefix: '## 8.10 Submit Human Feedback Response',
    });
    const web68 = extractSection({
      markdownPath: webSpecPath,
      sectionHeadingPrefix: '### 6.8 Error Contract Handling (Normative)',
    });

    const serverDescriptor = toDescriptor(`${server80}\n${server810}`);
    const webDescriptor = toDescriptor(web68);

    if (JSON.stringify(serverDescriptor) !== JSON.stringify(webDescriptor)) {
      throwDrift(
        'Error-contract drift detected between packages/workflow-server/docs/typescript-server-workflow-spec.md (8.0/8.10) and apps/workflow-web/docs/workflow-web-spec.md (6.8).',
        serverDescriptor,
        webDescriptor,
      );
    }

    const sharedEnvelopeFields = getZodObjectKeys(errorEnvelopeSchema).sort((left, right) =>
      left.localeCompare(right),
    );
    const sharedConflictFields = getZodObjectKeys(submitHumanFeedbackResponseConflictSchema);

    expect(sharedEnvelopeFields).toEqual(serverDescriptor.errorEnvelopeFields);
    expect(sharedEnvelopeFields).toEqual(webDescriptor.errorEnvelopeFields);

    expect(
      errorEnvelopeSchema.safeParse({ code: 'X', message: 'm', requestId: 'req_1' }).success,
    ).toBe(true);
    expect(errorEnvelopeSchema.safeParse({ message: 'm', requestId: 'req_1' }).success).toBe(false);
    expect(errorEnvelopeSchema.safeParse({ code: 'X', requestId: 'req_1' }).success).toBe(false);
    expect(errorEnvelopeSchema.safeParse({ code: 'X', message: 'm' }).success).toBe(false);

    expect(sharedConflictFields).toContain('status');
    expect(sharedConflictFields).toContain('respondedAt');
    expect(sharedConflictFields).toContain('cancelledAt');

    expect(serverDescriptor.references400and404).toBe(true);
    expect(webDescriptor.references400and404).toBe(true);
    expect(serverDescriptor.references409ConflictContract).toBe(true);
    expect(webDescriptor.references409ConflictContract).toBe(true);
    expect(serverDescriptor.referencesTerminalMetadata).toBe(true);
    expect(webDescriptor.referencesTerminalMetadata).toBe(true);
  });
});
