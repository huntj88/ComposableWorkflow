# Workflow Library Spec (`workflow-lib`)

> Canonical specification for `packages/workflow-lib` — the shared runtime contracts, execution context, event types, instrumentation hooks, and command execution helpers used by all workflow packages.
>
> Cross-cutting architecture: [architecture.md](../../../docs/architecture.md)
> Server implementation: [typescript-server-workflow-spec.md](../../workflow-server/docs/typescript-server-workflow-spec.md)

---

## 1) Workflow Package Manifest

Every workflow package exports a manifest object:

```ts
export interface WorkflowPackageManifest {
  packageName: string;
  packageVersion: string;
  workflows: WorkflowRegistration[];
}

export interface WorkflowRegistration<I = unknown, O = unknown> {
  workflowType: string;              // globally unique: e.g. "billing.invoice.v1"
  workflowVersion: string;           // informational/observability only; not used for runtime version selection
  factory: WorkflowFactory<I, O>;    // creates workflow instance/definition
  metadata?: {
    displayName?: string;
    tags?: string[];
    description?: string;
  };
}
```

## 2) Workflow Runtime Types

```ts
export type WorkflowLifecycle =
  | "running"
  | "pausing"
  | "paused"
  | "resuming"
  | "recovering"
  | "cancelling"
  | "completed"
  | "failed"
  | "cancelled";

export interface WorkflowContext<I, O> {
  runId: string;
  workflowType: string;
  input: I;
  now(): Date;
  log(event: WorkflowLogEvent): void;
  transition<TState extends string>(to: TState, data?: unknown): void;
  launchChild<CI, CO>(req: ChildWorkflowRequest<CI>): Promise<CO>;
  runCommand(req: WorkflowCommandRequest): Promise<WorkflowCommandResult>;
  complete(output: O): void;
  fail(error: Error): void;
}

Failure handling semantics for workflow state handlers:
- Retries for workflow/business/action failures are authored explicitly in the workflow finite state machine (state design + transition graph).
- The server/orchestrator must not apply implicit automatic retries for state handler/action failures.
- State handlers should catch and handle expected errors locally when recovery is possible.
- Any uncaught state handler error must emit `transition.failed` and drive the run to terminal `failed` (error state).

export interface WorkflowDefinition<I, O> {
  initialState: string;
  states: Record<string, WorkflowStateHandler<I, O>>;
  transitions?: WorkflowTransitionDescriptor[]; // static metadata for graph rendering
}

export type WorkflowFactory<I, O> = (ctx: WorkflowContext<I, O>) => WorkflowDefinition<I, O>;
```

## 3) Child Workflow Contract

```ts
export interface ChildWorkflowRequest<I> {
  workflowType: string;
  input: I;
  correlationId?: string;
  idempotencyKey?: string;
}

export interface WorkflowCommandRequest {
  command: string;
  args?: string[];
  stdin?: string;
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
  allowNonZeroExit?: boolean;
}

export interface WorkflowCommandResult {
  exitCode: number;
  stdin: string;
  stdout: string;
  stderr: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
}
```

Behavior:
- Child run is linked to parent run + parent state/transition context.
- Parent awaits child result (default) or can configure async fire-and-track mode later.
- Child lifecycle events are emitted to both child stream and parent-linked view.

## 4) Runtime Events

```ts
export type WorkflowEventType =
  | "workflow.started"
  | "workflow.pausing"
  | "workflow.paused"
  | "workflow.resuming"
  | "workflow.resumed"
  | "workflow.recovering"
  | "workflow.recovered"
  | "workflow.cancelling"
  | "state.entered"
  | "transition.requested"
  | "transition.completed"
  | "transition.failed"
  | "human-feedback.requested"
  | "human-feedback.received"
  | "human-feedback.cancelled"
  | "command.started"
  | "command.completed"
  | "command.failed"
  | "child.started"
  | "child.completed"
  | "child.failed"
  | "workflow.completed"
  | "workflow.failed"
  | "workflow.cancelled"
  | "log";

export interface WorkflowEvent {
  eventId: string;
  runId: string;
  parentRunId?: string;
  workflowType: string;
  eventType: WorkflowEventType;
  state?: string;
  transition?: {
    from?: string;
    to?: string;
    name?: string;
  };
  child?: {
    childRunId: string;
    childWorkflowType: string;
    lifecycle: WorkflowLifecycle;
  };
  command?: {
    command: string;
    args?: string[];
    stdin?: string;
    stdout?: string;
    stderr?: string;
    exitCode?: number;
  };
  timestamp: string; // ISO8601
  sequence: number;  // monotonic per run
  payload?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

Human-feedback event shape decision (locked):
- Human-feedback event metadata is carried in the existing generic `payload` envelope for MVP.
- `WorkflowEvent` does not add a dedicated typed `humanFeedback` field in MVP.
- Payload conventions for `human-feedback.requested|received|cancelled` must remain documented and stable across `workflow-lib` and `workflow-server`.
```

## 5) Instrumentation Hooks

Library must provide hook points that server can inject:

