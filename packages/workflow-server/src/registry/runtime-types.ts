/**
 * Shared runtime type aliases for the workflow server.
 *
 * These extend the canonical types from `@composable-workflow/workflow-lib`
 * but erase the strongly-typed method signatures (`log`, `launchChild`,
 * `runCommand`) to `unknown`. This is intentional — the server erases
 * generics at runtime because every registration is stored in a
 * heterogeneous registry keyed only by `workflowType`.
 *
 * Structural fields (`runId`, `workflowType`, `input`, `now`, `transition`,
 * `complete`, `fail`) are inherited via `extends Omit<…>` so they stay in
 * sync with the canonical contract automatically.
 */

import type {
  WorkflowContext,
  WorkflowTransitionDescriptor,
} from '@composable-workflow/workflow-lib';

/**
 * Type-erased workflow context used by the server runtime.
 *
 * Identical to `WorkflowContext<I, O>` except `log`, `launchChild`, and
 * `runCommand` accept / return `unknown` instead of the strongly-typed
 * request / result objects.
 */
export interface RuntimeWorkflowContext<I = unknown, O = unknown> extends Omit<
  WorkflowContext<I, O>,
  'log' | 'launchChild' | 'runCommand'
> {
  log(event: unknown): void;
  launchChild<CO>(req: unknown): Promise<CO>;
  runCommand(req: unknown): Promise<unknown>;
}

export type RuntimeWorkflowStateHandler<I = unknown, O = unknown> = (
  ctx: RuntimeWorkflowContext<I, O>,
  data?: unknown,
) => void | Promise<void>;

export interface RuntimeWorkflowDefinition<I = unknown, O = unknown> {
  initialState: string;
  states: Record<string, RuntimeWorkflowStateHandler<I, O>>;
  transitions?: readonly WorkflowTransitionDescriptor[];
}

/**
 * The runtime factory signature used by the server's `WorkflowRegistration`.
 *
 * Accepts a `RuntimeWorkflowContext` (type-erased) and returns a
 * `RuntimeWorkflowDefinition`.
 */
export type RuntimeWorkflowFactory = (ctx: RuntimeWorkflowContext) => RuntimeWorkflowDefinition;
