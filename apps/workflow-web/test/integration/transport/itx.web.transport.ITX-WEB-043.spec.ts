/**
 * ITX-WEB-043: Field-level shared DTO authority conformance is enforced.
 *
 * Validates that:
 * - Zod schemas from @composable-workflow/workflow-api-types accept valid DTOs.
 * - Schemas reject missing required fields.
 * - Field types match expected shapes (string, number, null, array).
 * - Shared schemas are the single source of truth for field validation.
 */

import { describe, expect, it } from 'vitest';

import {
  runSummaryResponseSchema,
  runEventsResponseSchema,
  runLogsResponseSchema,
  runTreeResponseSchema,
  workflowDefinitionResponseSchema,
  errorEnvelopeSchema,
  workflowEventDtoSchema,
  workflowStreamFrameSchema,
  cancelRunResponseSchema,
} from '@composable-workflow/workflow-api-types';

import {
  buildRunSummary,
  buildRunEventsResponse,
  buildRunLogsResponse,
  buildRunTreeResponse,
  buildDefinitionResponse,
  buildCancelRunResponse,
  buildEventDto,
  buildStreamFrame,
} from '../fixtures/workflowFixtures';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('integration.transport.ITX-WEB-043', () => {
  describe('RunSummaryResponse schema', () => {
    it('accepts valid fixture', () => {
      const result = runSummaryResponseSchema.safeParse(buildRunSummary());
      expect(result.success).toBe(true);
    });

    it('rejects missing runId', () => {
      const { runId, ...incomplete } = buildRunSummary();
      const result = runSummaryResponseSchema.safeParse(incomplete);
      expect(result.success).toBe(false);
    });
  });

  describe('RunEventsResponse schema', () => {
    it('accepts valid fixture', () => {
      const result = runEventsResponseSchema.safeParse(buildRunEventsResponse(3));
      expect(result.success).toBe(true);
    });

    it('items must be an array', () => {
      const result = runEventsResponseSchema.safeParse({ items: 'not-array' });
      expect(result.success).toBe(false);
    });
  });

  describe('RunLogsResponse schema', () => {
    it('accepts valid fixture', () => {
      const result = runLogsResponseSchema.safeParse(buildRunLogsResponse(2));
      expect(result.success).toBe(true);
    });
  });

  describe('RunTreeResponse schema', () => {
    it('accepts valid fixture', () => {
      const result = runTreeResponseSchema.safeParse(buildRunTreeResponse());
      expect(result.success).toBe(true);
    });
  });

  describe('WorkflowDefinitionResponse schema', () => {
    it('accepts valid fixture', () => {
      const result = workflowDefinitionResponseSchema.safeParse(buildDefinitionResponse());
      expect(result.success).toBe(true);
    });

    it('rejects missing workflowType', () => {
      const { workflowType, ...incomplete } = buildDefinitionResponse();
      const result = workflowDefinitionResponseSchema.safeParse(incomplete);
      expect(result.success).toBe(false);
    });
  });

  describe('WorkflowEventDto schema', () => {
    it('accepts valid fixture', () => {
      const result = workflowEventDtoSchema.safeParse(buildEventDto(1));
      expect(result.success).toBe(true);
    });

    it('rejects missing eventId', () => {
      const { eventId, ...incomplete } = buildEventDto(1);
      const result = workflowEventDtoSchema.safeParse(incomplete);
      expect(result.success).toBe(false);
    });
  });

  describe('WorkflowStreamFrame schema', () => {
    it('accepts valid fixture', () => {
      const result = workflowStreamFrameSchema.safeParse(buildStreamFrame(1));
      expect(result.success).toBe(true);
    });

    it('rejects wrong event type', () => {
      const frame = { ...buildStreamFrame(1), event: 'not-workflow' };
      const result = workflowStreamFrameSchema.safeParse(frame);
      expect(result.success).toBe(false);
    });
  });

  describe('CancelRunResponse schema', () => {
    it('accepts valid fixture', () => {
      const result = cancelRunResponseSchema.safeParse(buildCancelRunResponse());
      expect(result.success).toBe(true);
    });
  });

  describe('ErrorEnvelope schema', () => {
    it('accepts valid error envelope', () => {
      const result = errorEnvelopeSchema.safeParse({
        code: 'RUN_NOT_FOUND',
        message: 'Not found',
        requestId: 'req_1',
      });
      expect(result.success).toBe(true);
    });

    it('rejects missing code', () => {
      const result = errorEnvelopeSchema.safeParse({
        message: 'Not found',
        requestId: 'req_1',
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing message', () => {
      const result = errorEnvelopeSchema.safeParse({
        code: 'ERR',
        requestId: 'req_1',
      });
      expect(result.success).toBe(false);
    });
  });
});
