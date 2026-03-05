/**
 * ITX-WEB-025: Summary/timeline metadata completeness is validated.
 *
 * B-WEB-025: Summary panel renders all required metadata fields.
 *            Timeline events contain required DTO fields.
 *
 * Validates that:
 * - RunSummaryResponse fixture includes all required metadata fields.
 * - Timeline event DTOs include eventId, sequence, timestamp, eventType.
 * - Log entry DTOs include required fields for timeline rendering.
 * - Panel loading/empty text is defined for summary and events.
 * - Metadata timestamps are ISO 8601 strings.
 */

import { describe, expect, it } from 'vitest';

import {
  buildRunSummary,
  buildEventDto,
  buildLogEntry,
  buildRunEventsResponse,
  buildRunLogsResponse,
  fixtureTimestamp,
} from '../fixtures/workflowFixtures';
import { PANEL_LOADING_TEXT, PANEL_EMPTY_TEXT } from '../../../src/theme/tokens';

describe('integration.routes.ITX-WEB-025', () => {
  it('RunSummaryResponse includes all required metadata fields', () => {
    const summary = buildRunSummary();

    // Required identification
    expect(summary.runId).toBeDefined();
    expect(typeof summary.runId).toBe('string');
    expect(summary.workflowType).toBeDefined();
    expect(typeof summary.workflowType).toBe('string');
    expect(summary.workflowVersion).toBeDefined();
    expect(typeof summary.workflowVersion).toBe('string');

    // Required state
    expect(summary.lifecycle).toBeDefined();
    expect(summary.currentState).toBeDefined();

    // Parent reference
    expect('parentRunId' in summary).toBe(true);

    // Required timestamps
    expect(summary.startedAt).toBeDefined();
    expect(typeof summary.startedAt).toBe('string');
    expect('endedAt' in summary).toBe(true);

    // Counters
    expect(typeof summary.counters.eventCount).toBe('number');
    expect(typeof summary.counters.childCount).toBe('number');
  });

  it('RunSummaryResponse timestamps are valid ISO 8601 strings', () => {
    const summary = buildRunSummary();
    const parsed = new Date(summary.startedAt);
    expect(parsed.toISOString()).toBe(summary.startedAt);

    // With overrides
    const ended = buildRunSummary({ endedAt: fixtureTimestamp(60_000) });
    expect(new Date(ended.endedAt!).toISOString()).toBe(ended.endedAt);
  });

  it('summary lifecycle field covers all possible values with fixtures', () => {
    const lifecycles = [
      'running',
      'pausing',
      'paused',
      'resuming',
      'recovering',
      'cancelling',
      'completed',
      'failed',
      'cancelled',
    ] as const;

    for (const lifecycle of lifecycles) {
      const summary = buildRunSummary({ lifecycle });
      expect(summary.lifecycle).toBe(lifecycle);
    }
  });

  it('WorkflowEventDto includes all required timeline fields', () => {
    const event = buildEventDto(1);

    expect(event.eventId).toBeDefined();
    expect(typeof event.eventId).toBe('string');
    expect(event.sequence).toBe(1);
    expect(typeof event.sequence).toBe('number');
    expect(event.timestamp).toBeDefined();
    expect(typeof event.timestamp).toBe('string');
    expect(event.eventType).toBeDefined();
    expect(typeof event.eventType).toBe('string');
    expect(event.runId).toBeDefined();
    expect(event.workflowType).toBeDefined();
    expect('parentRunId' in event).toBe(true);
    expect('state' in event).toBe(true);
    expect('transition' in event).toBe(true);
    expect('child' in event).toBe(true);
    expect('command' in event).toBe(true);
    expect('payload' in event).toBe(true);
    expect('error' in event).toBe(true);
  });

  it('WorkflowLogEntryDto includes required log fields', () => {
    const log = buildLogEntry(1);

    expect(log.eventId).toBeDefined();
    expect(typeof log.eventId).toBe('string');
    expect(log.sequence).toBeDefined();
    expect(typeof log.sequence).toBe('number');
    expect(log.timestamp).toBeDefined();
    expect(typeof log.timestamp).toBe('string');
    expect(log.level).toBeDefined();
    expect(log.message).toBeDefined();
    expect(log.eventType).toBeDefined();
  });

  it('RunEventsResponse and RunLogsResponse are valid collections', () => {
    const events = buildRunEventsResponse(3);
    expect(events.items).toHaveLength(3);
    expect(events.items[0]!.sequence).toBe(1);
    expect(events.items[1]!.sequence).toBe(2);
    expect(events.items[2]!.sequence).toBe(3);

    const logs = buildRunLogsResponse(2);
    expect(logs.items).toHaveLength(2);
  });

  it('PANEL_LOADING_TEXT is defined for summary and events panels', () => {
    expect(PANEL_LOADING_TEXT['summary']).toBeDefined();
    expect(PANEL_LOADING_TEXT['summary'].length).toBeGreaterThan(0);
    expect(PANEL_LOADING_TEXT['events']).toBeDefined();
    expect(PANEL_LOADING_TEXT['events'].length).toBeGreaterThan(0);
    expect(PANEL_LOADING_TEXT['logs']).toBeDefined();
    expect(PANEL_LOADING_TEXT['logs'].length).toBeGreaterThan(0);
  });

  it('PANEL_EMPTY_TEXT is defined for summary and events panels', () => {
    expect(PANEL_EMPTY_TEXT['summary']).toBeDefined();
    expect(PANEL_EMPTY_TEXT['summary'].length).toBeGreaterThan(0);
    expect(PANEL_EMPTY_TEXT['events']).toBeDefined();
    expect(PANEL_EMPTY_TEXT['events'].length).toBeGreaterThan(0);
  });

  it('fixtureTimestamp produces ISO strings with deterministic offsets', () => {
    const base = fixtureTimestamp(0);
    const offset = fixtureTimestamp(1000);

    expect(new Date(base).toISOString()).toBe(base);
    expect(new Date(offset).toISOString()).toBe(offset);
    expect(new Date(offset).getTime() - new Date(base).getTime()).toBe(1000);
  });
});
