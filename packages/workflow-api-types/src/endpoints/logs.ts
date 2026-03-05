import { z } from 'zod';

const isoDateTime = z.string().datetime({ offset: true });

export const getRunLogsQuerySchema = z.object({}).strict();

export const workflowLogEntryDtoSchema = z.object({
  eventId: z.string(),
  runId: z.string(),
  sequence: z.number().int().positive(),
  eventType: z.string(),
  timestamp: isoDateTime,
  level: z.string(),
  message: z.string(),
  payload: z.record(z.unknown()).nullable(),
});

export const runLogsResponseSchema = z.object({
  items: z.array(workflowLogEntryDtoSchema),
});

export type GetRunLogsQuery = z.infer<typeof getRunLogsQuerySchema>;
export type WorkflowLogEntryDto = z.infer<typeof workflowLogEntryDtoSchema>;
export type RunLogsResponse = z.infer<typeof runLogsResponseSchema>;
