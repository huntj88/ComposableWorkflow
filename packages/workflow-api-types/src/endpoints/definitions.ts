import { z } from 'zod';

export const workflowDefinitionResponseSchema = z.object({
  workflowType: z.string(),
  workflowVersion: z.string(),
  states: z.array(z.string()),
  transitions: z.array(
    z.object({
      from: z.string(),
      to: z.string(),
      name: z.string().optional(),
    }),
  ),
  childLaunchAnnotations: z.array(z.record(z.unknown())),
  metadata: z.record(z.unknown()),
});

export type WorkflowDefinitionResponse = z.infer<typeof workflowDefinitionResponseSchema>;
