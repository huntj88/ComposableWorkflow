# T15 - Integration Suite B: Lifecycle, Command, Observability

## Depends On
- `T06`, `T08`, `T09`, `T13`

## Objective
Implement the remaining integration-primary and shared tests for lifecycle control, command policy paths, and instrumentation contracts.

## Implementation Tasks
- [ ] Implement tests for:
  - `ITX-005` pause safe-point enforcement
  - `ITX-006` duplicate resume race
  - `ITX-007` recovery reconciler idempotence with partial progress
  - `ITX-008` parent-propagated cancellation traversal
  - `ITX-009` child launch rejection in forbidden lifecycles
  - `ITX-010` command policy matrix
  - `ITX-011` command truncation/redaction contract
  - `ITX-012` non-zero exit permutations
  - `ITX-013` instrumentation ordering/backpressure
  - `ITX-014` trace tree integrity
  - `ITX-015` definition metadata normalization
  - `ITX-019` startup reconcile admission gate
- [ ] Assert required lifecycle checkpoint event mapping 1:1.
- [ ] Assert telemetry failures are isolated from run-state mutation.

## Required Artifacts
- `packages/workflow-server/test/integration/itx.lifecycle.*`
- `packages/workflow-server/test/integration/itx.command.*`
- `packages/workflow-server/test/integration/itx.obs.*`

## Acceptance Criteria
- Integration-primary coverage matches `docs/integration-tests.md` section 5.1.
- Shared coverage items have corresponding E2E references (`ITX-008`, `009`, `012`, `015`).

## Spec/Behavior Links
- Integration: `ITX-005..015`, `ITX-019`.
- Behaviors: `B-LIFE-*`, `B-CMD-*`, `B-OBS-*`, `B-API-005`, `B-CHILD-004`.

## Fixed Implementation Decisions
- Required lifecycle tests must assert event sequencing and lifecycle terminalization, not only status codes.
- Command tests use deterministic fake command runner for matrix permutations; one smoke path uses real spawn.
- Observability tests assert explicit sink order and failure-isolation semantics.

## Interface/Schema Contracts
- Required lifecycle event sequence assertions:
  - pause: `workflow.pausing` -> `workflow.paused`
  - resume: `workflow.resuming` -> `workflow.resumed`
  - cancel: `workflow.cancelling` -> `workflow.cancelled`
  - recovery: `workflow.recovering` -> `workflow.recovered`.
- Command redaction marker contract:
  - payload includes boolean `truncated` and string[] `redactedFields`.

## File Plan (Exact)
### Create
- `packages/workflow-server/test/integration/itx.lifecycle.ITX-005.spec.ts`
- `packages/workflow-server/test/integration/itx.lifecycle.ITX-006.spec.ts`
- `packages/workflow-server/test/integration/itx.lifecycle.ITX-007.spec.ts`
- `packages/workflow-server/test/integration/itx.lifecycle.ITX-008.spec.ts`
- `packages/workflow-server/test/integration/itx.lifecycle.ITX-009.spec.ts`
- `packages/workflow-server/test/integration/itx.command.ITX-010.spec.ts`
- `packages/workflow-server/test/integration/itx.command.ITX-011.spec.ts`
- `packages/workflow-server/test/integration/itx.command.ITX-012.spec.ts`
- `packages/workflow-server/test/integration/itx.obs.ITX-013.spec.ts`
- `packages/workflow-server/test/integration/itx.obs.ITX-014.spec.ts`
- `packages/workflow-server/test/integration/itx.api.ITX-015.spec.ts`
- `packages/workflow-server/test/integration/itx.lifecycle.ITX-019.spec.ts`

### Modify
- `packages/workflow-server/test/integration/setup.ts`

## Verification
- Command: `pnpm --filter workflow-server test -- ITX-005|ITX-006|ITX-007|ITX-008|ITX-009|ITX-010|ITX-011|ITX-012|ITX-013|ITX-014|ITX-015|ITX-019`
  - Expected: all mandatory ITX tests pass deterministically.

## One-to-One Requirement Mapping
| Requirement ID | Test File | Expected Assertion |
|---|---|---|
| ITX-005 | `itx.lifecycle.ITX-005.spec.ts` | Pause reaches `paused` only at safe points; no partial commit. |
| ITX-006 | `itx.lifecycle.ITX-006.spec.ts` | Duplicate resume requests collapse to one logical resume. |
| ITX-007 | `itx.lifecycle.ITX-007.spec.ts` | Reconcile idempotent under partial progress and restart. |
| ITX-008 | `itx.lifecycle.ITX-008.spec.ts` | Parent cancellation traverses active descendants exactly once. |
| ITX-009 | `itx.lifecycle.ITX-009.spec.ts` | Child launch rejected in forbidden lifecycles. |
| ITX-010 | `itx.command.ITX-010.spec.ts` | Policy matrix enforced before process spawn. |
| ITX-011 | `itx.command.ITX-011.spec.ts` | Truncation/redaction boundaries and markers deterministic. |
| ITX-012 | `itx.command.ITX-012.spec.ts` | Non-zero + allow flag permutations emit correct command events. |
| ITX-013 | `itx.obs.ITX-013.spec.ts` | Hook ordering preserved with backpressure/failing sinks. |
| ITX-014 | `itx.obs.ITX-014.spec.ts` | Trace tree parentage valid for transition/command/child nesting. |
| ITX-015 | `itx.api.ITX-015.spec.ts` | Definition metadata normalization has no phantom states/edges. |
| ITX-019 | `itx.lifecycle.ITX-019.spec.ts` | Startup reconcile gate blocks new execution until reconcile completion boundary. |
