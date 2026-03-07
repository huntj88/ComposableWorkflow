/**
 * Barrel export for `workflow-app-builder` integration test suites.
 *
 * Re-exports harness components and shared helpers so consumers can use a
 * single import path for test infrastructure.
 *
 * @module test/integration
 */

// Harness test doubles
export {
  createCopilotDouble,
  type CopilotDouble,
  type CopilotCallRecord,
  type CopilotStateResponse,
  type CopilotResponseMap,
  createFeedbackController,
  createLatch,
  type FeedbackController,
  type FeedbackChildInput,
  type FeedbackChildOutput,
  type FeedbackCallRecord,
  type FeedbackResponseConfig,
  type FeedbackResponseMap,
  type Latch,
  createQueueInspector,
  type QueueInspector,
  type QueueItemSnapshot,
  type QueueSnapshot,
  createObservabilitySink,
  type ObservabilitySink,
  type CapturedLogEntry,
  type CapturedObsEvent,
} from './harness/index.js';

// Spec-doc integration helpers
export {
  makeDefaultInput,
  makeQuestionItem,
  makeQueueItem,
  makeIntegrationOutput,
  makeReadinessChecklist,
  makeConsistencyOutput,
  makeBlockingIssue,
  makeActionableItem,
  makeClassificationOutput,
  makeClarificationFollowUpOutput,
  makeStateDataAfterIntegration,
  makeStateDataForClassification,
  makeStateDataForExpandClarification,
  createMockContext,
  runFSM,
  type TransitionRecord,
  type MockWorkflowResult,
  type ChildLaunchRecord,
  type FSMRunResult,
} from './spec-doc/helpers.js';
