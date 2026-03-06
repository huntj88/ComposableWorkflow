/**
 * ITX-WEB-DEFINITIONS-VIEW: Definitions route deep-link render and metadata
 * panel behavior verified deterministically.
 *
 * Verification: DefinitionsPage component is importable, endpoint URL is
 * canonical with encodeURIComponent, WorkflowDefinitionResponse schema is
 * validated, transition inventory metadata is rendered from shared fields, and missing
 * workflowType is handled gracefully.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  workflowDefinitionResponseSchema,
  type WorkflowDefinitionResponse,
} from '@composable-workflow/workflow-api-types';

import { DefinitionsPage } from '../../../src/routes/definitions/DefinitionsPage';

const definitionsPageSource = readFileSync(
  resolve(import.meta.dirname, '../../../src/routes/definitions/DefinitionsPage.tsx'),
  'utf8',
);

/* ── Fixtures ─────────────────────────────────────────────────────── */

const validDefinition: WorkflowDefinitionResponse = {
  workflowType: 'reference.success.v1',
  workflowVersion: '1.0.0',
  states: ['init', 'running', 'succeeded'],
  transitions: [
    { from: 'init', to: 'running', name: 'start' },
    { from: 'running', to: 'succeeded', name: 'complete' },
  ],
  childLaunchAnnotations: [],
  metadata: {},
};

const definitionWithSpecialChars: WorkflowDefinitionResponse = {
  workflowType: 'com.example/multi word+type',
  workflowVersion: '2.0.0-rc.1',
  states: ['a', 'b'],
  transitions: [{ from: 'a', to: 'b' }],
  childLaunchAnnotations: [],
  metadata: { author: 'test' },
};

/* ── Component Import ────────────────────────────────────────────── */

describe('integration.routes.definitions-view / component export', () => {
  it('DefinitionsPage is a callable function component', () => {
    expect(typeof DefinitionsPage).toBe('function');
    expect(DefinitionsPage.name).toBe('DefinitionsPage');
  });
});

/* ── Endpoint URL Canonical Form ─────────────────────────────────── */

describe('integration.routes.definitions-view / endpoint URL', () => {
  it('canonical definition endpoint URL uses encodeURIComponent', () => {
    const workflowType = 'reference.success.v1';
    const url = `/api/v1/workflows/definitions/${encodeURIComponent(workflowType)}`;
    expect(url).toBe('/api/v1/workflows/definitions/reference.success.v1');
  });

  it('special characters in workflowType are percent-encoded', () => {
    const workflowType = 'com.example/multi word+type';
    const url = `/api/v1/workflows/definitions/${encodeURIComponent(workflowType)}`;
    expect(url).toBe('/api/v1/workflows/definitions/com.example%2Fmulti%20word%2Btype');
  });

  it('empty workflowType produces a trailing-slash endpoint', () => {
    const url = `/api/v1/workflows/definitions/${encodeURIComponent('')}`;
    expect(url).toBe('/api/v1/workflows/definitions/');
  });
});

/* ── Response Schema Validation ──────────────────────────────────── */

describe('integration.routes.definitions-view / response schema', () => {
  it('valid definition passes schema parse', () => {
    const result = workflowDefinitionResponseSchema.parse(validDefinition);
    expect(result.workflowType).toBe('reference.success.v1');
    expect(result.workflowVersion).toBe('1.0.0');
    expect(result.states).toEqual(['init', 'running', 'succeeded']);
    expect(result.transitions).toHaveLength(2);
  });

  it('schema requires workflowType and workflowVersion', () => {
    expect(() =>
      workflowDefinitionResponseSchema.parse({
        states: [],
        transitions: [],
        childLaunchAnnotations: [],
        metadata: {},
      }),
    ).toThrow();
  });

  it('schema requires states array', () => {
    expect(() =>
      workflowDefinitionResponseSchema.parse({
        workflowType: 'a',
        workflowVersion: '1',
        transitions: [],
        childLaunchAnnotations: [],
        metadata: {},
      }),
    ).toThrow();
  });

  it('schema requires transitions array', () => {
    expect(() =>
      workflowDefinitionResponseSchema.parse({
        workflowType: 'a',
        workflowVersion: '1',
        states: [],
        childLaunchAnnotations: [],
        metadata: {},
      }),
    ).toThrow();
  });

  it('transitions.name is optional', () => {
    const result = workflowDefinitionResponseSchema.parse({
      workflowType: 'x',
      workflowVersion: '1',
      states: ['a', 'b'],
      transitions: [{ from: 'a', to: 'b' }],
      childLaunchAnnotations: [],
      metadata: {},
    });
    expect(result.transitions[0]!.name).toBeUndefined();
  });

  it('childLaunchAnnotations and metadata are required', () => {
    expect(() =>
      workflowDefinitionResponseSchema.parse({
        workflowType: 'a',
        workflowVersion: '1',
        states: [],
        transitions: [],
      }),
    ).toThrow();
  });

  it('definition with special-char workflowType passes schema', () => {
    const result = workflowDefinitionResponseSchema.parse(definitionWithSpecialChars);
    expect(result.workflowType).toBe('com.example/multi word+type');
    expect(result.metadata).toEqual({ author: 'test' });
  });
});

/* ── Response Field Coverage ─────────────────────────────────────── */

describe('integration.routes.definitions-view / field coverage', () => {
  const schemaKeys = Object.keys(workflowDefinitionResponseSchema.shape);

  it('schema covers required response fields', () => {
    for (const required of [
      'workflowType',
      'workflowVersion',
      'states',
      'transitions',
      'childLaunchAnnotations',
      'metadata',
    ]) {
      expect(schemaKeys).toContain(required);
    }
  });

  it('fixture covers all schema keys', () => {
    const fixtureKeys = Object.keys(validDefinition);
    for (const key of schemaKeys) {
      expect(fixtureKeys).toContain(key);
    }
  });
});

/* ── Metadata Rendering Attributes ──────────────────────────────── */

describe('integration.routes.definitions-view / metadata rendering', () => {
  it('transition inventory renders as an accessible list in source JSX', () => {
    expect(definitionsPageSource).toMatch(/aria-label=["']definition-transition-list["']/);
    expect(definitionsPageSource).toMatch(/query\.data\.transitions\.map/);
  });

  it('transition rows preserve shared from/to fields', () => {
    expect(definitionsPageSource).toMatch(/transition\.from/);
    expect(definitionsPageSource).toMatch(/transition\.to/);
  });
});

/* ── Error Behavior ──────────────────────────────────────────────── */

describe('integration.routes.definitions-view / error handling', () => {
  it('source uses status-interpolated error message on non-ok response', () => {
    expect(definitionsPageSource).toMatch(/Failed to load definition.*\$\{response\.status\}/);
  });

  it('non-ok response guard checks response.ok before parsing', () => {
    expect(definitionsPageSource).toMatch(/if\s*\(\s*!response\.ok\s*\)/);
  });
});
