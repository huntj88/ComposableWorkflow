import {
  errorEnvelopeSchema,
  submitHumanFeedbackResponseConflictSchema,
  type ErrorEnvelope,
  type SubmitHumanFeedbackResponseConflict,
} from '@composable-workflow/workflow-api-types';

export type PanelScope =
  | 'runs'
  | 'summary'
  | 'tree'
  | 'events'
  | 'logs'
  | 'definition'
  | 'feedback'
  | 'feedback-submit'
  | 'feedback-status';

type ParsePanelErrorOptions = {
  panel: PanelScope;
  fallbackMessage: string;
  parseFeedbackConflict?: boolean;
};

export class WorkflowPanelError extends Error {
  readonly panel: PanelScope;
  readonly status: number;
  readonly code: string | null;
  readonly requestId: string | null;
  readonly details: Record<string, unknown> | null;
  readonly feedbackConflict: SubmitHumanFeedbackResponseConflict | null;

  constructor(args: {
    panel: PanelScope;
    status: number;
    message: string;
    code?: string | null;
    requestId?: string | null;
    details?: Record<string, unknown> | null;
    feedbackConflict?: SubmitHumanFeedbackResponseConflict | null;
  }) {
    super(args.message);
    this.name = 'WorkflowPanelError';
    this.panel = args.panel;
    this.status = args.status;
    this.code = args.code ?? null;
    this.requestId = args.requestId ?? null;
    this.details = args.details ?? null;
    this.feedbackConflict = args.feedbackConflict ?? null;
  }
}

export const tryParseErrorEnvelope = (payload: unknown): ErrorEnvelope | null => {
  const parsed = errorEnvelopeSchema.safeParse(payload);
  return parsed.success ? parsed.data : null;
};

export const formatErrorEnvelopeMessage = (envelope: ErrorEnvelope): string =>
  `${envelope.code}: ${envelope.message} (${envelope.requestId})`;

const tryParseFeedbackConflict = (payload: unknown): SubmitHumanFeedbackResponseConflict | null => {
  const parsed = submitHumanFeedbackResponseConflictSchema.safeParse(payload);
  return parsed.success ? parsed.data : null;
};

export const parsePanelErrorResponse = async (
  response: Response,
  options: ParsePanelErrorOptions,
): Promise<WorkflowPanelError> => {
  let payload: unknown = null;

  try {
    payload = (await response.json()) as unknown;
  } catch {
    payload = null;
  }

  if (options.parseFeedbackConflict === true && response.status === 409) {
    const conflict = tryParseFeedbackConflict(payload);

    if (conflict !== null) {
      const terminalTimestamp = conflict.respondedAt ?? conflict.cancelledAt ?? 'n/a';
      return new WorkflowPanelError({
        panel: options.panel,
        status: response.status,
        code: 'FEEDBACK_CONFLICT',
        requestId: null,
        details: null,
        feedbackConflict: conflict,
        message: `Feedback request is terminal (${conflict.status}, ${terminalTimestamp}).`,
      });
    }
  }

  const envelope = tryParseErrorEnvelope(payload);
  if (envelope !== null) {
    return new WorkflowPanelError({
      panel: options.panel,
      status: response.status,
      code: envelope.code,
      requestId: envelope.requestId,
      details: envelope.details ?? null,
      feedbackConflict: null,
      message: formatErrorEnvelopeMessage(envelope),
    });
  }

  return new WorkflowPanelError({
    panel: options.panel,
    status: response.status,
    code: null,
    requestId: null,
    details: null,
    feedbackConflict: null,
    message: options.fallbackMessage,
  });
};
