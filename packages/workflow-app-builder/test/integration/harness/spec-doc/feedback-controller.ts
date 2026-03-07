/**
 * Feedback response controller for `app-builder.spec-doc.v1` integration tests.
 *
 * Intercepts `ctx.launchChild` calls targeting `server.human-feedback.v1` and
 * returns programmatic responses. Supports valid/invalid/concurrent submission
 * permutations and barrier/latch controls for race testing.
 *
 * Requirement: SD-HAR-002-FeedbackControllerPermutations
 *
 * @module test/integration/harness/spec-doc/feedback-controller
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Input shape for `server.human-feedback.v1` child launches (contract boundary). */
export interface FeedbackChildInput {
  prompt: string;
  options: Array<{ id: number; label: string; description?: string }>;
  questionId: string;
  requestedByRunId: string;
  requestedByWorkflowType: string;
  requestedByState?: string;
}

/** Output shape from a completed `server.human-feedback.v1` child. */
export interface FeedbackChildOutput {
  status: 'responded' | 'cancelled';
  response?: {
    questionId: string;
    selectedOptionIds?: number[];
    text?: string;
  };
  respondedAt?: string;
  cancelledAt?: string;
}

/** Recorded metadata for each feedback child launch. */
export interface FeedbackCallRecord {
  questionId: string;
  prompt: string;
  options: Array<{ id: number; label: string; description?: string }>;
  requestedByRunId: string;
  requestedByWorkflowType: string;
  requestedByState?: string;
  correlationId?: string;
  idempotencyKey?: string;
  calledAt: string;
}

/**
 * A staged feedback response for a specific question.
 *
 * Use `response` for normal responses, `cancel` for cancellation,
 * and `barrier` for concurrent/race testing.
 */
export interface FeedbackResponseConfig {
  /** Selected option IDs to include in the response. */
  selectedOptionIds?: number[];
  /** Custom text to include in the response. */
  text?: string;
  /** If true, returns a cancelled status instead of responded. */
  cancel?: boolean;
  /**
   * If provided, the response will be delayed until this promise resolves.
   * Use with latches/barriers for race condition testing.
   */
  barrier?: Promise<void>;
}

/** Configuration map keyed by questionId. Supports multiple staged responses. */
export type FeedbackResponseMap = Partial<Record<string, FeedbackResponseConfig[]>>;

/** The feedback controller instance. */
export interface FeedbackController {
  /**
   * Resolve a child launch request. Should be called when
   * `workflowType === 'server.human-feedback.v1'`.
   */
  resolve(req: {
    workflowType: string;
    input: FeedbackChildInput;
    correlationId?: string;
    idempotencyKey?: string;
  }): Promise<FeedbackChildOutput>;

  /** All recorded calls in order. */
  readonly calls: readonly FeedbackCallRecord[];

  /** Calls filtered by questionId. */
  callsByQuestionId(questionId: string): FeedbackCallRecord[];

  /** Number of calls made. */
  readonly callCount: number;

  /** Reset call history and staged responses. */
  reset(responses?: FeedbackResponseMap): void;

  /** Push additional staged responses for a questionId (appended after existing). */
  addResponses(questionId: string, responses: FeedbackResponseConfig[]): void;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a feedback response controller.
 *
 * @param initialResponses - Optional initial response map keyed by questionId.
 *   Each questionId maps to an array of responses consumed in order (FIFO).
 *   When the array is exhausted, subsequent calls for that questionId will throw.
 */
export function createFeedbackController(
  initialResponses?: FeedbackResponseMap,
): FeedbackController {
  let responses: Map<string, FeedbackResponseConfig[]> = new Map();
  const calls: FeedbackCallRecord[] = [];

  function loadResponses(map?: FeedbackResponseMap): void {
    responses = new Map();
    if (!map) return;
    for (const [questionId, items] of Object.entries(map)) {
      if (items) {
        responses.set(questionId, [...items]);
      }
    }
  }

  loadResponses(initialResponses);

  const controller: FeedbackController = {
    async resolve(req) {
      const { input } = req;
      const { questionId } = input;

      const record: FeedbackCallRecord = {
        questionId,
        prompt: input.prompt,
        options: input.options,
        requestedByRunId: input.requestedByRunId,
        requestedByWorkflowType: input.requestedByWorkflowType,
        requestedByState: input.requestedByState,
        correlationId: req.correlationId,
        idempotencyKey: req.idempotencyKey,
        calledAt: new Date().toISOString(),
      };
      calls.push(record);

      // Look up staged response
      const questionQueue = responses.get(questionId);
      if (!questionQueue || questionQueue.length === 0) {
        throw new Error(
          `[FeedbackController] No staged response for questionId "${questionId}" ` +
            `(call #${calls.length})`,
        );
      }

      const config = questionQueue.shift()!;

      // Wait on barrier if present (for race condition testing)
      if (config.barrier) {
        await config.barrier;
      }

      // Cancellation
      if (config.cancel) {
        return {
          status: 'cancelled' as const,
          cancelledAt: new Date().toISOString(),
        };
      }

      // Normal response
      return {
        status: 'responded' as const,
        response: {
          questionId,
          selectedOptionIds: config.selectedOptionIds,
          text: config.text,
        },
        respondedAt: new Date().toISOString(),
      };
    },

    get calls() {
      return calls;
    },

    callsByQuestionId(questionId: string) {
      return calls.filter((c) => c.questionId === questionId);
    },

    get callCount() {
      return calls.length;
    },

    reset(newResponses?: FeedbackResponseMap) {
      calls.length = 0;
      loadResponses(newResponses);
    },

    addResponses(questionId: string, items: FeedbackResponseConfig[]) {
      const existing = responses.get(questionId) ?? [];
      existing.push(...items);
      responses.set(questionId, existing);
    },
  };

  return controller;
}

// ---------------------------------------------------------------------------
// Latch helper (lightweight, no external dependencies)
// ---------------------------------------------------------------------------

/** A single-shot gate for barrier-based race testing. */
export interface Latch {
  /** Returns a promise that resolves when the latch is released. */
  readonly promise: Promise<void>;
  /** Release the latch, resolving all waiters. */
  release(): void;
  /** Whether the latch has been released. */
  readonly isReleased: boolean;
}

/** Create a single-shot latch for barrier-based synchronization. */
export function createLatch(): Latch {
  let released = false;
  let resolver: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => {
    resolver = resolve;
  });

  return {
    get promise() {
      return promise;
    },
    release() {
      if (!released) {
        released = true;
        resolver?.();
      }
    },
    get isReleased() {
      return released;
    },
  };
}
