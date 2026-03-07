# SDB-19 - Task Suite Supersession Notes for Delegated Child Evolution

## Depends On
- `SDB-16`
- `SDB-16A`
- `SDB-18`

## Objective
Capture task-suite level supersession notes for the delegated consistency/follow-up child so newer scoped-prompt and explicit-child-FSM work can coexist with older completed task records without rewriting those completed task files.

## Implementation Tasks
- [ ] Add a task-suite addendum that lists completed tasks whose wording has been superseded by delegated-child follow-on work.
- [ ] Document that `SDB-16A` established scoped consistency prompt layers in place of the former single combined consistency prompt.
- [ ] Document that explicit child runtime-state progression is future work owned by `SDB-18`, not part of the already-completed delegated-child delivery.
- [ ] Ensure the task index and dependency graph point readers at the active follow-on tasks for delegated-child evolution.

## Required Artifacts
- `packages/workflow-app-builder/docs/tasks/README.md`
- `packages/workflow-app-builder/docs/tasks/19-task-suite-supersession-notes.md`

## Acceptance Criteria
- Readers can identify that `SDB-16A` captures the scoped-prompt baseline and which later task supersedes legacy combined-prompt assumptions without editing completed task files.
- Readers can identify that explicit child self-loop runtime states remain future work owned by `SDB-18`.
- Readers can identify that current shipped delegated-child behavior is the scoped-prompt baseline, while explicit self-loop runtime states are only a follow-on target.
- The task index and dependency graph include this addendum task.

## Spec/Behavior Links
- Spec: sections 6.2.1, 7.2.2, 7.2.2.1.
- Behaviors: `B-SD-CHILD-001`, `B-SD-CHILD-001A`, `B-SD-OBS-003`.

## Fixed Implementation Decisions
- Completed task records remain immutable after completion for this cleanup pass.
- Supersession is documented through new follow-on tasks rather than retroactive edits to closed tasks.

## Interface/Schema Contracts
- No runtime schema changes are introduced by this task.
- This task documents ownership and supersession only.

## File Plan (Exact)
### Create
- `packages/workflow-app-builder/docs/tasks/19-task-suite-supersession-notes.md`

### Modify
- `packages/workflow-app-builder/docs/tasks/README.md`

## Verification
- Command: `rg -n "SDB-16A|SDB-18|SDB-19|combined consistency prompt|explicit child" packages/workflow-app-builder/docs/tasks`
  - Expected: task-suite docs clearly point to the active delegated-child follow-on tasks and supersession notes.

## One-to-One Requirement Mapping
| Requirement ID | Implementation Artifact | Verification Assertion |
|---|---|---|
| SD-TASK-001-SupersessionOwnership | `docs/tasks/19-task-suite-supersession-notes.md` | task addendum identifies `SDB-16A` as the scoped-prompt baseline and active follow-on ownership for delegated-child evolution. |
| SD-TASK-002-IndexVisibility | `docs/tasks/README.md` | task index and dependency graph surface `SDB-16A`, `SDB-18`, and `SDB-19` as the active delegated-child follow-on references. |