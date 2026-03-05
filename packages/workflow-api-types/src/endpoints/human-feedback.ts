import { z } from 'zod';

const isoDateTime = z.string().datetime({ offset: true });

export const runFeedbackRequestStatusSchema = z.enum([
  'awaiting_response',
  'responded',
  'cancelled',
]);

const parseStatusCsv = (value: string): string[] =>
  value
    .split(',')
    .map((status) => status.trim())
    .filter((status) => status.length > 0);

const statusCsvSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => {
    const statuses = parseStatusCsv(value);
    if (statuses.length === 0) {
      return false;
    }

    const parsedStatuses = statuses.map((status) =>
      runFeedbackRequestStatusSchema.safeParse(status),
    );
    return parsedStatuses.every((parsedStatus) => parsedStatus.success);
  }, 'status must be a CSV of awaiting_response|responded|cancelled');

export const submitHumanFeedbackResponsePayloadSchema = z
  .object({
    questionId: z.string().trim().min(1),
    selectedOptionIds: z.array(z.number().int().min(1)).optional(),
    text: z.string().optional(),
  })
  .strict();

export const submitHumanFeedbackResponseRequestSchema = z
  .object({
    response: submitHumanFeedbackResponsePayloadSchema,
    respondedBy: z.string().trim().min(1),
  })
  .strict();

export const submitHumanFeedbackResponseResponseSchema = z.object({
  feedbackRunId: z.string(),
  status: z.literal('accepted'),
  acceptedAt: isoDateTime,
});

export const submitHumanFeedbackResponseConflictSchema = z.object({
  feedbackRunId: z.string(),
  status: runFeedbackRequestStatusSchema,
  respondedAt: isoDateTime.nullable().optional(),
  cancelledAt: isoDateTime.nullable().optional(),
});

export const runFeedbackRequestSummarySchema = z.object({
  feedbackRunId: z.string(),
  parentRunId: z.string(),
  questionId: z.string(),
  status: runFeedbackRequestStatusSchema,
  requestedAt: isoDateTime,
  respondedAt: isoDateTime.nullable(),
  cancelledAt: isoDateTime.nullable(),
  respondedBy: z.string().nullable(),
  prompt: z.string(),
  options: z
    .array(
      z.object({
        id: z.number().int().min(1),
        label: z.string(),
        description: z.string().optional(),
      }),
    )
    .nullable(),
  constraints: z.array(z.string()).nullable(),
});

export const humanFeedbackRequestStatusResponseSchema = runFeedbackRequestSummarySchema.extend({
  parentWorkflowType: z.string(),
  parentState: z.string(),
  requestEventId: z.string(),
  correlationId: z.string().nullable(),
  response: submitHumanFeedbackResponsePayloadSchema.nullable(),
});

export const listRunFeedbackRequestsQuerySchema = z.object({
  status: statusCsvSchema.default('awaiting_response,responded'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().trim().min(1).optional(),
});

export const listRunFeedbackRequestsResponseSchema = z.object({
  items: z.array(runFeedbackRequestSummarySchema),
  nextCursor: z.string().optional(),
});

export type SubmitHumanFeedbackResponsePayload = z.infer<
  typeof submitHumanFeedbackResponsePayloadSchema
>;
export type SubmitHumanFeedbackResponseRequest = z.infer<
  typeof submitHumanFeedbackResponseRequestSchema
>;
export type SubmitHumanFeedbackResponseResponse = z.infer<
  typeof submitHumanFeedbackResponseResponseSchema
>;
export type SubmitHumanFeedbackResponseConflict = z.infer<
  typeof submitHumanFeedbackResponseConflictSchema
>;
export type RunFeedbackRequestSummary = z.infer<typeof runFeedbackRequestSummarySchema>;
export type HumanFeedbackRequestStatusResponse = z.infer<
  typeof humanFeedbackRequestStatusResponseSchema
>;
export type ListRunFeedbackRequestsQuery = z.infer<typeof listRunFeedbackRequestsQuerySchema>;
export type ListRunFeedbackRequestsResponse = z.infer<typeof listRunFeedbackRequestsResponseSchema>;
