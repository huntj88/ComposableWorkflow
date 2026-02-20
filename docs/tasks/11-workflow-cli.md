# T11 - User-Facing Workflow CLI

## Depends On
- `T05`

## Objective
Implement `apps/workflow-cli` as operator/developer tooling independent from in-workflow command execution.

## Implementation Tasks
- [ ] Implement CLI command surface:
  - `workflow run`
  - `workflow runs list`
  - `workflow runs events --follow`
  - `workflow inspect --graph`
- [ ] Implement robust API client with retry/backoff for transient network errors.
- [ ] Add JSON input/output modes for scripting.
- [ ] Implement incremental stream rendering for follow mode.
- [ ] Add unit tests for command parsing, output mode formatting, and retry policy decisions.
- [ ] Add contract tests against running server API.

## Required Artifacts
- `apps/workflow-cli/src/*`
- `apps/workflow-cli/test/*`

## Acceptance Criteria
- CLI behavior matches API semantics and reflects server-side filtering/stream ordering.
- CLI does not depend on workflow step command execution paths.
- Unit tests cover CLI command handling and API client retry behavior independent of live server contract tests.

## Spec/Behavior Links
- Spec: sections 6.7, 15 phase 2.
- Behaviors: `B-CLI-001..004`.

## Fixed Implementation Decisions
- CLI framework: `commander`.
- Output modes: human-readable table/text (default) and `--json` machine mode.
- HTTP client: `undici` with retry policy on network/5xx only.
- Exit codes: `0` success, `2` validation/usage error, `3` API/runtime error.

## Interface/Schema Contracts
- Command contracts:
  - `workflow run --type <workflowType> --input <json> [--idempotency-key <key>]`
  - `workflow runs list [--lifecycle <state>] [--workflow-type <type>]`
  - `workflow runs events --run-id <id> [--follow] [--cursor <cursor>]`
  - `workflow inspect --type <workflowType> --graph`
- JSON output schema for `run`:
  - `{ runId, workflowType, workflowVersion, lifecycle, startedAt }`.

## File Plan (Exact)
### Create
- `apps/workflow-cli/src/index.ts`
- `apps/workflow-cli/src/commands/run.ts`
- `apps/workflow-cli/src/commands/runs-list.ts`
- `apps/workflow-cli/src/commands/runs-events.ts`
- `apps/workflow-cli/src/commands/inspect-graph.ts`
- `apps/workflow-cli/src/http/client.ts`
- `apps/workflow-cli/test/contract/run-command.spec.ts`
- `apps/workflow-cli/test/contract/events-follow.spec.ts`

### Modify
- `apps/workflow-cli/package.json`

## Verification
- Command: `pnpm --filter workflow-cli test`
  - Expected: command parsing, JSON mode, and API integration contracts pass.
- Command: `pnpm --filter workflow-cli run workflow -- runs events --run-id wr_test --follow --json`
  - Expected: incremental ordered event output and clean reconnect behavior.

## One-to-One Requirement Mapping
| Requirement ID | Implementation Artifact | Verification Assertion |
|---|---|---|
| Behavior-B-CLI-001 | `commands/run.ts`, `run-command.spec.ts` | CLI starts workflow and surfaces run metadata. |
| Behavior-B-CLI-002 | `commands/runs-list.ts` | Filtered list output matches server semantics. |
| Behavior-B-CLI-003 | `commands/runs-events.ts`, `events-follow.spec.ts` | Follow mode renders ordered incremental events. |
| Behavior-B-CLI-004 | `commands/inspect-graph.ts` | Graph metadata fetched and displayed/exported. |
