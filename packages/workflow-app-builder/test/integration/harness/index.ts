/**
 * Barrel export for spec-doc integration test harness components.
 *
 * These are package-local test helpers — not exported as runtime API.
 *
 * @module test/integration/harness
 */

export {
  createCopilotDouble,
  type CopilotDouble,
  type CopilotCallRecord,
  type CopilotStateResponse,
  type CopilotResponseMap,
} from './spec-doc/copilot-double.js';

export {
  createFeedbackController,
  createLatch,
  type FeedbackController,
  type FeedbackChildInput,
  type FeedbackChildOutput,
  type FeedbackCallRecord,
  type FeedbackResponseConfig,
  type FeedbackResponseMap,
  type Latch,
} from './spec-doc/feedback-controller.js';

export {
  createQueueInspector,
  type QueueInspector,
  type QueueItemSnapshot,
  type QueueSnapshot,
} from './spec-doc/queue-inspector.js';

export {
  createObservabilitySink,
  type ObservabilitySink,
  type CapturedLogEntry,
  type CapturedObsEvent,
} from './spec-doc/observability-sink.js';
