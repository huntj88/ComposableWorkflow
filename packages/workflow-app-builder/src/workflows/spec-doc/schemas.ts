/**
 * Central schema registry for `app-builder.spec-doc.v1`.
 *
 * All required schemas from spec section 7.1 are loadable via a single map
 * keyed by their `$id` values. Server-owned base schemas are also registered
 * so that `$ref` resolution works correctly.
 *
 * @module spec-doc/schemas
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Schema IDs (spec section 7.1)
// ---------------------------------------------------------------------------

const SPEC_DOC_SCHEMA_PREFIX = 'https://composable-workflow.local/schemas/app-builder/spec-doc';
const SERVER_SCHEMA_PREFIX = 'https://composable-workflow.local/schemas/server/human-input';

export const SCHEMA_IDS = {
  /** App-builder extended numbered question item. */
  numberedQuestionItem: `${SPEC_DOC_SCHEMA_PREFIX}/numbered-question-item.schema.json`,
  /** IntegrateIntoSpec input contract. */
  specIntegrationInput: `${SPEC_DOC_SCHEMA_PREFIX}/spec-integration-input.schema.json`,
  /** IntegrateIntoSpec output contract. */
  specIntegrationOutput: `${SPEC_DOC_SCHEMA_PREFIX}/spec-integration-output.schema.json`,
  /** LogicalConsistencyCheckCreateFollowUpQuestions output. */
  consistencyCheckOutput: `${SPEC_DOC_SCHEMA_PREFIX}/consistency-check-output.schema.json`,
  /** ClassifyCustomPrompt output. */
  customPromptClassificationOutput: `${SPEC_DOC_SCHEMA_PREFIX}/custom-prompt-classification-output.schema.json`,
  /** ExpandQuestionWithClarification output. */
  clarificationFollowUpOutput: `${SPEC_DOC_SCHEMA_PREFIX}/clarification-follow-up-output.schema.json`,
  /** Terminal spec-doc generation output. */
  specDocGenerationOutput: `${SPEC_DOC_SCHEMA_PREFIX}/spec-doc-generation-output.schema.json`,
  /** Server-owned base numbered question item. */
  serverNumberedQuestionItem: `${SERVER_SCHEMA_PREFIX}/numbered-question-item.schema.json`,
  /** Server-owned numbered options response input. */
  serverNumberedOptionsResponseInput: `${SERVER_SCHEMA_PREFIX}/numbered-options-response-input.schema.json`,
} as const;

export type SpecDocSchemaId = (typeof SCHEMA_IDS)[keyof typeof SCHEMA_IDS];

// ---------------------------------------------------------------------------
// File paths relative to this module
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Resolve a path relative to the package root (two levels up from src/workflows/spec-doc). */
function fromPackageRoot(...segments: string[]): string {
  return resolve(__dirname, '..', '..', '..', ...segments);
}

/** Resolve a path relative to the monorepo root (five levels up from src/workflows/spec-doc). */
function fromMonorepoRoot(...segments: string[]): string {
  return resolve(__dirname, '..', '..', '..', '..', '..', ...segments);
}

/**
 * Mapping from schema `$id` → absolute file path on disk.
 */
const SCHEMA_FILE_MAP: Record<SpecDocSchemaId, string> = {
  [SCHEMA_IDS.numberedQuestionItem]: fromPackageRoot(
    'docs',
    'schemas',
    'spec-doc',
    'numbered-question-item.schema.json',
  ),
  [SCHEMA_IDS.specIntegrationInput]: fromPackageRoot(
    'docs',
    'schemas',
    'spec-doc',
    'spec-integration-input.schema.json',
  ),
  [SCHEMA_IDS.specIntegrationOutput]: fromPackageRoot(
    'docs',
    'schemas',
    'spec-doc',
    'spec-integration-output.schema.json',
  ),
  [SCHEMA_IDS.consistencyCheckOutput]: fromPackageRoot(
    'docs',
    'schemas',
    'spec-doc',
    'consistency-check-output.schema.json',
  ),
  [SCHEMA_IDS.customPromptClassificationOutput]: fromPackageRoot(
    'docs',
    'schemas',
    'spec-doc',
    'custom-prompt-classification-output.schema.json',
  ),
  [SCHEMA_IDS.clarificationFollowUpOutput]: fromPackageRoot(
    'docs',
    'schemas',
    'spec-doc',
    'clarification-follow-up-output.schema.json',
  ),
  [SCHEMA_IDS.specDocGenerationOutput]: fromPackageRoot(
    'docs',
    'schemas',
    'spec-doc',
    'spec-doc-generation-output.schema.json',
  ),
  [SCHEMA_IDS.serverNumberedQuestionItem]: fromMonorepoRoot(
    'packages',
    'workflow-server',
    'docs',
    'schemas',
    'human-input',
    'numbered-question-item.schema.json',
  ),
  [SCHEMA_IDS.serverNumberedOptionsResponseInput]: fromMonorepoRoot(
    'packages',
    'workflow-server',
    'docs',
    'schemas',
    'human-input',
    'numbered-options-response-input.schema.json',
  ),
};

