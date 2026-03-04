import { z } from 'zod';

import type { RuntimeWorkflowFactory } from '../registry/runtime-types.js';

const metadataSchema = z
  .object({
    displayName: z.string().optional(),
    tags: z.array(z.string()).optional(),
    description: z.string().optional(),
  })
  .optional();

const workflowRegistrationSchema = z.object({
  workflowType: z.string().trim().min(1),
  workflowVersion: z.string().trim().min(1),
  factory: z.custom<RuntimeWorkflowFactory>((value) => typeof value === 'function', {
    message: 'factory must be a function',
  }),
  metadata: metadataSchema,
});

export const workflowPackageManifestSchema = z.object({
  packageName: z.string().trim().min(1),
  packageVersion: z.string().trim().min(1),
  workflows: z.array(workflowRegistrationSchema).min(1),
});

export type WorkflowPackageManifest = z.infer<typeof workflowPackageManifestSchema>;

export class ManifestValidationError extends Error {
  readonly issues: z.ZodIssue[];
  readonly packageReference: string;

  constructor(packageReference: string, issues: z.ZodIssue[]) {
    super(`Invalid workflow manifest for ${packageReference}`);
    this.name = 'ManifestValidationError';
    this.issues = issues;
    this.packageReference = packageReference;
  }
}

export const validateWorkflowPackageManifest = (
  manifest: unknown,
  packageReference: string,
): WorkflowPackageManifest => {
  const parsed = workflowPackageManifestSchema.safeParse(manifest);

  if (!parsed.success) {
    throw new ManifestValidationError(packageReference, parsed.error.issues);
  }

  return parsed.data;
};
