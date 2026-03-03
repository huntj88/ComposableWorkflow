import { z } from 'zod';

const isoDateTime = z.string().datetime({ offset: true });

export const humanFeedbackStatusSchema = z.enum(['awaiting_response', 'responded', 'cancelled']);

export const humanFeedbackResponsePayloadSchema = z
  .object({
    questionId: z.string().trim().min(1),
    selectedOptionIds: z.array(z.number().int().min(1)).optional(),
    text: z.string().optional(),
  })
  .strict();

export const humanFeedbackRespondBodySchema = z
  .object({
    response: humanFeedbackResponsePayloadSchema,
    respondedBy: z.string().trim().min(1),
  })
  .strict();

export const humanFeedbackRespondSuccessSchema = z.object({
  feedbackRunId: z.string(),
  status: z.literal('accepted'),
  acceptedAt: isoDateTime,
});

export const humanFeedbackRespondConflictSchema = z.object({
  feedbackRunId: z.string(),
  status: humanFeedbackStatusSchema,
  respondedAt: isoDateTime.nullable().optional(),
  cancelledAt: isoDateTime.nullable().optional(),
});

export const humanFeedbackRequestStatusSchema = z.object({
  feedbackRunId: z.string(),
  parentRunId: z.string(),
  parentWorkflowType: z.string(),
  parentState: z.string(),
  questionId: z.string(),
  requestEventId: z.string(),
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
  correlationId: z.string().nullable(),
  status: humanFeedbackStatusSchema,
  requestedAt: isoDateTime,
  respondedAt: isoDateTime.nullable(),
  cancelledAt: isoDateTime.nullable(),
  response: humanFeedbackResponsePayloadSchema.nullable(),
  respondedBy: z.string().nullable(),
});

export const humanFeedbackListQuerySchema = z.object({
  status: humanFeedbackStatusSchema.optional(),
});

export const humanFeedbackListResponseSchema = z.object({
  items: z.array(humanFeedbackRequestStatusSchema),
});
