/**
 * Observability helpers for `app-builder.spec-doc.v1`.
 *
 * Provides standardized structured log emission for all spec-doc-specific
 * observable operations. Each helper calls `ctx.log()` with a consistent
 * payload shape containing `observabilityType`, `state`, and operation-specific
 * fields. Delegation events additionally carry `promptTemplateId` and
 * `outputSchemaId` for prompt traceability (B-SD-OBS-002).
 *
 * Runtime-managed events (`state.entered`, `transition.completed`,
 * `workflow.started`, `child.failed`, etc.) are NOT duplicated here.
 * This module only covers spec-doc-specific operation events listed in
 * spec section 9 and behavior requirements B-SD-OBS-001, B-SD-OBS-002.
 *
 * @module spec-doc/observability
 */

import type { WorkflowContext } from '@composable-workflow/workflow-lib/contracts';

import type { ClarificationQuestionIntent, ClarificationResearchOutcome } from './contracts.js';
import type { PromptTemplateId } from './prompt-templates.js';
import type { SpecDocSchemaId } from './schemas.js';

// ---------------------------------------------------------------------------
// Observable operation type constants
// ---------------------------------------------------------------------------

/**
 * Stable spec-doc-specific observable operation types.
 *
 * Emitted as `observabilityType` in the `payload` of `ctx.log()` events.
 * These complement (not duplicate) runtime events like `state.entered`.
 */
export const OBS_TYPES = {
  /** Copilot delegation initiated with prompt template and output schema. */
  delegationStarted: 'spec-doc.delegation.started',
  /** IntegrateIntoSpec pass completed successfully. */
  integrationPassCompleted: 'spec-doc.integration-pass.completed',
  /** LogicalConsistencyCheck outcome determined. */
  consistencyOutcome: 'spec-doc.consistency-check.completed',
  /** Follow-up question presented to user via human feedback child. */
  questionGenerated: 'spec-doc.question.generated',
  /** Human feedback response received and validated. */
  responseReceived: 'spec-doc.response.received',
  /** Custom prompt intent classified. */
  classificationOutcome: 'spec-doc.classification.completed',
  /** Clarification follow-up question generated and queued. */
  clarificationGenerated: 'spec-doc.clarification.generated',
  /** Research-only clarification result logged. */
  researchResultLogged: 'spec-doc.research.logged',
  /** Terminal completion reached (Done state). */
  terminalCompleted: 'spec-doc.terminal.completed',
} as const;

export type ObservabilityType = (typeof OBS_TYPES)[keyof typeof OBS_TYPES];

// ---------------------------------------------------------------------------
// Payload interfaces
// ---------------------------------------------------------------------------

/** Base fields present on all spec-doc observability payloads. */
export interface ObsPayloadBase {
  [key: string]: unknown;
  observabilityType: ObservabilityType;
  state: string;
  childWorkflowType?: string;
  stageId?: string;
}

/** Payload for copilot delegation started events. */
export interface DelegationStartedPayload extends ObsPayloadBase {
  observabilityType: typeof OBS_TYPES.delegationStarted;
  promptTemplateId: PromptTemplateId;
  outputSchemaId: SpecDocSchemaId;
  inputSchemaId?: SpecDocSchemaId;
}

/** Payload for integration pass completion events. */
export interface IntegrationPassCompletedPayload extends ObsPayloadBase {
  observabilityType: typeof OBS_TYPES.integrationPassCompleted;
  source: string;
  specPath: string;
  passNumber: number;
  changeSummaryCount: number;
  resolvedCount: number;
  remainingCount: number;
  promptTemplateId: PromptTemplateId;
}

/** Payload for consistency check outcome events. */
export interface ConsistencyOutcomePayload extends ObsPayloadBase {
  observabilityType: typeof OBS_TYPES.consistencyOutcome;
  blockingIssuesCount: number;
  actionableItemsCount: number;
  followUpQuestionsCount: number;
  passNumber: number;
  promptTemplateId: PromptTemplateId;
  stageSequence?: string[];
}

/** Payload for question generated events. */
export interface QuestionGeneratedPayload extends ObsPayloadBase {
  observabilityType: typeof OBS_TYPES.questionGenerated;
  questionId: string;
  kind: string;
  queuePosition: number;
  queueSize: number;
}

/** Payload for response received events. */
export interface ResponseReceivedPayload extends ObsPayloadBase {
  observabilityType: typeof OBS_TYPES.responseReceived;
  questionId: string;
  selectedOptionIds: number[];
  hasCustomText: boolean;
}

/** Payload for classification outcome events. */
export interface ClassificationOutcomePayload extends ObsPayloadBase {
  observabilityType: typeof OBS_TYPES.classificationOutcome;
  questionId: string;
  intent: string;
  promptTemplateId: PromptTemplateId;
}

