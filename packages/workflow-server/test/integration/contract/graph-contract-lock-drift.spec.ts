import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  runEventsResponseSchema,
  runSummaryResponseSchema,
  workflowDefinitionResponseSchema,
  workflowEventDtoSchema,
  workflowStreamFrameSchema,
} from '@composable-workflow/workflow-api-types';
import { describe, expect, it } from 'vitest';

interface DefinitionContractDescriptor {
  mentionsStableMetadata: boolean;
  mentionsWorkflowIdentityFields: boolean;
  mentionsStateAndTransitionFields: boolean;
  mentionsSharedExportAuthority: boolean;
  mentionsAccessibleMetadataRendering: boolean;
  mentionsVisibleErrorState: boolean;
  mentionsIdentifierPreservation: boolean;
}

interface StaticGraphDefinition {
  workflowType: string;
  workflowVersion: string;
  initialState: string;
  states: string[];
  transitions: Array<{ from: string; to: string; name?: string }>;
}

const repoRoot = resolve(fileURLToPath(new URL('../../../../../', import.meta.url)));
const apiTypesSpecPath = resolve(
  repoRoot,
  'packages/workflow-api-types/docs/workflow-api-types-spec.md',
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

const normalize = (value: string): string => value.replace(/\s+/gu, ' ').toLowerCase();

const toDefinitionDescriptor = (rawText: string): DefinitionContractDescriptor => {
  const text = normalize(rawText);

  return {
    mentionsStableMetadata:
      /stable metadata/u.test(text) ||
      /deterministic definition graph payload/u.test(text) ||
      /stable transition ordering/u.test(text),
    mentionsWorkflowIdentityFields:
      text.includes('workflowtype') &&
      (text.includes('workflowversion') || text.includes('definitionversion')),
    mentionsStateAndTransitionFields:
      (text.includes('states') || text.includes('state inventory')) &&
      (text.includes('transitions') || text.includes('transition inventory')),
    mentionsSharedExportAuthority:
      /shared exports/u.test(text) ||
      /schema shape and field names are exported/u.test(text) ||
      /shared contracts/u.test(text),
    mentionsAccessibleMetadataRendering:
      /accessible metadata lists\/tables/u.test(text) ||
      /lists, tables, or grouped metadata sections/u.test(text),
    mentionsVisibleErrorState:
      /visible definition-view error state/u.test(text) ||
      /visible panel error state with retry/u.test(text),
    mentionsIdentifierPreservation:
      /preserve server-provided identifiers and labels/u.test(text) ||
      /stable identifiers/u.test(text),
  };
};

const getZodObjectKeys = (schema: unknown): string[] => {
  const objectSchema = schema as {
    shape?: Record<string, unknown>;
    _def?: { shape?: (() => Record<string, unknown>) | Record<string, unknown> };
  };

  if (objectSchema.shape && typeof objectSchema.shape === 'object') {
    return Object.keys(objectSchema.shape);
  }

  const shape = objectSchema._def?.shape;
  if (typeof shape === 'function') {
    return Object.keys(shape());
  }

  if (shape && typeof shape === 'object') {
    return Object.keys(shape);
  }

  throw new Error('Unable to inspect shared graph contract schema keys');
};

const pairKey = (from: string, to: string): string => `${from}=>${to}`;

const deriveTransitionIdentity = (
  transitions: Array<{ from: string; to: string; name?: string }>,
): string[] => {
  const pairCounts = new Map<string, number>();
  return transitions.map((transition) => {
    const key = pairKey(transition.from, transition.to);
    const ordinalWithinPair = pairCounts.get(key) ?? 0;
    pairCounts.set(key, ordinalWithinPair + 1);
    return `${transition.from}->${transition.to}#${ordinalWithinPair}:${transition.name ?? ''}`;
  });
};

const assertStaticGraphInvariants = (definition: StaticGraphDefinition): void => {
  const stateSet = new Set(definition.states);
  if (stateSet.size !== definition.states.length) {
    throw new Error('Definition state identifiers must be unique within a version payload');
  }

  if (!stateSet.has(definition.initialState)) {
    throw new Error('Definition initialState does not resolve to a declared state identifier');
  }

  for (const transition of definition.transitions) {
    if (!stateSet.has(transition.from) || !stateSet.has(transition.to)) {
      throw new Error(
        `Transition ${transition.from}->${transition.to} references undeclared state identifiers`,
      );
    }
  }
};

const assertStableIdentityForVersion = (
  previous: StaticGraphDefinition,
  current: StaticGraphDefinition,
): void => {
  if (
    previous.workflowType !== current.workflowType ||
    previous.workflowVersion !== current.workflowVersion
  ) {
    return;
  }

  const previousStates = [...previous.states].sort((left, right) => left.localeCompare(right));
  const currentStates = [...current.states].sort((left, right) => left.localeCompare(right));

  if (JSON.stringify(previousStates) !== JSON.stringify(currentStates)) {
    throw new Error('State identifiers drifted for the same workflowType/workflowVersion');
  }

  const previousTransitions = deriveTransitionIdentity(previous.transitions);
  const currentTransitions = deriveTransitionIdentity(current.transitions);

  if (JSON.stringify(previousTransitions) !== JSON.stringify(currentTransitions)) {
    throw new Error('Transition ordering identity drifted for the same definition version');
  }
};

describe('integration.contract.graph-contract-lock-drift', () => {
  it('ITX-033 / B-CONTRACT-007 keeps definition metadata semantics aligned across web spec and shared contract exports', () => {
    const apiTypesSection51 = extractSection({
      markdownPath: apiTypesSpecPath,
      sectionHeadingPrefix: '### 5.1 Static Graph Schema',
    });
    const apiTypesSection53 = extractSection({
      markdownPath: apiTypesSpecPath,
      sectionHeadingPrefix: '### 5.3 Cross-Spec Graph Contract Lock',
    });
    const webSection66 = extractSection({
      markdownPath: webSpecPath,
      sectionHeadingPrefix: '### 6.6 Definition Metadata Handling (Normative)',
    });
    const webSection85 = extractSection({
      markdownPath: webSpecPath,
      sectionHeadingPrefix: '### 8.5 Definition Metadata Presentation (Normative)',
    });

    const apiTypesDescriptor = toDefinitionDescriptor(`${apiTypesSection51}\n${apiTypesSection53}`);
    const webDescriptor = toDefinitionDescriptor(`${webSection66}\n${webSection85}`);

    expect(apiTypesDescriptor.mentionsStableMetadata).toBe(true);
    expect(webDescriptor.mentionsStableMetadata).toBe(true);
    expect(apiTypesDescriptor.mentionsWorkflowIdentityFields).toBe(true);
    expect(apiTypesDescriptor.mentionsStateAndTransitionFields).toBe(true);
    expect(webDescriptor.mentionsStateAndTransitionFields).toBe(true);
    expect(apiTypesDescriptor.mentionsSharedExportAuthority).toBe(true);
    expect(webDescriptor.mentionsAccessibleMetadataRendering).toBe(true);
    expect(webDescriptor.mentionsVisibleErrorState).toBe(true);
    expect(webDescriptor.mentionsIdentifierPreservation).toBe(true);

    const definitionKeys = getZodObjectKeys(workflowDefinitionResponseSchema);
    const runSummaryKeys = getZodObjectKeys(runSummaryResponseSchema);
    const runEventsKeys = getZodObjectKeys(runEventsResponseSchema);
    const eventDtoKeys = getZodObjectKeys(workflowEventDtoSchema);
    const streamFrameKeys = getZodObjectKeys(workflowStreamFrameSchema);

    expect(definitionKeys).toContain('workflowType');
    expect(definitionKeys).toContain('workflowVersion');
    expect(definitionKeys).toContain('states');
    expect(definitionKeys).toContain('transitions');

    expect(runSummaryKeys).toContain('currentState');

    expect(runEventsKeys).toContain('items');
    expect(runEventsKeys).toContain('nextCursor');
    expect(eventDtoKeys).toContain('sequence');
    expect(eventDtoKeys).toContain('state');
    expect(eventDtoKeys).toContain('transition');
    expect(eventDtoKeys).toContain('payload');

    expect(streamFrameKeys).toContain('event');
    expect(streamFrameKeys).toContain('id');
    expect(streamFrameKeys).toContain('data');
  });

  it('enforces static graph validity for initialState resolvability, identifier uniqueness, and version-stable transition identity', () => {
    const canonicalDefinition: StaticGraphDefinition = {
      workflowType: 'wf.graph.lock',
      workflowVersion: '1.2.3',
      initialState: 'queued',
      states: ['queued', 'running', 'completed', 'failed'],
      transitions: [
        { from: 'queued', to: 'running', name: 'dispatch-primary' },
        { from: 'queued', to: 'running', name: 'dispatch-retry' },
        { from: 'running', to: 'completed', name: 'complete' },
        { from: 'running', to: 'failed', name: 'fail' },
      ],
    };

    expect(() => assertStaticGraphInvariants(canonicalDefinition)).not.toThrow();
    expect(() =>
      assertStableIdentityForVersion(canonicalDefinition, {
        ...canonicalDefinition,
        states: [...canonicalDefinition.states],
        transitions: [...canonicalDefinition.transitions],
      }),
    ).not.toThrow();

    expect(() =>
      assertStaticGraphInvariants({
        ...canonicalDefinition,
        initialState: 'missing',
      }),
    ).toThrow(/initialState does not resolve/u);

    expect(() =>
      assertStaticGraphInvariants({
        ...canonicalDefinition,
        states: ['queued', 'running', 'running', 'completed'],
      }),
    ).toThrow(/must be unique/u);

    expect(() =>
      assertStableIdentityForVersion(canonicalDefinition, {
        ...canonicalDefinition,
        states: ['queued', 'running', 'completed', 'aborted'],
      }),
    ).toThrow(/State identifiers drifted/u);

    expect(() =>
      assertStableIdentityForVersion(canonicalDefinition, {
        ...canonicalDefinition,
        transitions: [
          { from: 'queued', to: 'running', name: 'dispatch-retry' },
          { from: 'queued', to: 'running', name: 'dispatch-primary' },
          { from: 'running', to: 'completed', name: 'complete' },
          { from: 'running', to: 'failed', name: 'fail' },
        ],
      }),
    ).toThrow(/Transition ordering identity drifted/u);
  });
});
