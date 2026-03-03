export const SERVER_HUMAN_FEEDBACK_WORKFLOW_TYPE = 'server.human-feedback.v1';
export const SERVER_HUMAN_FEEDBACK_WORKFLOW_VERSION = '1.0.0';
export const INTERNAL_SERVER_WORKFLOW_PACKAGE_NAME =
  '@composable-workflow/workflow-server-internal';
export const INTERNAL_SERVER_WORKFLOW_PACKAGE_VERSION = '1.0.0';

export interface HumanFeedbackOption {
  id: number;
  label: string;
  description?: string;
}

export interface HumanFeedbackRequestInput {
  prompt: string;
  options: HumanFeedbackOption[];
  constraints?: string[];
  questionId: string;
  correlationId?: string;
  requestedByRunId: string;
  requestedByWorkflowType: string;
  requestedByState?: string;
}

export interface HumanFeedbackResponsePayload {
  questionId: string;
  selectedOptionIds?: number[];
  text?: string;
}

export interface HumanFeedbackRequestOutput {
  status: 'responded' | 'cancelled';
  response?: HumanFeedbackResponsePayload;
  respondedAt?: string;
  cancelledAt?: string;
}

const assertNonEmptyString = (value: unknown, fieldName: string): string => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Human feedback input.${fieldName} must be a non-empty string`);
  }

  return value;
};

const parseOptions = (value: unknown): HumanFeedbackOption[] => {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('Human feedback input.options must be a non-empty array');
  }

  const options = value.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throw new Error(`Human feedback input.options[${index}] must be an object`);
    }

    const candidate = item as Record<string, unknown>;
    const id = candidate.id;

    if (!Number.isInteger(id)) {
      throw new Error(`Human feedback input.options[${index}].id must be an integer`);
    }

    if ((id as number) <= 0) {
      throw new Error(`Human feedback input.options[${index}].id must be greater than zero`);
    }

    const label = assertNonEmptyString(candidate.label, `options[${index}].label`);
    const description =
      candidate.description === undefined
        ? undefined
        : assertNonEmptyString(candidate.description, `options[${index}].description`);

    return {
      id: id as number,
      label,
      ...(description ? { description } : {}),
    };
  });

  const seenIds = new Set(options.map((item) => item.id));
  if (seenIds.size !== options.length) {
    throw new Error('Human feedback input.options ids must be unique');
  }

  for (let expected = 1; expected <= options.length; expected += 1) {
    if (!seenIds.has(expected)) {
      throw new Error('Human feedback input.options ids must be contiguous integers starting at 1');
    }
  }

  return options;
};

const parseConstraints = (value: unknown): string[] | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new Error('Human feedback input.constraints must be an array when provided');
  }

  return value.map((item, index) => assertNonEmptyString(item, `constraints[${index}]`));
};

export const parseHumanFeedbackRequestInput = (value: unknown): HumanFeedbackRequestInput => {
  if (!value || typeof value !== 'object') {
    throw new Error('Human feedback request input must be an object');
  }

  const candidate = value as Record<string, unknown>;

  const prompt = assertNonEmptyString(candidate.prompt, 'prompt');
  const options = parseOptions(candidate.options);
  const questionId = assertNonEmptyString(candidate.questionId, 'questionId');
  const requestedByRunId = assertNonEmptyString(candidate.requestedByRunId, 'requestedByRunId');
  const requestedByWorkflowType = assertNonEmptyString(
    candidate.requestedByWorkflowType,
    'requestedByWorkflowType',
  );

  if (candidate.correlationId !== undefined && typeof candidate.correlationId !== 'string') {
    throw new Error('Human feedback input.correlationId must be a string when provided');
  }

  if (candidate.requestedByState !== undefined && typeof candidate.requestedByState !== 'string') {
    throw new Error('Human feedback input.requestedByState must be a string when provided');
  }

  return {
    prompt,
    options,
    constraints: parseConstraints(candidate.constraints),
    questionId,
    correlationId:
      typeof candidate.correlationId === 'string' ? candidate.correlationId : undefined,
    requestedByRunId,
    requestedByWorkflowType,
    requestedByState:
      typeof candidate.requestedByState === 'string' ? candidate.requestedByState : undefined,
  };
};
