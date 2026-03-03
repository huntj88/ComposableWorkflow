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

// FSM runtime skeleton and state data model (TSD02)
export {
  SPEC_DOC_STATES,
  type SpecDocState,
  type SpecDocCounters,
  type SpecDocArtifacts,
  type SpecDocStateData,
  createInitialStateData,
} from './workflows/spec-doc/state-data.js';
export {
  SPEC_DOC_WORKFLOW_TYPE,
  SPEC_DOC_WORKFLOW_VERSION,
  specDocTransitions,
  ALLOWED_EDGES,
  isAllowedTransition,
  createSpecDocWorkflowDefinition,
  specDocWorkflowRegistration,
} from './workflows/spec-doc/workflow.js';

// Prompt template catalog and copilot delegation (TSD01)
export {
  TEMPLATE_IDS,
  PROMPT_TEMPLATES,
  type PromptTemplateId,
  type PromptTemplate,
  getPromptTemplate,
  getAllTemplateIds,
  interpolate,
} from './workflows/spec-doc/prompt-templates.js';
export {
  delegateToCopilot,
  buildDelegationRequest,
  type CopilotDelegationRequest,
  type CopilotDelegationResult,
} from './workflows/spec-doc/copilot-delegation.js';

// Answer accumulation utilities (TSD05)
export {
  validateSelectedOptionIds,
  validateCompletionConfirmationCardinality,
  createNormalizedAnswer,
  appendAnswer,
} from './workflows/spec-doc/answers.js';

// Observability helpers (TSD08)
export {
  OBS_TYPES,
  type ObservabilityType,
  type ObsPayloadBase,
  type DelegationStartedPayload,
  type IntegrationPassCompletedPayload,
  type ConsistencyOutcomePayload,
  type QuestionGeneratedPayload,
  type ResponseReceivedPayload,
  type ClassificationOutcomePayload,
  type ClarificationGeneratedPayload,
  type TerminalCompletedPayload,
  type ObservabilityPayload,
  emitDelegationStarted,
  emitIntegrationPassCompleted,
  emitConsistencyOutcome,
  emitQuestionGenerated,
  emitResponseReceived,
  emitClassificationOutcome,
  emitClarificationGenerated,
  emitTerminalCompleted,
} from './workflows/spec-doc/observability.js';

// Terminal semantics and failure utilities (TSD07)
export {
  type UnresolvedQuestionSummary,
  type SpecDocFailurePayload,
  buildLoopLimitFailurePayload,
  createLoopLimitError,
  buildChildFailurePayload,
  createChildFailureError,
} from './workflows/spec-doc/failure.js';
