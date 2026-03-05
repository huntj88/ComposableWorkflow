/**
 * TWEB09: Stream replay injector with sequence/cursor controls.
 *
 * Provides deterministic ordered stream frame replay, reconnect overlap
 * window simulation, dedup window control, and scheduling hooks for
 * fake-timer-driven reconnect/stale transition tests.
 *
 * Requirement mapping:
 * - ITX-WEB-005: Ordered stream replay supports deterministic incremental patch assertions.
 * - ITX-WEB-006: Reconnect overlap and dedup windows are controllable and testable.
 * - ITX-WEB-027: Backoff timing behavior is testable via fake timers and scheduling hooks.
 */

import type {
  WorkflowStreamFrame,
  WorkflowEventDto,
} from '@composable-workflow/workflow-api-types';

import { openRunStream, type RunStreamHandle } from '../../../src/stream/openRunStream';
import {
  applyStreamFrame,
  createStreamDashboardState,
  type StreamDashboardState,
} from '../../../src/stream/applyStreamFrame';
import type { StreamHealthState } from '../../../src/stream/reconnectPolicy';
import { FakeEventSource } from './mockTransport';

// ---------------------------------------------------------------------------
// Frame builder helper
// ---------------------------------------------------------------------------

export type FrameParams = {
  sequence: number;
  runId?: string;
  eventType?: string;
  state?: string | null;
  transition?: { from?: string; to?: string; name?: string } | null;
  child?: { childRunId: string; childWorkflowType: string; lifecycle: string } | null;
  command?: Record<string, unknown> | null;
  payload?: Record<string, unknown> | null;
  error?: Record<string, unknown> | null;
  workflowType?: string;
  parentRunId?: string | null;
  timestamp?: string;
};

/**
 * Build a minimal valid `WorkflowEventDto` suitable for stream frame emission.
 */
export function buildEventDto(params: FrameParams): WorkflowEventDto {
  return {
    eventId: `evt_${params.sequence}`,
    runId: params.runId ?? 'wr_replay_1',
    workflowType: params.workflowType ?? 'reference.success.v1',
    parentRunId: params.parentRunId ?? null,
    sequence: params.sequence,
    eventType: params.eventType ?? 'transition.completed',
    state: params.state ?? null,
    transition: params.transition ?? null,
    child: params.child ?? null,
    command: (params.command as WorkflowEventDto['command']) ?? null,
    timestamp: params.timestamp ?? '2026-03-05T00:00:00.000Z',
    payload: params.payload ?? null,
    error: params.error ?? null,
  };
}

/**
 * Build a full `WorkflowStreamFrame` with a cursor ID derived from sequence.
 */
export function buildStreamFrame(
  params: FrameParams,
  cursorOverride?: string,
): WorkflowStreamFrame {
  return {
    event: 'workflow-event',
    id: cursorOverride ?? `cur_${params.sequence}`,
    data: buildEventDto(params),
  };
}

// ---------------------------------------------------------------------------
// Replay sequence
// ---------------------------------------------------------------------------

export type ReplayFrame = {
  frame: WorkflowStreamFrame;
  /** Delay (ms) before emitting this frame when using timed replay. */
  delayMs?: number;
};

/**
 * Build a replay sequence from an array of frame parameter objects.
 * Sequences are assigned automatically starting from `startSequence`.
 */
export function buildReplaySequence(
  events: Array<Omit<FrameParams, 'sequence'> & { delayMs?: number }>,
  startSequence: number = 1,
): ReplayFrame[] {
  return events.map((params, index) => {
    const sequence = startSequence + index;
    return {
      frame: buildStreamFrame({ ...params, sequence }),
      delayMs: params.delayMs,
    };
  });
}

// ---------------------------------------------------------------------------
// Stream replay controller
// ---------------------------------------------------------------------------

export type StreamReplayOptions = {
  runId?: string;
  /** Initial cursor for resume. */
  cursor?: string;
  /** Event type filter. */
  eventType?: string;
  /** Custom clock for deterministic timing. */
  now?: () => number;
  /** Custom random for deterministic backoff. */
  random?: () => number;
};

export type ReplayResult = {
  accepted: boolean;
  sequence: number;
  cursor: string;
};

export type HealthTransition = {
  state: StreamHealthState;
  timestamp: number;
};