/** Payload for clarification generated events. */
export interface ClarificationGeneratedPayload extends ObsPayloadBase {
  observabilityType: typeof OBS_TYPES.clarificationGenerated;
  sourceQuestionId: string;
  followUpQuestionId: string;
  insertIndex: number;
  promptTemplateId: PromptTemplateId;
}

/** Payload for research-only clarification outcomes. */
export interface ResearchResultLoggedPayload extends ObsPayloadBase {
  observabilityType: typeof OBS_TYPES.researchResultLogged;
  sourceQuestionId: string;
  intent: ClarificationQuestionIntent;
  researchOutcome: ClarificationResearchOutcome;
  researchSummary: string;
  promptTemplateId: PromptTemplateId;
}

/** Payload for terminal completed events. */
export interface TerminalCompletedPayload extends ObsPayloadBase {
  observabilityType: typeof OBS_TYPES.terminalCompleted;
  specPath: string;
  integrationPasses: number;
  consistencyCheckPasses: number;
}

/** Union of all spec-doc observability payloads. */
export type ObservabilityPayload =
  | DelegationStartedPayload
  | IntegrationPassCompletedPayload
  | ConsistencyOutcomePayload
  | QuestionGeneratedPayload
  | ResponseReceivedPayload
  | ClassificationOutcomePayload
  | ClarificationGeneratedPayload
  | ResearchResultLoggedPayload
  | TerminalCompletedPayload;

// ---------------------------------------------------------------------------
// Emission helpers
// ---------------------------------------------------------------------------

/**
 * Emit a copilot delegation started event with prompt traceability fields.
 * Called before each `delegateToCopilot()` invocation.
 */
export function emitDelegationStarted(
  ctx: WorkflowContext<unknown, unknown>,
  params: {
    state: string;
    promptTemplateId: PromptTemplateId;
    outputSchemaId: SpecDocSchemaId;
    inputSchemaId?: SpecDocSchemaId;
    childWorkflowType?: string;
    stageId?: string;
  },
): DelegationStartedPayload {
  const payload: DelegationStartedPayload = {
    observabilityType: OBS_TYPES.delegationStarted,
    state: params.state,
    promptTemplateId: params.promptTemplateId,
    outputSchemaId: params.outputSchemaId,
    ...(params.inputSchemaId != null && { inputSchemaId: params.inputSchemaId }),
    ...(params.childWorkflowType != null && { childWorkflowType: params.childWorkflowType }),
    ...(params.stageId != null && { stageId: params.stageId }),
  };
  ctx.log({
    level: 'info',
    message: `[obs] Delegation started: ${params.promptTemplateId}`,
    payload,
  });
  return payload;
}

/**
 * Emit an integration pass completed event.
 */
export function emitIntegrationPassCompleted(
  ctx: WorkflowContext<unknown, unknown>,
  params: {
    state: string;
    source: string;
    specPath: string;
    passNumber: number;
    changeSummaryCount: number;
    resolvedCount: number;
    remainingCount: number;
    promptTemplateId: PromptTemplateId;
  },
): IntegrationPassCompletedPayload {
  const payload: IntegrationPassCompletedPayload = {
    observabilityType: OBS_TYPES.integrationPassCompleted,
    state: params.state,
    source: params.source,
    specPath: params.specPath,
    passNumber: params.passNumber,
    changeSummaryCount: params.changeSummaryCount,
    resolvedCount: params.resolvedCount,
    remainingCount: params.remainingCount,
    promptTemplateId: params.promptTemplateId,
  };
  ctx.log({
    level: 'info',
    message: `[obs] Integration pass ${params.passNumber} completed`,
    payload,
  });
  return payload;
}

/**
 * Emit a consistency check outcome event.
 */
export function emitConsistencyOutcome(
  ctx: WorkflowContext<unknown, unknown>,
  params: {
    state: string;
    blockingIssuesCount: number;
    actionableItemsCount: number;
    followUpQuestionsCount: number;
    passNumber: number;
    promptTemplateId: PromptTemplateId;
    childWorkflowType?: string;
    stageId?: string;
    stageSequence?: string[];
  },
): ConsistencyOutcomePayload {
  const payload: ConsistencyOutcomePayload = {
    observabilityType: OBS_TYPES.consistencyOutcome,
    state: params.state,
    blockingIssuesCount: params.blockingIssuesCount,
    actionableItemsCount: params.actionableItemsCount,
    followUpQuestionsCount: params.followUpQuestionsCount,
    passNumber: params.passNumber,
    promptTemplateId: params.promptTemplateId,
    ...(params.childWorkflowType != null && { childWorkflowType: params.childWorkflowType }),
    ...(params.stageId != null && { stageId: params.stageId }),
    ...(params.stageSequence != null && { stageSequence: [...params.stageSequence] }),
  };
  ctx.log({
    level: 'info',
    message: `[obs] Consistency check pass ${params.passNumber} completed`,
    payload,
  });
  return payload;
}

