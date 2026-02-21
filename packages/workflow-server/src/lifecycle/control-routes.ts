import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';

import { type DbClient, withTransaction } from '../persistence/db.js';
import type { ReconcileService } from '../recovery/reconcile-service.js';
import { ApiError, type ApiServerDependencies } from '../api/server.js';
import {
  controlRequestBodySchema,
  controlResponseSchema,
  errorEnvelopeSchema,
  invalidLifecycleErrorSchema,
  reconcileRequestSchema,
  reconcileResponseSchema,
} from '../api/schemas.js';
import {
  canCancelLifecycle,
  canPauseLifecycle,
  canResumeLifecycle,
  type WorkflowLifecycle,
} from './lifecycle-machine.js';

const ACTIVE_FOR_CANCEL = ['running', 'pausing', 'paused', 'resuming'];

interface ControlResult {
  runId: string;
  lifecycle: 'pausing' | 'resuming' | 'cancelling';
  acceptedAt: string;
}

interface RunLifecycleRow {
  run_id: string;
  lifecycle: string;
}

const readRunLifecycleForUpdate = async (
  client: DbClient,
  runId: string,
): Promise<RunLifecycleRow> => {
  const result = await client.query(
    'SELECT run_id, lifecycle FROM workflow_runs WHERE run_id = $1 FOR UPDATE',
    [runId],
  );

  if (result.rowCount !== 1) {
    throw new ApiError({
      statusCode: 404,
      code: 'RUN_NOT_FOUND',
      message: `Run ${runId} not found`,
    });
  }

  return result.rows[0];
};

const toInvalidLifecycleError = (currentLifecycle: string) =>
  invalidLifecycleErrorSchema.parse({
    code: 'INVALID_LIFECYCLE',
    currentLifecycle,
  });

const appendLifecycleEvent = async (params: {
  client: DbClient;
  runId: string;
  eventType: string;
  timestamp: string;
  requestedBy?: string;
  reason?: string;
}): Promise<void> => {
  await params.client.query(
    `
INSERT INTO workflow_events (
  event_id,
  run_id,
  sequence,
  event_type,
  timestamp,
  payload_jsonb,
  error_jsonb
)
SELECT
  $1,
  $2,
  COALESCE(MAX(sequence), 0) + 1,
  $3,
  $4,
  $5,
  NULL
FROM workflow_events
WHERE run_id = $2
`,
    [
      `evt_${randomUUID()}`,
      params.runId,
      params.eventType,
      params.timestamp,
      {
        requestedBy: params.requestedBy ?? null,
        reason: params.reason ?? null,
      },
    ],
  );
};

const transitionRunLifecycle = async (params: {
  client: DbClient;
  runId: string;
  lifecycle: WorkflowLifecycle;
}): Promise<void> => {
  await params.client.query('UPDATE workflow_runs SET lifecycle = $2 WHERE run_id = $1', [
    params.runId,
    params.lifecycle,
  ]);
};

const requestPause = async (
  deps: ApiServerDependencies,
  runId: string,
  requestDetails: { requestedBy?: string; reason?: string },
): Promise<ControlResult> => {
  const acceptedAt = new Date().toISOString();

  await withTransaction(deps.pool, async (client) => {
    const run = await readRunLifecycleForUpdate(client, runId);
    if (!canPauseLifecycle(run.lifecycle as WorkflowLifecycle)) {
      throw new ApiError({
        statusCode: 409,
        code: 'INVALID_LIFECYCLE',
        message: `Pause is not allowed from lifecycle ${run.lifecycle}`,
        details: toInvalidLifecycleError(run.lifecycle),
      });
    }

    await transitionRunLifecycle({ client, runId, lifecycle: 'pausing' });
    await appendLifecycleEvent({
      client,
      runId,
      eventType: 'workflow.pausing',
      timestamp: acceptedAt,
      ...requestDetails,
    });
  });

  await deps.orchestrator.resumeRun(runId);

  return {
    runId,
    lifecycle: 'pausing',
    acceptedAt,
  };
};

const requestResume = async (
  deps: ApiServerDependencies,
  runId: string,
  requestDetails: { requestedBy?: string; reason?: string },
): Promise<ControlResult> => {
  const acceptedAt = new Date().toISOString();

  await withTransaction(deps.pool, async (client) => {
    const run = await readRunLifecycleForUpdate(client, runId);
    if (!canResumeLifecycle(run.lifecycle as WorkflowLifecycle)) {
      throw new ApiError({
        statusCode: 409,
        code: 'INVALID_LIFECYCLE',
        message: `Resume is not allowed from lifecycle ${run.lifecycle}`,
        details: toInvalidLifecycleError(run.lifecycle),
      });
    }

    await transitionRunLifecycle({ client, runId, lifecycle: 'resuming' });
    await appendLifecycleEvent({
      client,
      runId,
      eventType: 'workflow.resuming',
      timestamp: acceptedAt,
      ...requestDetails,
    });
  });

  await deps.orchestrator.resumeRun(runId);

  return {
    runId,
    lifecycle: 'resuming',
    acceptedAt,
  };
};

