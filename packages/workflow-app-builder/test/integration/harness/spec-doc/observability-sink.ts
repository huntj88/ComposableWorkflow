/**
 * Observability capture sink for `app-builder.spec-doc.v1` integration tests.
 *
 * Captures all `ctx.log()` calls and provides typed assertion helpers for
 * spec-doc-specific observability events (template IDs, schema validation
 * outcomes, event sequences).
 *
 * Requirement: SD-HAR-004-ObservabilityCapture
 *
 * @module test/integration/harness/spec-doc/observability-sink
 */

import type { WorkflowLogEvent } from '@composable-workflow/workflow-lib/contracts';

import {
  OBS_TYPES,
  type ObservabilityType,
  type ObsPayloadBase,
  type DelegationStartedPayload,
  type IntegrationPassCompletedPayload,
  type ConsistencyOutcomePayload,
  type QuestionGeneratedPayload,
  type ResponseReceivedPayload,
  type ClassificationOutcomePayload,
  type ClarificationGeneratedPayload,
  type TerminalCompletedPayload,
  type DuplicateSkippedPayload,
} from '../../../../src/workflows/spec-doc/observability.js';
import type { PromptTemplateId } from '../../../../src/workflows/spec-doc/prompt-templates.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A captured log entry with its sequence number. */
export interface CapturedLogEntry {
  /** Auto-incrementing sequence number for ordering assertions. */
  sequence: number;
  /** The original log event passed to `ctx.log()`. */
  event: WorkflowLogEvent;
  /** ISO-8601 timestamp when the log was captured. */
  capturedAt: string;
}

/** A captured observability event extracted from a log payload. */
export interface CapturedObsEvent<T extends ObsPayloadBase = ObsPayloadBase> {
  /** The sequence number of the parent log entry. */
  sequence: number;
  /** The observability type. */
  observabilityType: ObservabilityType;
  /** The FSM state that emitted the event. */
  state: string;
  /** The full typed payload. */
  payload: T;
  /** ISO-8601 timestamp. */
  capturedAt: string;
}

/** The observability capture sink instance. */
export interface ObservabilitySink {
  /**
   * Record a log event. Should be wired as the `ctx.log` implementation
   * (or a pass-through wrapper).
   */
  capture(event: WorkflowLogEvent): void;

  /** All captured log entries in order. */
  readonly logs: readonly CapturedLogEntry[];

  /** All captured observability events (extracted from log payloads). */
  readonly events: readonly CapturedObsEvent[];

  // ---- Query helpers ----

  /** Filter observability events by type. */
  eventsByType<T extends ObsPayloadBase>(type: ObservabilityType): CapturedObsEvent<T>[];

  /** Filter observability events by FSM state. */
  eventsByState(state: string): CapturedObsEvent[];

  /** Filter observability events by questionId (from payload). */
  eventsByQuestionId(questionId: string): CapturedObsEvent[];

  /** Get delegation started events only. */
  delegationEvents(): CapturedObsEvent<DelegationStartedPayload>[];

  /** Get integration pass events only. */
  integrationPassEvents(): CapturedObsEvent<IntegrationPassCompletedPayload>[];

  /** Get consistency outcome events only. */
  consistencyOutcomeEvents(): CapturedObsEvent<ConsistencyOutcomePayload>[];

  /** Get question generated events only. */
  questionGeneratedEvents(): CapturedObsEvent<QuestionGeneratedPayload>[];

  /** Get response received events only. */
  responseReceivedEvents(): CapturedObsEvent<ResponseReceivedPayload>[];

  /** Get classification outcome events only. */
  classificationOutcomeEvents(): CapturedObsEvent<ClassificationOutcomePayload>[];

  /** Get clarification generated events only. */
  clarificationGeneratedEvents(): CapturedObsEvent<ClarificationGeneratedPayload>[];

  /** Get terminal completed events only. */
  terminalCompletedEvents(): CapturedObsEvent<TerminalCompletedPayload>[];

  /** Get duplicate skipped events only. */
  duplicateSkippedEvents(): CapturedObsEvent<DuplicateSkippedPayload>[];

  // ---- Assertion helpers ----

  /**
   * Assert that every delegation event has a non-empty `promptTemplateId`.
   * Throws with details of any delegation missing the field.
   */
  assertAllDelegationsHaveTemplateId(): void;

  /**
   * Assert that a specific template ID appears in at least one delegation event.
   */
  assertTemplateIdUsed(templateId: PromptTemplateId): void;

  /**
   * Assert the exact sequence of observability types in order.
   * Throws if the actual sequence does not match.
   */
  assertEventSequence(expectedTypes: ObservabilityType[]): void;

  /**
   * Assert that a specific payload field value appears on at least one
   * event of the given type.
   */
  assertPayloadField<K extends string>(
    type: ObservabilityType,
    field: K,
    expectedValue: unknown,
  ): void;

  /** Number of captured log entries. */
  readonly logCount: number;

  /** Number of captured observability events. */
  readonly eventCount: number;

