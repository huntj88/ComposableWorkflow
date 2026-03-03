/**
 * Deterministic copilot prompt test double for `app-builder.spec-doc.v1`
 * integration tests.
 *
 * Intercepts `ctx.launchChild` calls targeting `app-builder.copilot.prompt.v1`
 * and returns pre-configured responses keyed by FSM state. Records all call
 * metadata (template ID, output schema, interpolation variables) for assertion.
 *
 * Requirement: SD-HAR-001-CopilotDoubleStateInjection
 *
 * @module test/integration/harness/spec-doc/copilot-double
 */

import type { CopilotAppBuilderOutput } from '../../../../src/workflows/copilot-prompt.js';
import type { PromptTemplateId } from '../../../../src/workflows/spec-doc/prompt-templates.js';
import type { SpecDocSchemaId } from '../../../../src/workflows/spec-doc/schemas.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Metadata recorded for each copilot delegation call. */
export interface CopilotCallRecord {
  /** The FSM state that initiated the delegation. */
  state: string;
  /** The prompt template ID used. */
  templateId: PromptTemplateId;
  /** The output schema ID requested. */
  outputSchemaId: SpecDocSchemaId;
  /** The input schema ID, if present. */
  inputSchemaId?: SpecDocSchemaId;
  /** The fully interpolated prompt string sent to the copilot child. */
  prompt: string;
  /** The raw output schema JSON string. */
  outputSchemaRaw: string;
  /** The correlation ID from the child request. */
  correlationId: string;
  /** Timestamp of the call. */
  calledAt: string;
}

/**
 * A configured response for a specific FSM state.
 *
 * Use `structuredOutput` for success responses and `failure` for error injection.
 * If both are set, `failure` takes precedence.
 */
export interface CopilotStateResponse {
  /** The structured output to return (parsed object, not raw string). */
  structuredOutput?: unknown;
  /** The raw structured output string. Defaults to `JSON.stringify(structuredOutput)`. */
  structuredOutputRaw?: string;
  /**
   * If set, the call will reject with this error instead of returning output.
   * Takes precedence over `structuredOutput`.
   */
  failure?: Error;
}

/** Configuration map keyed by FSM state name. Supports multiple staged responses per state. */
export type CopilotResponseMap = Partial<Record<string, CopilotStateResponse[]>>;

/** The copilot test double instance. */
export interface CopilotDouble {
  /**
   * Resolve a child launch request. Should be called when
   * `workflowType === 'app-builder.copilot.prompt.v1'`.
   *
   * The state is extracted from the `correlationId` field (`state:templateId`).
   */
  resolve(req: {
    workflowType: string;
    input: { prompt: string; outputSchema?: string };
    correlationId?: string;
  }): Promise<CopilotAppBuilderOutput>;

  /** All recorded calls in order. */
  readonly calls: readonly CopilotCallRecord[];

  /** Calls filtered by FSM state. */
  callsByState(state: string): CopilotCallRecord[];

  /** Calls filtered by template ID. */
  callsByTemplateId(templateId: PromptTemplateId): CopilotCallRecord[];

  /** Number of calls made. */
  readonly callCount: number;

  /** Reset call history and staged responses. */
  reset(responses?: CopilotResponseMap): void;

  /** Push additional staged responses for a state (appended after existing). */
  addResponses(state: string, responses: CopilotStateResponse[]): void;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a deterministic copilot prompt test double.
 *
 * @param initialResponses - Optional initial response map keyed by FSM state.
 *   Each state maps to an array of responses consumed in order (FIFO).
 *   When the array is exhausted, subsequent calls for that state will throw.
 */
export function createCopilotDouble(initialResponses?: CopilotResponseMap): CopilotDouble {
  let responses: Map<string, CopilotStateResponse[]> = new Map();
  const calls: CopilotCallRecord[] = [];

  function loadResponses(map?: CopilotResponseMap): void {
    responses = new Map();
    if (!map) return;
    for (const [state, items] of Object.entries(map)) {
      if (items) {
        responses.set(state, [...items]);
      }
    }
  }

  loadResponses(initialResponses);

  function parseCorrelationId(correlationId?: string): { state: string; templateId: string } {
    if (!correlationId) {
      return { state: 'unknown', templateId: 'unknown' };
    }
    const colonIndex = correlationId.indexOf(':');
    if (colonIndex === -1) {
      return { state: correlationId, templateId: 'unknown' };
    }
    return {
      state: correlationId.slice(0, colonIndex),
      templateId: correlationId.slice(colonIndex + 1),
    };
  }

  const double: CopilotDouble = {
    async resolve(req) {
      const { state, templateId } = parseCorrelationId(req.correlationId);

      // Extract output schema ID from the raw JSON if possible
      let outputSchemaId = '' as SpecDocSchemaId;
      let inputSchemaId: SpecDocSchemaId | undefined;
      if (req.input.outputSchema) {
        try {
          const parsed = JSON.parse(req.input.outputSchema) as { $id?: string };
          outputSchemaId = (parsed.$id ?? '') as SpecDocSchemaId;
        } catch {
          // leave empty
        }
      }

      const record: CopilotCallRecord = {
        state,
        templateId: templateId as PromptTemplateId,
        outputSchemaId,
        inputSchemaId,
        prompt: req.input.prompt,
        outputSchemaRaw: req.input.outputSchema ?? '',
        correlationId: req.correlationId ?? '',
        calledAt: new Date().toISOString(),
      };
      calls.push(record);

      // Look up staged response
      const stateQueue = responses.get(state);
      if (!stateQueue || stateQueue.length === 0) {
        throw new Error(
          `[CopilotDouble] No staged response for state "${state}" ` +
            `(templateId: ${templateId}, call #${calls.length})`,
        );
      }

      const response = stateQueue.shift()!;

      // Failure injection takes precedence
      if (response.failure) {
        throw response.failure;
      }

      const structuredOutput = response.structuredOutput ?? null;
      const structuredOutputRaw =
        response.structuredOutputRaw ??
        (structuredOutput != null ? JSON.stringify(structuredOutput) : undefined);

      return {
        status: 'completed' as const,
        prompt: req.input.prompt,
        exitCode: 0,
        stdout: structuredOutputRaw ?? '',
        stderr: '',
        sessionId: `test-session-${calls.length}`,
        structuredOutputRaw,
        structuredOutput,
      };
    },

    get calls() {
      return calls;
    },

    callsByState(state: string) {
      return calls.filter((c) => c.state === state);
    },

    callsByTemplateId(templateId: PromptTemplateId) {
      return calls.filter((c) => c.templateId === templateId);
    },

    get callCount() {
      return calls.length;
    },

    reset(newResponses?: CopilotResponseMap) {
      calls.length = 0;
      loadResponses(newResponses);
    },

    addResponses(state: string, items: CopilotStateResponse[]) {
      const existing = responses.get(state) ?? [];
      existing.push(...items);
      responses.set(state, existing);
    },
  };

  return double;
}
