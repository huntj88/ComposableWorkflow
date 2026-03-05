import { z } from 'zod';

const isoDateTime = z.string().datetime({ offset: true });

export const eventCursorBrandSchema = z.string().min(1);
export type EventCursor = string & { readonly __eventCursor: unique symbol };

export const workflowEventDtoSchema = z.object({
  eventId: z.string(),
  runId: z.string(),
  workflowType: z.string(),
  parentRunId: z.string().nullable(),
  sequence: z.number().int().positive(),
  eventType: z.string(),
  state: z.string().nullable(),
  transition: z
    .object({
      from: z.string().optional(),
      to: z.string().optional(),
      name: z.string().optional(),
    })
    .nullable(),
  child: z
    .object({
      childRunId: z.string(),
      childWorkflowType: z.string(),
      lifecycle: z.string(),
    })
    .nullable(),
  command: z
    .object({
      command: z.string(),
      args: z.array(z.string()).optional(),
      stdin: z.string().optional(),
      stdout: z.string().optional(),
      stderr: z.string().optional(),
      exitCode: z.number().optional(),
    })
    .nullable(),
  timestamp: isoDateTime,
  payload: z.record(z.unknown()).nullable(),
  error: z.record(z.unknown()).nullable(),
});

export const runEventsResponseSchema = z.object({
  items: z.array(workflowEventDtoSchema),
  nextCursor: z.string().optional(),
});

export type WorkflowEventDto = z.infer<typeof workflowEventDtoSchema>;
export type RunEventsResponse = z.infer<typeof runEventsResponseSchema>;
