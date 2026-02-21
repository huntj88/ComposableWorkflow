export const WORKFLOW_TYPE_COLLISION_CODE = 'WORKFLOW_TYPE_COLLISION';

export interface WorkflowTypeCollisionEnvelope {
  code: typeof WORKFLOW_TYPE_COLLISION_CODE;
  workflowType: string;
  existingPackage: string;
  incomingPackage: string;
}

export class WorkflowTypeCollisionError extends Error {
  readonly envelope: WorkflowTypeCollisionEnvelope;

  constructor(envelope: Omit<WorkflowTypeCollisionEnvelope, 'code'>) {
    super(
      `Workflow type collision for "${envelope.workflowType}" between "${envelope.existingPackage}" and "${envelope.incomingPackage}"`,
    );
    this.name = 'WorkflowTypeCollisionError';
    this.envelope = {
      code: WORKFLOW_TYPE_COLLISION_CODE,
      ...envelope,
    };
  }
}
