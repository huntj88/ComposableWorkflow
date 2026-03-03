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
    childLaunchAnnotations?: Record<string, unknown>[];
  };
  packageName: string;
  packageVersion: string;
  source: 'path' | 'pnpm' | 'bundle';
  sourceValue: string;
}

export interface WorkflowRegistry {
  reserveWorkflowType: (workflowType: string, packageName: string) => void;
  register: (registration: WorkflowRegistration) => void;
  getByType: (workflowType: string) => WorkflowRegistration | undefined;
  list: () => WorkflowRegistration[];
}

export const createWorkflowRegistry = (
  collisionPolicy: WorkflowTypeCollisionPolicy = 'reject',
): WorkflowRegistry => {
  const registrations = new Map<string, WorkflowRegistration>();
  const reservedByType = new Map<string, string>();

  return {
    reserveWorkflowType: (workflowType, packageName) => {
      const existingReservation = reservedByType.get(workflowType);
      if (existingReservation && existingReservation !== packageName) {
        throw new WorkflowTypeCollisionError({
          workflowType,
          existingPackage: existingReservation,
          incomingPackage: packageName,
        });
      }

      const existingRegistration = registrations.get(workflowType);
      if (existingRegistration && existingRegistration.packageName !== packageName) {
        throw new WorkflowTypeCollisionError({
          workflowType,
          existingPackage: existingRegistration.packageName,
          incomingPackage: packageName,
        });
      }

      reservedByType.set(workflowType, packageName);
    },
    register: (registration) => {
      const reservedPackage = reservedByType.get(registration.workflowType);
      if (reservedPackage && reservedPackage !== registration.packageName) {
        throw new WorkflowTypeCollisionError({
          workflowType: registration.workflowType,
          existingPackage: reservedPackage,
          incomingPackage: registration.packageName,
        });
      }

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
