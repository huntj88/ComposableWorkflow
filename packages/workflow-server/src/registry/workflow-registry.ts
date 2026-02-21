import type { WorkflowTypeCollisionPolicy } from '../config.js';
import { WorkflowTypeCollisionError } from './errors.js';

export interface WorkflowRegistration {
  workflowType: string;
  workflowVersion: string;
  factory: (...args: unknown[]) => unknown;
  metadata?: {
    displayName?: string;
    tags?: string[];
    description?: string;
  };
  packageName: string;
  packageVersion: string;
  source: 'path' | 'pnpm' | 'bundle';
  sourceValue: string;
}

export interface WorkflowRegistry {
  register: (registration: WorkflowRegistration) => void;
  getByType: (workflowType: string) => WorkflowRegistration | undefined;
  list: () => WorkflowRegistration[];
}

export const createWorkflowRegistry = (
  collisionPolicy: WorkflowTypeCollisionPolicy = 'reject',
): WorkflowRegistry => {
  const registrations = new Map<string, WorkflowRegistration>();

  return {
    register: (registration) => {
      const existing = registrations.get(registration.workflowType);

      if (existing && collisionPolicy === 'reject') {
        throw new WorkflowTypeCollisionError({
          workflowType: registration.workflowType,
          existingPackage: existing.packageName,
          incomingPackage: registration.packageName,
        });
      }

      registrations.set(registration.workflowType, registration);
    },
    getByType: (workflowType) => registrations.get(workflowType),
    list: () => Array.from(registrations.values()),
  };
};
