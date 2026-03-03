/**
 * Hardcoded prompt-template catalog for `app-builder.spec-doc.v1`.
 *
 * Templates are versioned code constants (not runtime-configurable in MVP).
 * Template IDs are stable observability keys that align with spec section 7.2.
 *
 * @module spec-doc/prompt-templates
 */

import { SCHEMA_IDS, type SpecDocSchemaId } from './schemas.js';

// ---------------------------------------------------------------------------
// Template IDs (spec section 7.2)
// ---------------------------------------------------------------------------

export const TEMPLATE_IDS = {
  integrate: 'spec-doc.integrate.v1',
  consistencyCheck: 'spec-doc.consistency-check.v1',
  classifyCustomPrompt: 'spec-doc.classify-custom-prompt.v1',
  expandClarification: 'spec-doc.expand-clarification.v1',
} as const;

export type PromptTemplateId = (typeof TEMPLATE_IDS)[keyof typeof TEMPLATE_IDS];

// ---------------------------------------------------------------------------
// Interpolation helpers
// ---------------------------------------------------------------------------

/**
 * Replace `{{key}}` placeholders in a template string with values from `vars`.
 * Unknown keys are left as-is.
 */
export function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) =>
    key in vars ? vars[key] : `{{${key}}}`,
  );
}

// ---------------------------------------------------------------------------
// Prompt template definitions
// ---------------------------------------------------------------------------

export interface PromptTemplate {
  readonly id: PromptTemplateId;
  /** The associated output schema ID from SCHEMA_IDS. */
  readonly outputSchemaId: SpecDocSchemaId;
  /** Optional input schema ID (only when the state requires input validation). */
  readonly inputSchemaId?: SpecDocSchemaId;
  /** The raw template body with `{{var}}` placeholders. */
  readonly body: string;
  /** Names of required interpolation variables. */
  readonly requiredVars: readonly string[];
}

// -- 7.2.1 IntegrateIntoSpec ------------------------------------------------

const INTEGRATE_BODY = `You are generating and maintaining an implementation-ready software specification markdown document.

You must:
1) Preserve prior accepted decisions unless explicitly overridden by newer answers.
2) Integrate all provided constraints and normalized numbered-options answers.
3) Keep the spec concrete and testable.
4) Ensure sections exist for: objective/scope, non-goals, constraints/assumptions, interfaces/contracts, acceptance criteria.
5) Write or update the markdown file in the workspace.

Input context:
- source: {{source}}
- request: {{request}}
- targetPath: {{targetPath}}
- existingSpecPath: {{specPath}}
- constraints: {{constraintsJson}}
- answers: {{answersJson}}

Spec quality requirements:
- No unresolved contradictions in scope, constraints, or interface contracts.
- Acceptance criteria must be testable and unambiguous.
- Keep language implementation-ready and avoid vague statements.`;

// -- 7.2.2 LogicalConsistencyCheckCreateFollowUpQuestions -------------------

const CONSISTENCY_CHECK_BODY = `You are validating a spec document for implementation readiness and generating deterministic numbered follow-up questions.

Input context:
- request: {{request}}
- specPath: {{specPath}}
- constraints: {{constraintsJson}}
- currentLoopCount: {{loopCount}}
- remainingQuestionIdsFromIntegration: {{remainingQuestionIdsJson}}

Evaluation checklist (must map to readinessChecklist booleans):
1) Scope/objective present.
2) Non-goals present.
3) Constraints/assumptions explicit.
4) Interfaces/contracts defined where needed.
5) Acceptance criteria testable.

Question-generation rules:
- If blocking issues exist: generate issue-resolution questions for each blocking decision gap.
- If no blocking issues remain: return an empty \`followUpQuestions\` array (completion-confirmation question is synthesized by workflow logic).
- Each question must include:
  - stable deterministic questionId,
  - prompt,
  - options with unique contiguous integer ids starting at 1,
  - per-option \`description\` that includes concise \`Pros:\` and \`Cons:\`,
  - kind set to \`issue-resolution\`.
- Keep followUpQuestions ordering deterministic.`;

