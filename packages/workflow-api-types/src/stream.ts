import { z } from 'zod';

import { workflowEventDtoSchema } from './endpoints/events.js';

export const workflowStreamEventSchema = z.literal('workflow-event');

export const workflowStreamFrameSchema = z.object({
  event: workflowStreamEventSchema,
  id: z.string().min(1),
  data: workflowEventDtoSchema,
});

export type WorkflowStreamEvent = z.infer<typeof workflowStreamEventSchema>;
export type WorkflowStreamFrame = z.infer<typeof workflowStreamFrameSchema>;