export type StreamReplayController = {
  /** The underlying stream handle. */
  handle: RunStreamHandle;

  /** Current aggregated dashboard state. */
  getState: () => StreamDashboardState;

  /** All accepted frame sequences. */
  getAcceptedSequences: () => number[];

  /** All rejected (deduped) frame sequences. */
  getRejectedSequences: () => number[];

  /** Health state transition log. */
  getHealthTransitions: () => readonly HealthTransition[];

  /** Current health state. */
  getHealth: () => StreamHealthState;

  /** Get the latest FakeEventSource instance. */
  getLatestSource: () => FakeEventSource;

  /** Get all FakeEventSource instances created during this replay session. */
  getAllSources: () => FakeEventSource[];

  /**
   * Emit a single frame on the latest (or specified) FakeEventSource.
   * Returns whether the frame was accepted by the dashboard state.
   */
  emit: (frame: WorkflowStreamFrame, source?: FakeEventSource) => ReplayResult;

  /**
   * Replay an ordered sequence of frames on the current connection.
   * Returns per-frame results.
   */
  replaySequence: (frames: ReplayFrame[]) => ReplayResult[];

  /**
   * Simulate a reconnect: error the current source, advance fake timers,
   * then open the new connection. Returns the new FakeEventSource.
   */
  simulateReconnect: (advanceTimers: () => void) => FakeEventSource;

  /**
   * Simulate a reconnect overlap window: emit frames on the old connection
   * after a reconnect has started, to test dedup behavior.
   */
  simulateOverlapWindow: (
    oldSource: FakeEventSource,
    overlapFrames: WorkflowStreamFrame[],
  ) => ReplayResult[];

  /** Close the stream. */
  close: () => void;
};

/**
 * Create a stream replay controller that wires `openRunStream` with
 * `FakeEventSource` injection and `applyStreamFrame` state tracking.
 */
export function createStreamReplay(options: StreamReplayOptions = {}): StreamReplayController {
  FakeEventSource.instances = [];

  const acceptedSequences: number[] = [];
  const rejectedSequences: number[] = [];
  const healthTransitions: HealthTransition[] = [];
  const clockNow = 0;

  const nowFn = options.now ?? (() => clockNow);
  const randomFn = options.random ?? (() => 0);

  let state: StreamDashboardState = createStreamDashboardState({
    summary: null,
    events: { items: [], nextCursor: undefined },
    logs: { items: [] },
  });

  const handle = openRunStream({
    runId: options.runId ?? 'wr_replay_1',
    cursor: options.cursor,
    eventType: options.eventType,
    now: nowFn,
    random: randomFn,
    eventSourceFactory: (url) => new FakeEventSource(url) as unknown as EventSource,
    onFrame: (frame) => {
      const result = applyStreamFrame(state, frame);
      state = result.state;

      if (result.accepted) {
        acceptedSequences.push(frame.data.sequence);
      } else {
        rejectedSequences.push(frame.data.sequence);
      }

      return result.accepted;
    },
    onHealthChange: (healthState) => {
      healthTransitions.push({ state: healthState, timestamp: nowFn() });
    },
  });

  const getLatestSource = (): FakeEventSource => {
    const latest = FakeEventSource.instances[FakeEventSource.instances.length - 1];
    if (!latest) {
      throw new Error('StreamReplay: No FakeEventSource instances exist.');
    }
    return latest;
  };

  const emitFrame = (frame: WorkflowStreamFrame, source?: FakeEventSource): ReplayResult => {
    const target = source ?? getLatestSource();
    const prevAcceptedCount = acceptedSequences.length;

    target.emitWorkflowFrame({ id: frame.id, data: frame.data });

    const accepted = acceptedSequences.length > prevAcceptedCount;
    return {
      accepted,
      sequence: frame.data.sequence,
      cursor: frame.id,
    };
  };

  return {
    handle,
    getState: () => state,
    getAcceptedSequences: () => [...acceptedSequences],
    getRejectedSequences: () => [...rejectedSequences],
    getHealthTransitions: () => [...healthTransitions],
    getHealth: () => handle.getHealthState(),

    getLatestSource,
    getAllSources: () => [...FakeEventSource.instances],

    emit: emitFrame,

    replaySequence: (frames) => frames.map(({ frame }) => emitFrame(frame)),

    simulateReconnect: (advanceTimers) => {
      const oldSource = getLatestSource();
      oldSource.emitError();
      advanceTimers();
      const newSource = getLatestSource();
      if (newSource === oldSource) {
        throw new Error('StreamReplay: reconnect did not create a new FakeEventSource.');
      }
      newSource.emitOpen();
      return newSource;
    },

    simulateOverlapWindow: (oldSource, overlapFrames) =>
      overlapFrames.map((frame) => emitFrame(frame, oldSource)),

    close: () => handle.close(),
  };
}

// ---------------------------------------------------------------------------
// Fake timer integration helpers
// ---------------------------------------------------------------------------

/**
 * Advance fake timers through a sequence of reconnect attempts,
 * collecting health state at each step.
 *
 * Usage:
 * ```ts
 * vi.useFakeTimers();
 * const replay = createStreamReplay();
 * const source = replay.getLatestSource();
 * source.emitOpen();
 * source.emitError();
 * const transitions = advanceThroughReconnects(replay, vi.runOnlyPendingTimers, 3);
 * ```
 */
export function advanceThroughReconnects(
  controller: StreamReplayController,
  runPendingTimers: () => void,
  attempts: number,
): HealthTransition[] {
  const collected: HealthTransition[] = [];

  for (let i = 0; i < attempts; i++) {
    runPendingTimers();
    const sources = controller.getAllSources();
    const newest = sources[sources.length - 1]!;
    // Don't open — let the test decide. Just trigger the reconnect error.
    newest.emitError();
    collected.push(...controller.getHealthTransitions().slice(collected.length));
  }

  return collected;
}
