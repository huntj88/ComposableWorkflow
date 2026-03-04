/**
 * Shared TypeScript contracts for the `app-builder.spec-doc.v1` workflow.
 *
 * These types are the single source of truth consumed by all state handlers.
 * They mirror spec sections 5.1, 5.2, and 6.5 exactly.
 *
 * @module spec-doc/contracts
 */

// ---------------------------------------------------------------------------
// 5.1 Workflow Input
// ---------------------------------------------------------------------------

/** Options forwarded to `app-builder.copilot.prompt.v1` child runs. */
export interface CopilotPromptOptions {
  baseArgs?: string[];
  allowedDirs?: string[];
  timeoutMs?: number;
  cwd?: string;
}

/**
 * Input contract for `app-builder.spec-doc.v1` (spec section 5.1).
 */
export interface SpecDocGenerationInput {
  request: string;
  targetPath?: string;
  constraints?: string[];
  copilotPromptOptions?: CopilotPromptOptions;
}

// ---------------------------------------------------------------------------
// 5.2 Workflow Output
// ---------------------------------------------------------------------------

/**
 * Terminal output contract for `app-builder.spec-doc.v1` (spec section 5.2).
 */
export interface SpecDocGenerationOutput {
  status: 'completed';
  specPath: string;
  summary: {
    unresolvedQuestions: 0;
  };
  artifacts: {
    integrationPasses: number;
    consistencyCheckPasses: number;
  };
}

// ---------------------------------------------------------------------------
// Normalized Answer (shared across queue + integration)
// ---------------------------------------------------------------------------

/**
 * A single normalized answer captured during `NumberedOptionsHumanRequest`.
 * Matches the `normalizedAnswer` `$defs` in `spec-integration-input.schema.json`.
 */
export interface NormalizedAnswer {
  questionId: string;
  selectedOptionIds: number[];
  text?: string;
  /** ISO-8601 timestamp */
  answeredAt: string;
}

// ---------------------------------------------------------------------------
// 6.5 IntegrateIntoSpec Input
// ---------------------------------------------------------------------------

/**
 * Input consumed by the `IntegrateIntoSpec` state handler (spec section 6.5).
 */
export interface IntegrateIntoSpecInput {
  source: 'workflow-input' | 'numbered-options-feedback';
  request: string;
  targetPath?: string;
  constraints?: string[];
  specPath?: string;
  answers?: NormalizedAnswer[];
}

// ---------------------------------------------------------------------------
// Spec Integration Output
// ---------------------------------------------------------------------------

/** Output of a successful `IntegrateIntoSpec` copilot call. */
export interface SpecIntegrationOutput {
  specPath: string;
  changeSummary: string[];
  resolvedQuestionIds: string[];
  remainingQuestionIds: string[];
}

// ---------------------------------------------------------------------------
// Consistency Check Output
// ---------------------------------------------------------------------------

export interface BlockingIssue {
  id: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
  section?: string;
}

export interface ReadinessChecklist {
  hasScopeAndObjective: boolean;
  hasNonGoals: boolean;
  hasConstraintsAndAssumptions: boolean;
  hasInterfacesOrContracts: boolean;
  hasTestableAcceptanceCriteria: boolean;
  hasNoContradictions: boolean;
  hasSufficientDetail: boolean;
}

/** A numbered-option for a question item. */
export interface NumberedQuestionOption {
  id: number;
  label: string;
  description?: string;
}

/**
 * A numbered question item conforming to
 * `numbered-question-item.schema.json` (app-builder extended).
 */
export interface NumberedQuestionItem {
  questionId: string;
  kind: 'issue-resolution' | 'completion-confirmation';
  prompt: string;
  options: NumberedQuestionOption[];
}

/** Output of `LogicalConsistencyCheckCreateFollowUpQuestions`. */
export interface ConsistencyCheckOutput {
  blockingIssues: BlockingIssue[];
  followUpQuestions: NumberedQuestionItem[];
  readinessChecklist: ReadinessChecklist;
}

// ---------------------------------------------------------------------------
// Custom Prompt Classification Output
// ---------------------------------------------------------------------------

export interface CustomPromptClassificationOutput {
  intent: 'clarifying-question' | 'custom-answer';
  clarifyingQuestionText?: string;
  customAnswerText?: string;
}

// ---------------------------------------------------------------------------
// Clarification Follow-Up Output
// ---------------------------------------------------------------------------

/**
 * Server-owned base question item (no required `kind`).
 * Conforms to `docs/schemas/human-input/numbered-question-item.schema.json`.
 */
export interface BaseNumberedQuestionItem {
  questionId: string;
  kind?: string;
  prompt: string;
  options: NumberedQuestionOption[];
}

export interface ClarificationFollowUpOutput {
  followUpQuestion: BaseNumberedQuestionItem;
}

// ---------------------------------------------------------------------------
// Queue Item (runtime context)
// ---------------------------------------------------------------------------

/**
 * A single item in the `NumberedOptionsHumanRequest` question queue.
 * Wraps a numbered question with additional workflow bookkeeping.
 */
export interface QuestionQueueItem extends NumberedQuestionItem {
  /** Whether this question has been asked and answered. */
  answered: boolean;
}
