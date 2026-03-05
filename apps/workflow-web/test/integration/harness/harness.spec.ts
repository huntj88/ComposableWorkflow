/**
 * TWEB09 harness smoke tests.
 *
 * Verifies that every harness module exports, constructs, and integrates
 * correctly. These are structural/behavioral smoke assertions — not
 * full integration scenarios.
 *
 * @vitest-environment jsdom
 */

import { describe, expect, it, vi, afterEach } from 'vitest';

import { createMockTransport, FakeEventSource, type MockTransport } from './mockTransport';

import {
  buildEventDto,
  buildStreamFrame,
  buildReplaySequence,
  createStreamReplay,
  type StreamReplayController,
} from './streamReplay';

import {
  createFakeViewport,
  FakeResizeObserver,
  VIEWPORT_PRESETS,
  type FakeViewportController,
} from './fakeViewport';

// ---------------------------------------------------------------------------
// mockTransport
// ---------------------------------------------------------------------------

describe('harness.mockTransport', () => {
  let transport: MockTransport;

  afterEach(() => {
    transport?.reset();
  });

  it('creates a client with all transport surface methods', () => {
    transport = createMockTransport();
    const client = transport.client;

    expect(client).toHaveProperty('listRuns');
    expect(client).toHaveProperty('getRunSummary');
    expect(client).toHaveProperty('getRunTree');
    expect(client).toHaveProperty('getRunEvents');
    expect(client).toHaveProperty('getRunLogs');
    expect(client).toHaveProperty('getWorkflowDefinition');
    expect(client).toHaveProperty('cancelRun');
    expect(client).toHaveProperty('listRunFeedbackRequests');
    expect(client).toHaveProperty('submitHumanFeedbackResponse');
    expect(client).toHaveProperty('getHumanFeedbackRequestStatus');
    expect(client).toHaveProperty('openRunStream');
  });

  it('traces fetch calls and matches stubs', async () => {
    transport = createMockTransport();

    transport.stubListRuns({ items: [] });

    const result = await transport.client.listRuns();

    expect(result.items).toEqual([]);
    expect(transport.getCalls()).toHaveLength(1);
    expect(transport.getCalls()[0]!.url).toContain('/api/v1/workflows/runs');
    expect(transport.getCalls()[0]!.method).toBe('GET');
  });

  it('records unmatched calls and assertNoUnmatchedCalls throws', async () => {
    transport = createMockTransport();

    // No stubs registered — call should be unmatched
    await transport.client.listRuns().catch(() => {});
    expect(() => transport.assertNoUnmatchedCalls()).toThrow(/unmatched/i);
  });

  it('tracks EventSource creation through eventSourceFactory', () => {
    transport = createMockTransport();

    transport.client.openRunStream('wr_test_1');

    expect(transport.getStreamRequests()).toHaveLength(1);
    expect(transport.getStreamRequests()[0]!.url).toContain('wr_test_1');
    expect(transport.getLatestEventSource()).toBeInstanceOf(FakeEventSource);
  });

  it('getCallsMatching filters by URL predicate', async () => {
    transport = createMockTransport();

    transport.stubListRuns({ items: [] });
    transport.stubRunSummary('wr_xyz', {
      runId: 'wr_xyz',
      workflowType: 'test',
      workflowVersion: '1.0.0',
      lifecycle: 'running',
      currentState: 'init',
      currentTransitionContext: null,
      parentRunId: null,
      childrenSummary: { total: 0, active: 0, completed: 0, failed: 0, cancelled: 0 },
      startedAt: '2026-03-05T00:00:00.000Z',
      endedAt: null,
      counters: { eventCount: 0, logCount: 0, childCount: 0 },
    });

    await transport.client.listRuns();
    await transport.client.getRunSummary('wr_xyz');

    const summaryOnly = transport.getCallsMatching(/wr_xyz/);
    expect(summaryOnly).toHaveLength(1);
  });

  it('reset clears all state', async () => {
    transport = createMockTransport();
    transport.stubListRuns({ items: [] });
    await transport.client.listRuns();
    transport.client.openRunStream('wr_reset');

    transport.reset();

    expect(transport.getCalls()).toHaveLength(0);
    expect(transport.getStreamRequests()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// streamReplay
// ---------------------------------------------------------------------------

describe('harness.streamReplay', () => {
  it('buildEventDto creates a valid event', () => {
    const dto = buildEventDto({
      sequence: 1,
      eventType: 'log',
      payload: { level: 'info', message: 'hello' },
    });
    expect(dto.sequence).toBe(1);
    expect(dto.eventType).toBe('log');
    expect(dto.eventId).toBe('evt_1');
  });

  it('buildStreamFrame wraps an event in a stream frame', () => {
    const frame = buildStreamFrame({ sequence: 5 });
    expect(frame.event).toBe('workflow-event');
    expect(frame.id).toBe('cur_5');
    expect(frame.data.sequence).toBe(5);
  });

  it('buildReplaySequence generates ordered frames', () => {
    const seq = buildReplaySequence([
      { eventType: 'transition.completed' },
      { eventType: 'log', payload: { level: 'info', message: 'x' } },
    ]);

    expect(seq).toHaveLength(2);
    expect(seq[0]!.frame.data.sequence).toBe(1);
    expect(seq[1]!.frame.data.sequence).toBe(2);
  });

  it('createStreamReplay wires openRunStream with FakeEventSource', () => {
    vi.useFakeTimers();

    const replay = createStreamReplay();
    const source = replay.getLatestSource();
    source.emitOpen();

    expect(replay.getHealth()).toBe('connected');
    expect(replay.getAcceptedSequences()).toEqual([]);

    replay.close();
    vi.useRealTimers();
  });

  it('emit returns accepted/rejected results and tracks sequences', () => {
    vi.useFakeTimers();

    const replay = createStreamReplay();
    const source = replay.getLatestSource();
    source.emitOpen();

    const frame1 = buildStreamFrame({ sequence: 1 });
    const frame1Dup = buildStreamFrame({ sequence: 1 }, 'cur_1_dup');

    const r1 = replay.emit(frame1);
    const r1Dup = replay.emit(frame1Dup);

    expect(r1.accepted).toBe(true);
    expect(r1Dup.accepted).toBe(false);
    expect(replay.getAcceptedSequences()).toEqual([1]);
    expect(replay.getRejectedSequences()).toEqual([1]);

    replay.close();
    vi.useRealTimers();
  });

  it('simulateReconnect creates a new FakeEventSource', () => {
    vi.useFakeTimers();

    const replay = createStreamReplay({ random: () => 0 });
    const source = replay.getLatestSource();
    source.emitOpen();

    const newSource = replay.simulateReconnect(() => vi.runOnlyPendingTimers());
    expect(newSource).not.toBe(source);
    expect(replay.getAllSources()).toHaveLength(2);

    replay.close();
    vi.useRealTimers();
  });

  it('simulateOverlapWindow tests dedup on old connection', () => {
    vi.useFakeTimers();

    const replay = createStreamReplay({ random: () => 0 });
    const source = replay.getLatestSource();
    source.emitOpen();

    // Emit frame 1 on initial connection
    replay.emit(buildStreamFrame({ sequence: 1 }));

    // Reconnect
    const oldSource = source;
    replay.simulateReconnect(() => vi.runOnlyPendingTimers());

    // Replay frame 1 on old connection (overlap window) — should be deduped
    const overlapResults = replay.simulateOverlapWindow(oldSource, [
      buildStreamFrame({ sequence: 1 }, 'cur_1_overlap'),
    ]);

    expect(overlapResults[0]!.accepted).toBe(false);

    replay.close();
    vi.useRealTimers();
  });

  it('tracks health transitions', () => {
    vi.useFakeTimers();

    const replay = createStreamReplay({ random: () => 0 });
    const source = replay.getLatestSource();
    source.emitOpen();

    expect(replay.getHealthTransitions().at(-1)?.state).toBe('connected');

    source.emitError();
    expect(replay.getHealthTransitions().at(-1)?.state).toBe('reconnecting');

    replay.close();
    vi.useRealTimers();
  });
});

// ---------------------------------------------------------------------------
// fakeViewport
// ---------------------------------------------------------------------------

describe('harness.fakeViewport', () => {
  let viewport: FakeViewportController;

  afterEach(() => {
    viewport?.restore();
  });

  it('initializes with a preset', () => {
    viewport = createFakeViewport('mobile');
    expect(viewport.getSize()).toEqual({ width: 375, height: 667 });
  });

  it('initializes with custom dimensions', () => {
    viewport = createFakeViewport({ width: 800, height: 600 });
    expect(viewport.getSize()).toEqual({ width: 800, height: 600 });
  });

  it('setPreset changes dimensions', () => {
    viewport = createFakeViewport('desktop');
    viewport.setPreset('tablet');
    expect(viewport.getSize()).toEqual({
      width: VIEWPORT_PRESETS.tablet.width,
      height: VIEWPORT_PRESETS.tablet.height,
    });
  });

  it('setSize sets arbitrary dimensions', () => {
    viewport = createFakeViewport();
    viewport.setSize(1024, 768);
    expect(viewport.getSize()).toEqual({ width: 1024, height: 768 });
  });

  it('install/restore overrides and restores window properties', () => {
    viewport = createFakeViewport('mobile');
    viewport.install();

    expect(window.innerWidth).toBe(375);
    expect(window.innerHeight).toBe(667);

    viewport.restore();
    // After restore, window dimensions should be from jsdom defaults
    expect(typeof window.innerWidth).toBe('number');
  });

  it('FakeResizeObserver tracks instances and triggers resize', () => {
    const entries: ResizeObserverEntry[] = [];
    const observer = new FakeResizeObserver((e) => entries.push(...e));

    const el = document.createElement('div');
    observer.observe(el);

    observer.triggerResize(500, 300);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.contentRect.width).toBe(500);
    expect(entries[0]!.contentRect.height).toBe(300);

    observer.disconnect();
  });

  it('triggerResizeObservers fires all registered observer callbacks', () => {
    viewport = createFakeViewport('desktop');
    viewport.install();

    const entries: ResizeObserverEntry[] = [];
    const observer = new globalThis.ResizeObserver((e: ResizeObserverEntry[]) =>
      entries.push(...e),
    );
    const el = document.createElement('div');
    observer.observe(el);

    viewport.setSize(800, 600);
    viewport.triggerResizeObservers();

    expect(entries).toHaveLength(1);
    expect(entries[0]!.contentRect.width).toBe(800);

    viewport.restore();
  });

  it('exports all viewport presets', () => {
    expect(VIEWPORT_PRESETS).toHaveProperty('mobile');
    expect(VIEWPORT_PRESETS).toHaveProperty('tablet');
    expect(VIEWPORT_PRESETS).toHaveProperty('desktop');
    expect(VIEWPORT_PRESETS).toHaveProperty('wide');
    expect(VIEWPORT_PRESETS).toHaveProperty('ultraWide');
  });
});
