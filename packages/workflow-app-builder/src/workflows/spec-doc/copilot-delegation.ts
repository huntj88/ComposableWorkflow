/**
 * Delegation helper for `app-builder.spec-doc.v1` copilot prompt calls.
 *
 * All states that need AI-generated output delegate through this single helper,
 * which normalizes child workflow invocation, enforces schema presence, and
 * forwards `copilotPromptOptions`. Template IDs are included for observability.
 *
 * @module spec-doc/copilot-delegation
 */

import type { WorkflowContext } from '@composable-workflow/workflow-lib/contracts';

import {
  COPILOT_APP_BUILDER_WORKFLOW_TYPE,
  type CopilotAppBuilderInput,
  type CopilotAppBuilderOutput,
} from '../copilot-prompt.js';
import type { CopilotPromptOptions } from './contracts.js';
import {
  type PromptTemplateId,
  type PromptTemplate,
  getPromptTemplate,
  interpolate,
} from './prompt-templates.js';
import { loadSchemaById, type SpecDocSchemaId } from './schemas.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Input to the delegation helper.
 *
 * Every call must supply `templateId` and `outputSchemaId`.
 * `inputSchemaId` is optional and only required for states that need input
 * validation (e.g., `IntegrateIntoSpec`).
 */
export interface CopilotDelegationRequest {
  /** Versioned prompt template identifier (observability key). */
  templateId: PromptTemplateId;
  /** Schema ID for the required `outputSchema` follow-up. */
  outputSchemaId: SpecDocSchemaId;
  /** Optional schema ID for input validation (forwarded as context only). */
  inputSchemaId?: SpecDocSchemaId;
  /** Interpolation variables for the prompt template body. */
  variables: Record<string, string>;
  /** Current FSM state name (for logging / error context). */
  state: string;
  /** Options forwarded to `app-builder.copilot.prompt.v1`. */
  copilotPromptOptions?: CopilotPromptOptions;
}

/**
 * Validated delegation result wrapping the parsed `structuredOutput`.
 */
export interface CopilotDelegationResult<T = unknown> {
  /** The parsed and typed structured output from the copilot child. */
  structuredOutput: T;
  /** The raw structured output string, if available. */
  structuredOutputRaw?: string;
  /** The template ID used for the delegation (for traceability). */
  templateId: PromptTemplateId;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a {@link CopilotDelegationRequest} from a template and variables,
 * inheriting `outputSchemaId` and `inputSchemaId` from the template definition.
 */
export function buildDelegationRequest(
  templateId: PromptTemplateId,
  variables: Record<string, string>,
  state: string,
  copilotPromptOptions?: CopilotPromptOptions,
): CopilotDelegationRequest {
  const template: PromptTemplate = getPromptTemplate(templateId);
  return {
    templateId,
    outputSchemaId: template.outputSchemaId,
    inputSchemaId: template.inputSchemaId,
    variables,
    state,
    copilotPromptOptions,
  };
}

// ---------------------------------------------------------------------------
// Core delegation
// ---------------------------------------------------------------------------

/**
 * Delegate a prompt to `app-builder.copilot.prompt.v1` through a single
 * normalized path that enforces `outputSchema` presence and forwards
 * `copilotPromptOptions`.
 *
 * @throws Error if `outputSchemaId` is missing (SD-Prompt-003).
 * @throws Error if the child workflow does not return `structuredOutput`.
 */
export async function delegateToCopilot<T = unknown>(
  ctx: WorkflowContext<unknown, unknown>,
  request: CopilotDelegationRequest,
): Promise<CopilotDelegationResult<T>> {
  // SD-Prompt-003: outputSchema is always required
  if (!request.outputSchemaId) {
    throw new Error(
      `[${request.state}] Delegation to copilot prompt requires outputSchemaId (template: ${request.templateId})`,
    );
  }

  const template = getPromptTemplate(request.templateId);
  const prompt = interpolate(template.body, request.variables);

  // Load the output schema JSON and stringify for the copilot child
  const outputSchemaObj = loadSchemaById(request.outputSchemaId);
  const outputSchema = JSON.stringify(outputSchemaObj);

  // Build child workflow input, forwarding copilotPromptOptions
  const childInput: CopilotAppBuilderInput = {
    prompt,
    outputSchema,
    ...(request.copilotPromptOptions?.baseArgs && {
      baseArgs: request.copilotPromptOptions.baseArgs,
    }),
    ...(request.copilotPromptOptions?.allowedDirs && {
      allowedDirs: request.copilotPromptOptions.allowedDirs,
    }),
    ...(request.copilotPromptOptions?.timeoutMs !== undefined && {
      timeoutMs: request.copilotPromptOptions.timeoutMs,
    }),
    ...(request.copilotPromptOptions?.cwd && {
      cwd: request.copilotPromptOptions.cwd,
    }),
  };

  ctx.log({
    level: 'info',
    message: `Delegating to copilot prompt: ${request.templateId}`,
    payload: {
      templateId: request.templateId,
      state: request.state,
      outputSchemaId: request.outputSchemaId,
      ...(request.inputSchemaId && { inputSchemaId: request.inputSchemaId }),
    },
  });

  const childOutput = await ctx.launchChild<CopilotAppBuilderInput, CopilotAppBuilderOutput>({
    workflowType: COPILOT_APP_BUILDER_WORKFLOW_TYPE,
    input: childInput,
    correlationId: `${request.state}:${request.templateId}`,
  });

  // SD-Prompt-004: branching requires validated structuredOutput
  if (childOutput.structuredOutput === undefined || childOutput.structuredOutput === null) {
    throw new Error(
      `[${request.state}] Copilot prompt did not return structuredOutput ` +
        `(template: ${request.templateId}). Raw: ${childOutput.structuredOutputRaw ?? '<empty>'}`,
    );
  }

  return {
    structuredOutput: childOutput.structuredOutput as T,
    structuredOutputRaw: childOutput.structuredOutputRaw,
    templateId: request.templateId,
  };
}