// -- 7.2.3 ClassifyCustomPrompt --------------------------------------------

const CLASSIFY_CUSTOM_PROMPT_BODY = `Classify the user's custom text for a numbered-options response.

Input context:
- questionId: {{questionId}}
- questionPrompt: {{questionPrompt}}
- selectedOptionIds: {{selectedOptionIdsJson}}
- customText: {{customText}}

Classification policy:
- intent = clarifying-question when the custom text is primarily asking for clarification, disambiguation, or additional information before deciding.
- intent = custom-answer when the custom text primarily provides an answer, preference, constraint, or detail to be integrated.
- Choose exactly one intent.`;

// -- 7.2.4 ExpandQuestionWithClarification ----------------------------------

const EXPAND_CLARIFICATION_BODY = `Create one deterministic numbered follow-up question from the provided clarifying question.

Input context:
- sourceQuestionId: {{sourceQuestionId}}
- sourceQuestionPrompt: {{sourceQuestionPrompt}}
- sourceOptions: {{sourceOptionsJson}}
- clarifyingQuestionText: {{clarifyingQuestionText}}
- nextQuestionOrdinalHint: {{nextQuestionOrdinal}}

Rules:
- followUpQuestion.questionId must be new and deterministic.
- followUpQuestion.options must use contiguous integer ids starting at 1.
- followUpQuestion options should include \`description\` with concise \`Pros:\` and \`Cons:\` for each choice.
- The question should resolve the clarification with minimal ambiguity and clear decision branches.`;

// ---------------------------------------------------------------------------
// Template catalog
// ---------------------------------------------------------------------------

export const PROMPT_TEMPLATES: Record<PromptTemplateId, PromptTemplate> = {
  [TEMPLATE_IDS.integrate]: {
    id: TEMPLATE_IDS.integrate,
    outputSchemaId: SCHEMA_IDS.specIntegrationOutput,
    inputSchemaId: SCHEMA_IDS.specIntegrationInput,
    body: INTEGRATE_BODY,
    requiredVars: ['request', 'source', 'targetPath', 'constraintsJson', 'specPath', 'answersJson'],
  },
  [TEMPLATE_IDS.consistencyCheck]: {
    id: TEMPLATE_IDS.consistencyCheck,
    outputSchemaId: SCHEMA_IDS.consistencyCheckOutput,
    body: CONSISTENCY_CHECK_BODY,
    requiredVars: [
      'request',
      'specPath',
      'constraintsJson',
      'loopCount',
      'remainingQuestionIdsJson',
    ],
  },
  [TEMPLATE_IDS.classifyCustomPrompt]: {
    id: TEMPLATE_IDS.classifyCustomPrompt,
    outputSchemaId: SCHEMA_IDS.customPromptClassificationOutput,
    body: CLASSIFY_CUSTOM_PROMPT_BODY,
    requiredVars: ['questionId', 'questionPrompt', 'selectedOptionIdsJson', 'customText'],
  },
  [TEMPLATE_IDS.expandClarification]: {
    id: TEMPLATE_IDS.expandClarification,
    outputSchemaId: SCHEMA_IDS.clarificationFollowUpOutput,
    body: EXPAND_CLARIFICATION_BODY,
    requiredVars: [
      'sourceQuestionId',
      'sourceQuestionPrompt',
      'sourceOptionsJson',
      'clarifyingQuestionText',
      'nextQuestionOrdinal',
    ],
  },
} as const;

/**
 * Look up a prompt template by its ID.
 * Throws if the template ID is not recognized.
 */
export function getPromptTemplate(templateId: PromptTemplateId): PromptTemplate {
  const template = PROMPT_TEMPLATES[templateId];
  if (!template) {
    throw new Error(`Unknown prompt template ID: ${templateId}`);
  }
  return template;
}

/**
 * All registered prompt template IDs.
 */
export function getAllTemplateIds(): PromptTemplateId[] {
  return Object.values(TEMPLATE_IDS);
}