// ---------------------------------------------------------------------------
// Schema loading
// ---------------------------------------------------------------------------

/**
 * Mapping from relative `$ref` file paths (as written in the JSON schema files)
 * to their canonical `$id` URIs. This allows Ajv to resolve cross-schema `$ref`
 * values that use relative file paths.
 */
const REF_FILE_TO_ID: Record<string, SpecDocSchemaId> = {
  '../../../../workflow-server/docs/schemas/human-input/numbered-question-item.schema.json':
    SCHEMA_IDS.serverNumberedQuestionItem,
  './numbered-question-item.schema.json': SCHEMA_IDS.numberedQuestionItem,
};

/**
 * Recursively rewrite `$ref` values in a schema object, replacing
 * relative file paths with their canonical `$id` URIs so Ajv can resolve them.
 */
function rewriteRefs(obj: unknown): unknown {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(rewriteRefs);

  const record = obj as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (key === '$ref' && typeof value === 'string' && value in REF_FILE_TO_ID) {
      result[key] = REF_FILE_TO_ID[value];
    } else {
      result[key] = rewriteRefs(value);
    }
  }
  return result;
}

/**
 * Load a raw JSON schema object by its canonical `$id`.
 * Relative `$ref` values are rewritten to canonical `$id` URIs.
 * Throws if the schema ID is unknown or the file is unreadable.
 */
export function loadSchemaById(schemaId: SpecDocSchemaId): Record<string, unknown> {
  const filePath = SCHEMA_FILE_MAP[schemaId];
  if (!filePath) {
    throw new Error(`Unknown schema ID: ${schemaId}`);
  }
  const raw = JSON.parse(readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
  return rewriteRefs(raw) as Record<string, unknown>;
}

/**
 * Load all registered schemas as an id → schema map.
 * Useful for bulk-registering with a JSON Schema validator.
 */
export function loadAllSchemas(): Map<SpecDocSchemaId, Record<string, unknown>> {
  const result = new Map<SpecDocSchemaId, Record<string, unknown>>();
  for (const id of Object.values(SCHEMA_IDS)) {
    result.set(id, loadSchemaById(id));
  }
  return result;
}

/**
 * Get the absolute file path for a schema by its `$id`.
 * Useful for resolving `$ref` relative paths during validator setup.
 */
export function getSchemaFilePath(schemaId: SpecDocSchemaId): string {
  const filePath = SCHEMA_FILE_MAP[schemaId];
  if (!filePath) {
    throw new Error(`Unknown schema ID: ${schemaId}`);
  }
  return filePath;
}

/**
 * All registered schema IDs.
 */
export function getAllSchemaIds(): SpecDocSchemaId[] {
  return Object.values(SCHEMA_IDS);
}

// ---------------------------------------------------------------------------
// Schema bundling (for standalone validation in copilot-prompt)
// ---------------------------------------------------------------------------

/**
 * Build a self-contained schema by recursively inlining all external `$ref`
 * targets. Internal `$ref` values (starting with `#/`) are left untouched.
 *
 * This produces a schema that can be validated by a standalone Ajv instance
 * without pre-loading any referenced schemas — required for copilot-prompt's
 * in-session validation and retry loop.
 */
export function bundleSchemaForExport(schemaId: SpecDocSchemaId): Record<string, unknown> {
  const allSchemas = loadAllSchemas();
  const visited = new Set<string>();
  return inlineRefs(loadSchemaById(schemaId), allSchemas, visited) as Record<string, unknown>;
}

/**
 * Recursively walk a schema object and replace external `$ref` values with
 * the full definition of the referenced schema (also recursively resolved).
 */
function inlineRefs(
  obj: unknown,
  allSchemas: Map<SpecDocSchemaId, Record<string, unknown>>,
  visited: Set<string>,
): unknown {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map((item) => inlineRefs(item, allSchemas, visited));

  const record = obj as Record<string, unknown>;

  // If this node is a $ref to an external schema, inline it
  if (typeof record.$ref === 'string' && !record.$ref.startsWith('#')) {
    const refId = record.$ref as string;
    // Prevent infinite circular inlining
    if (visited.has(refId)) return record;
    const referenced = allSchemas.get(refId as SpecDocSchemaId);
    if (referenced) {
      visited.add(refId);
      // Inline the full referenced schema (strip its $id/$schema to avoid conflicts)
      const { $id: _, $schema: __, ...rest } = referenced;
      void _;
      void __;
      return inlineRefs(rest, allSchemas, visited);
    }
    // Unknown $ref — leave as-is
    return record;
  }

  // Otherwise recurse into all properties
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    result[key] = inlineRefs(value, allSchemas, visited);
  }
  return result;
}