  /** Reset all captured data. */
  reset(): void;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/** Create an observability capture sink. */
export function createObservabilitySink(): ObservabilitySink {
  const logs: CapturedLogEntry[] = [];
  const events: CapturedObsEvent[] = [];
  let nextSequence = 1;

  function isObsPayload(payload: unknown): payload is ObsPayloadBase {
    if (typeof payload !== 'object' || payload === null) return false;
    const p = payload as Record<string, unknown>;
    return typeof p.observabilityType === 'string' && typeof p.state === 'string';
  }

  const sink: ObservabilitySink = {
    capture(event) {
      const seq = nextSequence++;
      const capturedAt = new Date().toISOString();

      logs.push({ sequence: seq, event, capturedAt });

      // Extract observability event from payload if present
      if (event.payload && isObsPayload(event.payload)) {
        events.push({
          sequence: seq,
          observabilityType: event.payload.observabilityType,
          state: event.payload.state,
          payload: event.payload,
          capturedAt,
        });
      }
    },

    get logs() {
      return logs;
    },

    get events() {
      return events;
    },

    eventsByType<T extends ObsPayloadBase>(type: ObservabilityType) {
      return events.filter((e) => e.observabilityType === type) as CapturedObsEvent<T>[];
    },

    eventsByState(state) {
      return events.filter((e) => e.state === state);
    },

    eventsByQuestionId(questionId) {
      return events.filter((e) => {
        const p = e.payload as Record<string, unknown>;
        return (
          p.questionId === questionId ||
          p.sourceQuestionId === questionId ||
          p.followUpQuestionId === questionId
        );
      });
    },

    delegationEvents() {
      return sink.eventsByType<DelegationStartedPayload>(OBS_TYPES.delegationStarted);
    },

    integrationPassEvents() {
      return sink.eventsByType<IntegrationPassCompletedPayload>(OBS_TYPES.integrationPassCompleted);
    },

    consistencyOutcomeEvents() {
      return sink.eventsByType<ConsistencyOutcomePayload>(OBS_TYPES.consistencyOutcome);
    },

    questionGeneratedEvents() {
      return sink.eventsByType<QuestionGeneratedPayload>(OBS_TYPES.questionGenerated);
    },

    responseReceivedEvents() {
      return sink.eventsByType<ResponseReceivedPayload>(OBS_TYPES.responseReceived);
    },

    classificationOutcomeEvents() {
      return sink.eventsByType<ClassificationOutcomePayload>(OBS_TYPES.classificationOutcome);
    },

    clarificationGeneratedEvents() {
      return sink.eventsByType<ClarificationGeneratedPayload>(OBS_TYPES.clarificationGenerated);
    },

    terminalCompletedEvents() {
      return sink.eventsByType<TerminalCompletedPayload>(OBS_TYPES.terminalCompleted);
    },

    duplicateSkippedEvents() {
      return sink.eventsByType<DuplicateSkippedPayload>(OBS_TYPES.duplicateSkipped);
    },

    assertAllDelegationsHaveTemplateId() {
      const delegations = sink.delegationEvents();
      const missing = delegations.filter(
        (d) => !d.payload.promptTemplateId || d.payload.promptTemplateId.trim() === '',
      );
      if (missing.length > 0) {
        throw new Error(
          `${missing.length} delegation event(s) missing promptTemplateId: ` +
            `sequences [${missing.map((m) => m.sequence).join(', ')}]`,
        );
      }
    },

    assertTemplateIdUsed(templateId) {
      const delegations = sink.delegationEvents();
      const found = delegations.find((d) => d.payload.promptTemplateId === templateId);
      if (!found) {
        const usedIds = delegations.map((d) => d.payload.promptTemplateId);
        throw new Error(
          `Template ID "${templateId}" not found in delegation events. ` +
            `Used IDs: [${usedIds.join(', ')}]`,
        );
      }
    },

    assertEventSequence(expectedTypes) {
      const actualTypes = events.map((e) => e.observabilityType);
      if (actualTypes.length !== expectedTypes.length) {
        throw new Error(
          `Event sequence length mismatch: expected ${expectedTypes.length}, ` +
            `got ${actualTypes.length}.\n` +
            `Expected: [${expectedTypes.join(', ')}]\n` +
            `Actual:   [${actualTypes.join(', ')}]`,
        );
      }
      for (let i = 0; i < expectedTypes.length; i++) {
        if (actualTypes[i] !== expectedTypes[i]) {
          throw new Error(
            `Event sequence mismatch at position ${i}: ` +
              `expected "${expectedTypes[i]}", got "${actualTypes[i]}".\n` +
              `Expected: [${expectedTypes.join(', ')}]\n` +
              `Actual:   [${actualTypes.join(', ')}]`,
          );
        }
      }
    },

    assertPayloadField(type, field, expectedValue) {
      const typed = sink.eventsByType(type);
      const found = typed.find((e) => {
        const p = e.payload as Record<string, unknown>;
        return p[field] === expectedValue;
      });
      if (!found) {
        const actual = typed.map((e) => (e.payload as Record<string, unknown>)[field]);
        throw new Error(
          `No event of type "${type}" has ${field}=${JSON.stringify(expectedValue)}. ` +
            `Actual values: [${actual.map((v) => JSON.stringify(v)).join(', ')}]`,
        );
      }
    },

    get logCount() {
      return logs.length;
    },

    get eventCount() {
      return events.length;
    },

    reset() {
      logs.length = 0;
      events.length = 0;
      nextSequence = 1;
    },
  };

  return sink;
}
