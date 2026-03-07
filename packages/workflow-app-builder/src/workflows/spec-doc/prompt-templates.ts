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
2) Integrate all provided constraints, normalized numbered-options answers, and immediate actionable items.
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
- actionableItems: {{actionableItemsJson}}

Spec quality requirements:
- No unresolved contradictions in scope, constraints, or interface contracts.
- Acceptance criteria must be testable and unambiguous.
- Keep language implementation-ready and avoid vague statements.
- Enough detail to implement without ambiguity.
- When actionableItems are present, treat them as ordered concrete edit directives for the current pass.`;

// -- 7.2.2 LogicalConsistencyCheckCreateFollowUpQuestions -------------------

const CONSISTENCY_CHECK_BODY = `You are validating a spec document for implementation readiness and generating deterministic numbered follow-up questions.

Input context:
- request: {{request}}
- specPath: {{specPath}}
- constraints: {{constraintsJson}}
- currentLoopCount: {{loopCount}}
- remainingQuestionIdsFromIntegration: {{remainingQuestionIdsJson}}
- currentStageId: {{stageId}}

Evaluation checklist (must map to readinessChecklist booleans):
1) Scope/objective present.
2) Non-goals present.
3) Constraints/assumptions explicit.
4) Interfaces/contracts defined where needed.
5) Acceptance criteria testable.
6) No contradictions or unresolved issues.
7) Enough detail to implement without ambiguity.

Question-generation rules:
- For each issue surfaced in this stage, choose exactly one outcome: immediate \`actionableItems\`, human \`followUpQuestions\`, or no output for that issue.
- If you emit any \`actionableItems\`, return an empty \`followUpQuestions\` array for this stage.
- If you emit any \`followUpQuestions\`, return an empty \`actionableItems\` array for this stage.
- If no blocking issues remain for this stage: return empty \`actionableItems\` and empty \`followUpQuestions\` arrays.
- \`actionableItems\` must contain only concrete edits that can be integrated without another human decision.
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
- intent = clarifying-question when the custom text is primarily asking for clarification, disambiguation, or additional information needed to answer the current numbered question.
- Questions about the existing implementation, repository, or spec draft still count as clarifying-question when that research is being used to answer the current numbered question.
- intent = unrelated-question when the custom text is primarily a side research task about the spec, implementation, or repository and is not itself an answer to the current numbered question.
- Use unrelated-question only for side research that does not move the current numbered question toward an answer.
- intent = custom-answer when the custom text primarily provides an answer, preference, constraint, or detail to be integrated. An actionable item may sometimes be phrased as a question.
- For question intents, populate \`customQuestionText\` with the normalized question text that should be researched next.
- Choose exactly one intent.`;

// -- 7.2.4 ExpandQuestionWithClarification ----------------------------------

const EXPAND_CLARIFICATION_BODY = `Research the user's question against the current spec draft and relevant repository implementation context before deciding whether another human question is needed.

Input context:
- request: {{request}}
- specPath: {{specPath}}
- sourceQuestionId: {{sourceQuestionId}}
- sourceQuestionPrompt: {{sourceQuestionPrompt}}
- sourceOptions: {{sourceOptionsJson}}
- customQuestionText: {{customQuestionText}}
- intent: {{intent}}

Rules:
1) Research first; do not merely restate the user's question.
2) The delegated run must research the current workflow request, the spec draft at \`specPath\` when present, and workspace context reachable through the workflow's configured Copilot prompt options (\`cwd\`, \`allowedDirs\`).
3) Always return \`researchOutcome\` and \`researchSummary\`.
4) If research resolves the question without remaining ambiguity, set \`researchOutcome = resolved-with-research\` and omit \`followUpQuestion\`.
5) If research finds a remaining decision or ambiguity that requires human input, set \`researchOutcome = needs-follow-up-question\` and create exactly one deterministic numbered \`followUpQuestion\` grounded in the research findings.
6) \`followUpQuestion.questionId\` must be new and deterministic.
7) \`followUpQuestion.options\` must use contiguous integer ids starting at 1.
8) \`followUpQuestion\` options should include \`description\` with concise \`Pros:\` and \`Cons:\` for each choice.
9) Any generated question should minimize ambiguity, be based on the research, and be suitable for asking next while the skipped source question is revisited later.`;

// ---------------------------------------------------------------------------
// Template catalog
// ---------------------------------------------------------------------------

export const PROMPT_TEMPLATES: Record<PromptTemplateId, PromptTemplate> = {
  [TEMPLATE_IDS.integrate]: {
    id: TEMPLATE_IDS.integrate,
    outputSchemaId: SCHEMA_IDS.specIntegrationOutput,
    inputSchemaId: SCHEMA_IDS.specIntegrationInput,
    body: INTEGRATE_BODY,
    requiredVars: [
      'request',
      'source',
      'targetPath',
      'constraintsJson',
      'specPath',
      'answersJson',
      'actionableItemsJson',
    ],
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
      'stageId',
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
      'request',
      'specPath',
      'sourceQuestionId',
      'sourceQuestionPrompt',
      'sourceOptionsJson',
      'customQuestionText',
      'intent',
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
