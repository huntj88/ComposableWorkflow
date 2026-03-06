import { z } from 'zod';

export const definitionSummarySchema = z.object({
  workflowType: z.string(),
  workflowVersion: z.string(),
  metadata: z.record(z.unknown()).optional(),
});

export const listDefinitionsResponseSchema = z.object({
  items: z.array(definitionSummarySchema),
});

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

export type DefinitionSummary = z.infer<typeof definitionSummarySchema>;
export type ListDefinitionsResponse = z.infer<typeof listDefinitionsResponseSchema>;
export type WorkflowDefinitionResponse = z.infer<typeof workflowDefinitionResponseSchema>;
