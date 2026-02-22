# Lifecycle Semantics: immediate start execution + `running`

Date: 2026-02-22

## Decision

- No operational `pending` queue state.
- `POST /api/v1/workflows/start` means start execution now.
- `running` means actively executing ONLY.

## Required Semantics

- Start acceptance implies immediate execution.
- `workflow.started` is the execution-start checkpoint event.
- `completed|failed|cancelled` are terminal outcomes.
- Control transitional lifecycles (`pausing|paused|resuming|recovering|cancelling`) keep current meaning.

## Gap To Close

- Current start path persists run + appends `workflow.started` before transition stepping begins.
- Align by triggering execution stepping immediately in the start path (or an equivalent immediate handoff).

## Files To Update

- `packages/workflow-server/src/orchestrator/start-run.ts`
- `packages/workflow-server/src/orchestrator/orchestrator.ts`
- `packages/workflow-server/src/api/routes/workflows.ts`
- `packages/workflow-server/src/orchestrator/child/launch-child.ts`
- `docs/behaviors.md`
- `docs/typescript-server-workflow-spec.md`

## Validation

- Start returns active execution semantics (`running`) and `workflow.started` at execution start.
- No docs/tests describe or require pending-queue behavior.
