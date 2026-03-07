# SDB-19 - Task Suite Supersession Notes for Delegated Child Evolution

## Depends On
- `SDB-16`
- `SDB-16A`
- `SDB-18`

## Objective
Capture task-suite level supersession notes for the delegated consistency/follow-up child so newer scoped-prompt and explicit-child-FSM work can coexist with older completed task records without rewriting those completed task files.

## Implementation Tasks
- [x] Add a task-suite addendum that lists completed tasks whose wording has been superseded by delegated-child follow-on work.
- [x] Document that `SDB-16A` established scoped consistency prompt layers in place of the former single combined consistency prompt.
- [x] Document that the broad `consistency-check-output.schema.json` contract is now aggregate-only, while focused prompt layers must use stage-specific schemas.
- [x] Document that explicit child runtime-state progression was follow-on work owned by `SDB-18`, not part of the already-completed delegated-child delivery captured by earlier closed tasks.
- [x] Ensure the task index and dependency graph point readers at the active follow-on tasks for delegated-child evolution.

## Required Artifacts
- `packages/workflow-app-builder/docs/tasks/README.md`
- `packages/workflow-app-builder/docs/tasks/19-task-suite-supersession-notes.md`

## Acceptance Criteria
- Readers can identify that `SDB-16A` captures the scoped-prompt baseline and which later task supersedes legacy combined-prompt assumptions without editing completed task files.
- Readers can identify that legacy “shared broad child schema per prompt layer” wording is superseded by the stage-specific schema plan owned by `SDB-18`.
- Readers can identify that earlier completed tasks treated explicit child self-loop runtime states as future work owned by `SDB-18`, and that this wording is now historical.
- Readers can identify that the scoped-prompt baseline came from `SDB-16A`, while explicit self-loop runtime states and stage-specific schema ownership were later delivered by `SDB-18`.
- The task index and dependency graph include this addendum task.

## Spec/Behavior Links
- Spec: sections 6.2.1, 7.2.2, 7.2.2.1.
- Behaviors: `B-SD-CHILD-001`, `B-SD-CHILD-001A`, `B-SD-OBS-003`.

## Fixed Implementation Decisions
- Completed task records remain immutable after completion for this cleanup pass.
- Supersession is documented through new follow-on tasks rather than retroactive edits to closed tasks.
- Aggregate-vs-stage schema ownership is documented in follow-on task notes rather than by rewriting completed implementation tasks.

## Interface/Schema Contracts
- No runtime schema implementation is delivered by this task.
- This task documents ownership and supersession only, including the distinction between aggregate child schema usage and stage-specific prompt schema usage.

## Task-Suite Addendum: Delegated Child Supersession Notes

Completed task records remain unchanged, but the delegated-child sequence must now be read in the following order when older task text appears to conflict:

1. `SDB-16` delivered the original delegated-child baseline.
2. `SDB-16A` superseded any remaining assumptions that the delegated child should use one combined consistency prompt.
3. `SDB-17` added parity and coverage on top of the `SDB-16A` scoped-prompt baseline.
4. `SDB-18` superseded older wording that still treated explicit child runtime-state progression as a follow-on target and that still described the broad child schema as the per-layer prompt schema.
5. `SDB-19` is the task-suite addendum that tells readers how to interpret those closed tasks without rewriting them.

### Completed Tasks With Superseded Wording

- `SDB-16`
  - Historical wording to reinterpret: prompt layers used the broad `consistency-check-output.schema.json` contract directly.
  - Active interpretation: `SDB-16` remains the delegated-child origin point, but `SDB-18` now owns the rule that the broad child contract is aggregate-only and that each focused prompt layer must bind to its own stage-specific schema.
- `SDB-16A`
  - Historical wording to reinterpret: scoped prompt decoupling preserved the then-current child execution model and explicitly left child self-loop runtime states for later work.
  - Active interpretation: `SDB-16A` remains the canonical scoped-prompt baseline and the point where the combined consistency prompt was retired; `SDB-18` is the later completed refactor that promoted that baseline into explicit child runtime states.
- `SDB-17`
  - Historical wording to reinterpret: explicit child runtime-state progression remained future work owned by `SDB-18`.
  - Active interpretation: those references are preserved as historical sequencing notes only; explicit child runtime-state progression is now implemented by `SDB-18`.

### Active Ownership Summary

- Scoped consistency prompt layers replaced the former combined consistency prompt in `SDB-16A`.
- Aggregate child-result ownership remains with `consistency-check-output.schema.json`.
- Focused prompt-layer schema ownership now belongs to the stage-specific schemas delivered by `SDB-18`.
- Explicit child runtime-state progression (`start -> ExecutePromptLayer -> Done` with self-looping `ExecutePromptLayer`) is also delivered by `SDB-18`.
- This task exists only to document the supersession chain and keep closed-task history readable.

## File Plan (Exact)
### Create
- `packages/workflow-app-builder/docs/tasks/19-task-suite-supersession-notes.md`

### Modify
- `packages/workflow-app-builder/docs/tasks/README.md`

## Verification
- Command: `rg -n "SDB-16A|SDB-18|SDB-19|combined consistency prompt|explicit child|aggregate child schema|stage-specific schema" packages/workflow-app-builder/docs/tasks`
  - Expected: task-suite docs clearly point to the active delegated-child follow-on tasks, schema-ownership split, and supersession notes.

## One-to-One Requirement Mapping
| Requirement ID | Implementation Artifact | Verification Assertion |
|---|---|---|
| SD-TASK-001-SupersessionOwnership | `docs/tasks/19-task-suite-supersession-notes.md` | task addendum identifies `SDB-16A` as the scoped-prompt baseline and active follow-on ownership for delegated-child evolution. |
| SD-TASK-001A-SchemaOwnershipSplit | `docs/tasks/19-task-suite-supersession-notes.md` | task addendum identifies the broad child schema as aggregate-only and points stage-specific prompt schema follow-on ownership to `SDB-18`. |
| SD-TASK-002-IndexVisibility | `docs/tasks/README.md` | task index and dependency graph surface `SDB-16A`, `SDB-18`, and `SDB-19` as the active delegated-child follow-on references. |