```ts
export interface WorkflowInstrumentation {
  onEvent(event: WorkflowEvent): void | Promise<void>;
  onMetric(metric: WorkflowMetric): void | Promise<void>;
  onTrace(trace: WorkflowTrace): void | Promise<void>;
}
```

Library internals call these hooks whenever transition/child/start/end/log operations occur.

## 6) Workflow-Invoked Command Execution Exports

The library exposes command execution APIs workflows can call from state handlers:
- run command with args/env/cwd/timeout,
- capture stdin/stdout/stderr/exit code,
- emit command lifecycle events (`command.started|completed|failed`),
- enforce policy hooks (allowlist, timeout caps, env redaction, working-directory restrictions),
- log stdin/stdout/stderr in structured command event payloads with configurable truncation/redaction.

Example usage in a workflow state (shape, not fixed implementation):
- `await ctx.runCommand({ command: "python", args: ["-m", "invoice_job", invoiceId], timeoutMs: 30000 })`

## 7) Server-Provided Human Feedback Workflow Contract (Default)

Human feedback collection is a server/runtime concern and must not be implemented as transport logic inside feature workflow packages.

Schema artifacts (server-owned):
- `packages/workflow-server/docs/schemas/human-input/numbered-question-item.schema.json`
- `packages/workflow-server/docs/schemas/human-input/numbered-options-response-input.schema.json`

Usage contract:
- Numbered human feedback requests should shape question envelopes to `numbered-question-item.schema.json`.
- Numbered response payload validation should apply `numbered-options-response-input.schema.json` before workflow-specific interpretation.

Default workflow contract (server-owned):

```ts
// Recommended default workflowType: "server.human-feedback.v1"
export interface HumanFeedbackRequestInput {
  prompt: string;
  options: Array<{
    id: number; // unique contiguous integers starting at 1 within a single question
    label: string;
    description?: string;
  }>;
  constraints?: string[];
  questionId: string;
  correlationId?: string;
  requestedByRunId: string;
  requestedByWorkflowType: string;
  requestedByState?: string;
}

export interface HumanFeedbackRequestOutput {
  status: "responded" | "cancelled";
  response?: {
    questionId: string;
    selectedOptionIds?: number[];
    text?: string;
  };
  respondedAt?: string;
  cancelledAt?: string;
}
```

Required behavior:
- A parent workflow requests human feedback by launching this workflow via `ctx.launchChild(...)`.
- Waiting/resume mechanics and response transport are server-owned concerns.
- App/feature workflows (for example app-builder workflows) depend only on this contract and child result.
- For numbered-options queues, workflows must set `questionId` to the stable queue item identifier to support deterministic response correlation, replay, and diagnostics.
- For feedback queue processors, each queue item must launch exactly one feedback child run (1:1 question-to-feedback-run mapping).
- For numbered-options questions, option `id` values must be unique contiguous integers starting at `1` for each question.
- For numbered-options responses, every `selectedOptionId` must match an offered option `id` for that request.
- Asked numbered-options questions are immutable once issued; clarifications must append a new question with a new `questionId` instead of mutating prior question text/options.
- For clarification-driven follow-up generation, the new question must be scheduled as the immediate next queue item to avoid context switching.
- Clarifying-question vs custom-answer interpretation is workflow-level behavior; for `app-builder.spec-doc.v1`, classification is delegated to `app-builder.copilot.prompt.v1` using schema-validated structured output.
- Numbered-options completion semantics do not require canonical option IDs; completion vs continue behavior is defined by the authored question/options and optional custom response text.
- `response.text` has no protocol-level maximum length in MVP; implementations may enforce operational guardrails without changing the API contract.
- Human feedback waits have no timeout semantics in MVP; requests remain pending until explicit response or cancellation.
- When a valid response is accepted, the feedback child run completes with `status: "responded"` and the parent resumes from the waiting checkpoint.
- If cancellation occurs, output returns `status: "cancelled"`; parent cancellation policies apply.
- Server emits `human-feedback.requested|received|cancelled` events with run linkage metadata.

Implementation ownership/package decision (locked):
- The default human feedback workflow is implemented as a first-class internal monorepo package and auto-registered by `workflow-server` at bootstrap.
- It is server-owned and required for startup; it is not optional plugin behavior.
- Feature workflow packages consume only the workflow contract (`workflowType` + input/output shape) and must not depend on internal implementation modules.
- Runtime replacement/override of `server.human-feedback.v1` is not permitted in MVP.
- Enforcement in MVP uses dual guards: bootstrap reserves and registers `server.human-feedback.v1`, and registry collision checks reject any competing registration for that workflow type.
- Any future extension mechanism must preserve the default contract and first-response-wins semantics.

---

## Related Specs

- [Architecture overview](../../../docs/architecture.md)
- [Server spec](../../workflow-server/docs/typescript-server-workflow-spec.md) — dynamic loading, orchestration, persistence, API endpoints, lifecycle
- [API types spec](../../workflow-api-types/docs/workflow-api-types-spec.md) — shared transport contracts
- [CLI spec](../../../apps/workflow-cli/docs/workflow-cli-spec.md) — user-facing operator commands
