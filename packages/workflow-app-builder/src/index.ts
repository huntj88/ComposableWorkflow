export { default } from './manifest.js';
export * from './manifest.js';

// Spec-doc foundation contracts and schema utilities
export * from './workflows/spec-doc/contracts.js';
export { SCHEMA_IDS, type SpecDocSchemaId } from './workflows/spec-doc/schemas.js';
export {
  createSpecDocValidator,
  parseAndValidate,
  type ValidationResult,
  type ValidationSuccess,
  type ValidationError,
  type SpecDocValidator,
} from './workflows/spec-doc/schema-validation.js';
