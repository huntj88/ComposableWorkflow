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

interface GraphContractDescriptor {
  mentionsInitialStateResolvable: boolean;
  mentionsUniqueStateIdentifiers: boolean;
  mentionsStableImmutableStateIdentifiers: boolean;
  mentionsTransitionIdentityTuple: boolean;
  mentionsTransitionOrderingDeterministic: boolean;
  mentionsRuntimeCurrentStateResolution: boolean;
  mentionsOverlayEventReferences: boolean;
  mentionsUnknownReferenceViolation: boolean;
  mentionsSequenceCursorDeterminism: boolean;
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

const toGraphDescriptor = (rawText: string): GraphContractDescriptor => {
  const text = normalize(rawText);

  const mentionsEventNames =
    text.includes('state.entered') &&
    text.includes('transition.completed') &&
    text.includes('transition.failed');

  return {
    mentionsInitialStateResolvable:
      /initialstate.*resolve/u.test(text) ||
      /resolves to a declared state identifier/u.test(text) ||
      /initial state/u.test(text),
    mentionsUniqueStateIdentifiers:
      /state identifiers.*unique/u.test(text) ||
      /unique within the definition/u.test(text) ||
      /definition state identifiers must be unique/u.test(text),
    mentionsStableImmutableStateIdentifiers:
      /state identifiers.*immutable/u.test(text) ||
      /stable state.*identity/u.test(text) ||
      /stable state and transition identity/u.test(text),
    mentionsTransitionIdentityTuple:
      text.includes('(fromstate,tostate,ordinalwithinpair)') ||
      /fromstate.*tostate.*transitionordinal/u.test(text),
    mentionsTransitionOrderingDeterministic:
      /stable transition ordering/u.test(text) ||
      /transition ordering.*stable/u.test(text) ||
      /layout computation key is \(workflowtype, definitionversion\)/u.test(text),
    mentionsRuntimeCurrentStateResolution:
      text.includes('runsummaryresponse.currentstate') &&
      /definition (state|identifier)/u.test(text),
    mentionsOverlayEventReferences:
      mentionsEventNames &&
      (/resolve against the static definition identifiers/u.test(text) ||
        /required event-to-overlay mapping/u.test(text)),
    mentionsUnknownReferenceViolation:
      /unknown state\/transition references.*contract violations/u.test(text) ||
      /must show a visible contract-mismatch indicator/u.test(text),
    mentionsSequenceCursorDeterminism:
      /sequence.*cursor.*deterministic/u.test(text) ||
      /cursor\/sequence.*deterministic/u.test(text),
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
  it('ITX-033 / B-CONTRACT-007 keeps graph identity semantics aligned across server spec, web spec, and shared contract exports', () => {
    const apiTypesSection51 = extractSection({
      markdownPath: apiTypesSpecPath,
      sectionHeadingPrefix: '### 5.1 Static Graph Schema',
    });
    const apiTypesSection52 = extractSection({
      markdownPath: apiTypesSpecPath,
      sectionHeadingPrefix: '### 5.2 Dynamic Overlay Schema',
    });
    const apiTypesSection53 = extractSection({
      markdownPath: apiTypesSpecPath,
      sectionHeadingPrefix: '### 5.3 Cross-Spec Graph Contract Lock',
    });
    const webSection66 = extractSection({
      markdownPath: webSpecPath,
      sectionHeadingPrefix: '### 6.6 FSM Contract Invariants (Normative)',
    });
    const webSection85 = extractSection({
      markdownPath: webSpecPath,
      sectionHeadingPrefix: '### 8.5 FSM Graph Rendering Specification (Normative)',
    });

    const apiTypesDescriptor = toGraphDescriptor(
      `${apiTypesSection51}\n${apiTypesSection52}\n${apiTypesSection53}`,
    );
    const webDescriptor = toGraphDescriptor(`${webSection66}\n${webSection85}`);

    expect(apiTypesDescriptor.mentionsInitialStateResolvable).toBe(true);
    expect(webDescriptor.mentionsInitialStateResolvable).toBe(true);
    expect(apiTypesDescriptor.mentionsUniqueStateIdentifiers).toBe(true);
    expect(webDescriptor.mentionsUniqueStateIdentifiers).toBe(true);
    expect(apiTypesDescriptor.mentionsStableImmutableStateIdentifiers).toBe(true);
    expect(webDescriptor.mentionsStableImmutableStateIdentifiers).toBe(true);
    expect(apiTypesDescriptor.mentionsTransitionIdentityTuple).toBe(true);
    expect(webDescriptor.mentionsTransitionIdentityTuple).toBe(true);
    expect(apiTypesDescriptor.mentionsTransitionOrderingDeterministic).toBe(true);
    expect(webDescriptor.mentionsTransitionOrderingDeterministic).toBe(true);
    expect(apiTypesDescriptor.mentionsOverlayEventReferences).toBe(true);
    expect(webDescriptor.mentionsOverlayEventReferences).toBe(true);
    expect(apiTypesDescriptor.mentionsUnknownReferenceViolation).toBe(true);
    expect(webDescriptor.mentionsUnknownReferenceViolation).toBe(true);
    expect(apiTypesDescriptor.mentionsSequenceCursorDeterminism).toBe(true);
    expect(webDescriptor.mentionsSequenceCursorDeterminism).toBe(true);
    expect(
      apiTypesDescriptor.mentionsRuntimeCurrentStateResolution ||
        webDescriptor.mentionsRuntimeCurrentStateResolution,
    ).toBe(true);

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