/**
 * Emit a question generated event (question presented to user).
 */
export function emitQuestionGenerated(
  ctx: WorkflowContext<unknown, unknown>,
  params: {
    state: string;
    questionId: string;
    kind: string;
    queuePosition: number;
    queueSize: number;
  },
): QuestionGeneratedPayload {
  const payload: QuestionGeneratedPayload = {
    observabilityType: OBS_TYPES.questionGenerated,
    state: params.state,
    questionId: params.questionId,
    kind: params.kind,
    queuePosition: params.queuePosition,
    queueSize: params.queueSize,
  };
  ctx.log({
    level: 'info',
    message: `[obs] Question generated: "${params.questionId}" (${params.queuePosition + 1}/${params.queueSize})`,
    payload,
  });
  return payload;
}

/**
 * Emit a response received event (human feedback validated and recorded).
 */
export function emitResponseReceived(
  ctx: WorkflowContext<unknown, unknown>,
  params: {
    state: string;
    questionId: string;
    selectedOptionIds: number[];
    hasCustomText: boolean;
  },
): ResponseReceivedPayload {
  const payload: ResponseReceivedPayload = {
    observabilityType: OBS_TYPES.responseReceived,
    state: params.state,
    questionId: params.questionId,
    selectedOptionIds: params.selectedOptionIds,
    hasCustomText: params.hasCustomText,
  };
  ctx.log({
    level: 'info',
    message: `[obs] Response received for "${params.questionId}"`,
    payload,
  });
  return payload;
}

/**
 * Emit a classification outcome event.
 */
export function emitClassificationOutcome(
  ctx: WorkflowContext<unknown, unknown>,
  params: {
    state: string;
    questionId: string;
    intent: string;
    promptTemplateId: PromptTemplateId;
  },
): ClassificationOutcomePayload {
  const payload: ClassificationOutcomePayload = {
    observabilityType: OBS_TYPES.classificationOutcome,
    state: params.state,
    questionId: params.questionId,
    intent: params.intent,
    promptTemplateId: params.promptTemplateId,
  };
  ctx.log({
    level: 'info',
    message: `[obs] Classification completed: "${params.questionId}" → ${params.intent}`,
    payload,
  });
  return payload;
}

/**
 * Emit a clarification follow-up generated event.
 */
export function emitClarificationGenerated(
  ctx: WorkflowContext<unknown, unknown>,
  params: {
    state: string;
    sourceQuestionId: string;
    followUpQuestionId: string;
    insertIndex: number;
    promptTemplateId: PromptTemplateId;
  },
): ClarificationGeneratedPayload {
  const payload: ClarificationGeneratedPayload = {
    observabilityType: OBS_TYPES.clarificationGenerated,
    state: params.state,
    sourceQuestionId: params.sourceQuestionId,
    followUpQuestionId: params.followUpQuestionId,
    insertIndex: params.insertIndex,
    promptTemplateId: params.promptTemplateId,
  };
  ctx.log({
    level: 'info',
    message: `[obs] Clarification follow-up "${params.followUpQuestionId}" generated at position ${params.insertIndex}`,
    payload,
  });
  return payload;
}

/**
 * Emit a research-only clarification result event.
 */
export function emitResearchResultLogged(
  ctx: WorkflowContext<unknown, unknown>,
  params: {
    state: string;
    sourceQuestionId: string;
    intent: ClarificationQuestionIntent;
    researchOutcome: ClarificationResearchOutcome;
    researchSummary: string;
    promptTemplateId: PromptTemplateId;
  },
): ResearchResultLoggedPayload {
  const payload: ResearchResultLoggedPayload = {
    observabilityType: OBS_TYPES.researchResultLogged,
    state: params.state,
    sourceQuestionId: params.sourceQuestionId,
    intent: params.intent,
    researchOutcome: params.researchOutcome,
    researchSummary: params.researchSummary,
    promptTemplateId: params.promptTemplateId,
  };
  ctx.log({
    level: 'info',
    message: `[obs] Research result logged for "${params.sourceQuestionId}"`,
    payload,
  });
  return payload;
}

/**
 * Emit a terminal completed event.
 */
export function emitTerminalCompleted(
  ctx: WorkflowContext<unknown, unknown>,
  params: {
    state: string;
    specPath: string;
    integrationPasses: number;
    consistencyCheckPasses: number;
  },
): TerminalCompletedPayload {
  const payload: TerminalCompletedPayload = {
    observabilityType: OBS_TYPES.terminalCompleted,
    state: params.state,
    specPath: params.specPath,
    integrationPasses: params.integrationPasses,
    consistencyCheckPasses: params.consistencyCheckPasses,
  };
  ctx.log({
    level: 'info',
    message: `[obs] Terminal completed: ${params.specPath}`,
    payload,
  });
  return payload;
}
