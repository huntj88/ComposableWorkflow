# T08 - Workflow Command Runner, Policy, and Redaction

## Depends On
- `T04`, `T05`

## Objective
Implement controlled command execution from workflow steps with policy enforcement, timeout handling, and structured output capture.

## Implementation Tasks
- [ ] Implement command runner adapter abstraction (real process + test double).
- [ ] Implement policy engine:
  - command allow/deny
  - cwd restrictions
  - env restrictions
  - timeout caps
- [ ] Implement result capture:
  - `stdin`, `stdout`, `stderr`, `exitCode`
  - `startedAt`, `completedAt`, `durationMs`
- [ ] Implement non-zero handling semantics using `allowNonZeroExit`.
- [ ] Implement truncation/redaction with deterministic markers (`truncated`, `redactedFields`).
- [ ] Emit command lifecycle events and linked logs.
- [ ] Integration tests for policy matrix, truncation/redaction, timeout, non-zero permutations.

## Required Artifacts
- `packages/workflow-lib/src/command/*`
- `packages/workflow-server/src/command/*`
- `packages/workflow-server/test/integration/command/*`

## Acceptance Criteria
- Disallowed command requests fail before process spawn.
- Allowed commands respect policy normalization and timeout limits.
- Output/log payloads are redacted and truncated exactly per config.

## Spec/Behavior Links
- Spec: sections 6.6, 9.1, 12, 13.
- Behaviors: `B-CMD-001..004`, `B-OBS-001`.
- Integration: `ITX-010`, `ITX-011`, `ITX-012`.

## Fixed Implementation Decisions
- Process runner implementation: Node `child_process.spawn` with explicit timeout kill path.
- Policy config source: server config file + env overrides, normalized at startup.
- Redaction strategy: deterministic key-based masking (`***REDACTED***`) before persistence/log emission.
- Truncation order: redact first, truncate second.

## Interface/Schema Contracts
- Policy schema:
  - `{ allowCommands: string[], denyCommands?: string[], allowedCwdPrefixes: string[], blockedEnvKeys: string[], timeoutMsMax: number, outputMaxBytes: number, redactFields: string[] }`.
- Command event payload schema:
  - includes `command`, `args`, `stdin`, `stdout`, `stderr`, `exitCode`, `durationMs`, `truncated`, `redactedFields`.
- Non-zero behavior contract:
  - `allowNonZeroExit=false` => `command.failed`
  - `allowNonZeroExit=true` => `command.completed` with non-zero `exitCode`.

## File Plan (Exact)
### Create
- `packages/workflow-lib/src/command/command-types.ts`
- `packages/workflow-server/src/command/command-runner.ts`
- `packages/workflow-server/src/command/command-policy.ts`
- `packages/workflow-server/src/command/redaction.ts`
- `packages/workflow-server/src/command/truncation.ts`
- `packages/workflow-server/test/integration/command/policy-enforcement.spec.ts`
- `packages/workflow-server/test/integration/command/redaction-truncation.spec.ts`
- `packages/workflow-server/test/integration/command/non-zero-exit.spec.ts`
- `packages/workflow-server/test/integration/command/timeout-enforcement.spec.ts`

### Modify
- `packages/workflow-server/src/orchestrator/transition-runner.ts`

## Verification
- Command: `pnpm --filter workflow-server test -- command`
  - Expected: policy block occurs pre-spawn; allowed commands execute with expected capture fields.
- Command: `pnpm --filter workflow-server test -- ITX-010|ITX-012`
  - Expected: policy matrix and non-zero permutations produce correct event semantics.

## One-to-One Requirement Mapping
| Requirement ID | Implementation Artifact | Verification Assertion |
|---|---|---|
| Behavior-B-CMD-001 | `command-runner.ts` | Zero-exit command yields full capture and `command.completed`. |
| Behavior-B-CMD-002 | `non-zero-exit.spec.ts` | `allowNonZeroExit` toggles failed vs completed event semantics. |
| Behavior-B-CMD-003 | `timeout-enforcement.spec.ts` | Timeout termination emits `command.failed` with timeout context and telemetry. |
| Behavior-B-CMD-004 | `policy-enforcement.spec.ts`, `redaction-truncation.spec.ts` | Policy blocks pre-spawn; redaction/truncation markers emitted. |
| Integration-ITX-011 | `redaction.ts`, `truncation.ts` | Deterministic boundary assertions for truncation/redaction pass. |