const requestCancel = async (
  deps: ApiServerDependencies,
  runId: string,
  requestDetails: { requestedBy?: string; reason?: string },
): Promise<ControlResult> => {
  const acceptedAt = new Date().toISOString();

  await withTransaction(deps.pool, async (client) => {
    const run = await readRunLifecycleForUpdate(client, runId);
    if (!canCancelLifecycle(run.lifecycle as WorkflowLifecycle)) {
      throw new ApiError({
        statusCode: 409,
        code: 'INVALID_LIFECYCLE',
        message: `Cancel is not allowed from lifecycle ${run.lifecycle}`,
        details: toInvalidLifecycleError(run.lifecycle),
      });
    }

    if (run.lifecycle !== 'cancelling') {
      await transitionRunLifecycle({ client, runId, lifecycle: 'cancelling' });
      await appendLifecycleEvent({
        client,
        runId,
        eventType: 'workflow.cancelling',
        timestamp: acceptedAt,
        ...requestDetails,
      });
    }

    const descendants = await client.query<RunLifecycleRow>(
      `
WITH RECURSIVE descendants AS (
  SELECT child.run_id, child.lifecycle
  FROM workflow_run_children wrc
  JOIN workflow_runs child ON child.run_id = wrc.child_run_id
  WHERE wrc.parent_run_id = $1

  UNION ALL

  SELECT child.run_id, child.lifecycle
  FROM descendants d
  JOIN workflow_run_children wrc ON wrc.parent_run_id = d.run_id
  JOIN workflow_runs child ON child.run_id = wrc.child_run_id
)
SELECT run_id, lifecycle
FROM descendants
`,
      [runId],
    );

    for (const descendant of descendants.rows) {
      if (!ACTIVE_FOR_CANCEL.includes(descendant.lifecycle)) {
        continue;
      }

      await transitionRunLifecycle({
        client,
        runId: descendant.run_id,
        lifecycle: 'cancelling',
      });

      await appendLifecycleEvent({
        client,
        runId: descendant.run_id,
        eventType: 'workflow.cancelling',
        timestamp: acceptedAt,
        ...requestDetails,
      });
    }
  });

  await deps.orchestrator.resumeRun(runId);

  return {
    runId,
    lifecycle: 'cancelling',
    acceptedAt,
  };
};

export interface LifecycleControlDependencies extends ApiServerDependencies {
  reconcileService: ReconcileService;
}

export const registerLifecycleControlRoutes = async (
  server: FastifyInstance,
  deps: LifecycleControlDependencies,
): Promise<void> => {
  server.post(
    '/api/v1/workflows/runs/:runId/pause',
    {
      schema: {
        body: controlRequestBodySchema,
        response: {
          200: controlResponseSchema,
          404: errorEnvelopeSchema,
          409: errorEnvelopeSchema,
        },
      },
    },
    async (request) => {
      const runId = (request.params as { runId: string }).runId;
      const body = controlRequestBodySchema.parse(request.body);
      return controlResponseSchema.parse(await requestPause(deps, runId, body));
    },
  );

  server.post(
    '/api/v1/workflows/runs/:runId/resume',
    {
      schema: {
        body: controlRequestBodySchema,
        response: {
          200: controlResponseSchema,
          404: errorEnvelopeSchema,
          409: errorEnvelopeSchema,
        },
      },
    },
    async (request) => {
      const runId = (request.params as { runId: string }).runId;
      const body = controlRequestBodySchema.parse(request.body);
      return controlResponseSchema.parse(await requestResume(deps, runId, body));
    },
  );

  server.post(
    '/api/v1/workflows/runs/:runId/cancel',
    {
      schema: {
        body: controlRequestBodySchema,
        response: {
          200: controlResponseSchema,
          404: errorEnvelopeSchema,
          409: errorEnvelopeSchema,
        },
      },
    },
    async (request) => {
      const runId = (request.params as { runId: string }).runId;
      const body = controlRequestBodySchema.parse(request.body);
      return controlResponseSchema.parse(await requestCancel(deps, runId, body));
    },
  );

  server.post(
    '/api/v1/workflows/recovery/reconcile',
    {
      schema: {
        body: reconcileRequestSchema,
        response: {
          200: reconcileResponseSchema,
        },
      },
    },
    async (request) => {
      const body = reconcileRequestSchema.parse(request.body ?? {});
      return reconcileResponseSchema.parse(await deps.reconcileService.reconcile(body));
    },
  );
};
