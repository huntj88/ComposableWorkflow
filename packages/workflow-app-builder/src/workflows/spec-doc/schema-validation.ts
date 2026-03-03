/**
 * JSON parse + schema validation utilities for `app-builder.spec-doc.v1`.
 *
 * Provides deterministic error payloads with schema identifiers.
 * Schema validation failures are terminal per spec.
 *
 * @module spec-doc/schema-validation
 */

import { Ajv2020 } from 'ajv/dist/2020.js';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore -- ajv-formats CJS/ESM interop
import _addFormats from 'ajv-formats';

import { type SpecDocSchemaId, loadAllSchemas, SCHEMA_IDS } from './schemas.js';

type AjvInstance = InstanceType<typeof Ajv2020>;

// ajv-formats CJS/ESM interop
const addFormats = (
  typeof (_addFormats as Record<string, unknown>).default === 'function'
    ? (_addFormats as Record<string, unknown>).default
    : _addFormats
) as (ajv: AjvInstance) => void;

// ---------------------------------------------------------------------------
// Validation result types
// ---------------------------------------------------------------------------

export interface ValidationSuccess<T = unknown> {
  ok: true;
  value: T;
}

export interface ValidationError {
  ok: false;
  error: {
    kind: 'parse-failure' | 'schema-validation';
    schemaId: string;
    details: string;
  };
}

export type ValidationResult<T = unknown> = ValidationSuccess<T> | ValidationError;

// ---------------------------------------------------------------------------
// Validator factory
// ---------------------------------------------------------------------------

/**
 * Create a pre-compiled Ajv validator instance with all spec-doc schemas loaded.
 *
 * The returned object exposes a `validate` method that combines JSON parsing
 * and schema validation into one call with a deterministic result shape.
 */
export function createSpecDocValidator(): SpecDocValidator {
  const ajv = new Ajv2020({
    strict: false, // JSON Schema 2020-12 keywords that Ajv doesn't natively strict-check
    allErrors: true,
  });
  addFormats(ajv);

  // Bulk-register all schemas so $ref resolution works.
  const allSchemas = loadAllSchemas();
  for (const [id, schema] of allSchemas) {
    // Only add if not already registered (avoid duplicates from $ref loading).
    if (!ajv.getSchema(id)) {
      ajv.addSchema(schema, id);
    }
  }

  return new SpecDocValidator(ajv);
}

// ---------------------------------------------------------------------------
// Validator class
// ---------------------------------------------------------------------------

export class SpecDocValidator {
  constructor(private readonly ajv: AjvInstance) {}

  /**
   * Parse a raw string as JSON, then validate against the given schema.
   *
   * @param raw - The raw string to parse (expected to be JSON).
   * @param schemaId - The `$id` of the schema to validate against.
   * @returns A deterministic `ValidationResult`.
   */
  validate<T = unknown>(raw: string, schemaId: SpecDocSchemaId): ValidationResult<T> {
    // Step 1: JSON parse
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      return {
        ok: false,
        error: {
          kind: 'parse-failure',
          schemaId,
          details: err instanceof Error ? err.message : 'Unknown JSON parse error',
        },
      };
    }

    // Step 2: Schema validation
    return this.validateParsed<T>(parsed, schemaId);
  }

  /**
   * Validate an already-parsed value against the given schema.
   *
   * @param value - The parsed value to validate.
   * @param schemaId - The `$id` of the schema to validate against.
   * @returns A deterministic `ValidationResult`.
   */
  validateParsed<T = unknown>(value: unknown, schemaId: SpecDocSchemaId): ValidationResult<T> {
    const validateFn = this.ajv.getSchema(schemaId);
    if (!validateFn) {
      return {
        ok: false,
        error: {
          kind: 'schema-validation',
          schemaId,
          details: `Schema not found: ${schemaId}`,
        },
      };
    }

    const valid = validateFn(value);
    if (valid) {
      return { ok: true, value: value as T };
    }

    const details = this.ajv.errorsText(validateFn.errors, {
      separator: '; ',
      dataVar: 'data',
    });

    return {
      ok: false,
      error: {
        kind: 'schema-validation',
        schemaId,
        details,
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Convenience: one-shot parse + validate
// ---------------------------------------------------------------------------

/**
 * One-shot parse + validate using a freshly created validator.
 * Prefer `createSpecDocValidator()` when validating multiple payloads
 * to avoid re-loading schemas on each call.
 */
export function parseAndValidate<T = unknown>(
  raw: string,
  schemaId: SpecDocSchemaId,
): ValidationResult<T> {
  return createSpecDocValidator().validate<T>(raw, schemaId);
}

// Re-export schema IDs for convenience.
export { SCHEMA_IDS };
