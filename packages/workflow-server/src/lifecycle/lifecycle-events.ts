import type { DbClient } from '../persistence/db.js';
import type { EventRepository } from '../persistence/event-repository.js';

export type WorkflowLifecycleEventType =
  | 'workflow.paused'
  | 'workflow.resumed'
  | 'workflow.recovering'
  | 'workflow.recovered';

export const appendWorkflowLifecycleEvent = async (params: {
  client: DbClient;
  eventRepository: EventRepository;
  eventId: string;
  runId: string;
  eventType: WorkflowLifecycleEventType;
  timestamp: string;
}): Promise<void> => {
  await params.eventRepository.appendEvent(params.client, {
    eventId: params.eventId,
    runId: params.runId,
    eventType: params.eventType,
    timestamp: params.timestamp,
  });
};
