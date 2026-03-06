# CI Triage and Flake Control

This document defines required triage controls for CI quality gates in TC-01.

## 1) Gate Model

Required pull request gates run in strict stage order:
1. `build` (`pnpm -r build`)
2. `unit` (`pnpm -r test -- --runInBand=false`)
3. `integration` (`pnpm --filter workflow-server test -- ITX-`)
4. `e2e` (`pnpm --filter workflow-server test:e2e && pnpm --filter workflow-cli test:e2e`)
5. `sse-stream` (`pnpm --filter workflow-server test:e2e -- api-read.spec.ts`)

`build` is fail-fast for all downstream jobs.

## 2) Hermetic Environment Requirements

- CI runs with a local ephemeral Postgres service (`postgres:16-alpine`) per test job.
- Test data is isolated to CI-local container state only.
- Reference workflow package source is fixed via `WORKFLOW_PACKAGE_SOURCES`.
- Determinism controls are declared in CI env and tracked in artifacts:
  - `ITX_CLOCK_MODE=fake`
  - `ITX_FAULT_INJECTION=enabled`

## 3) Artifact Capture on Failure

On failing `unit`, `integration`, `e2e`, or `sse-stream` jobs, CI uploads stage-specific artifacts under `.artifacts/<stage>`.

Captured artifacts include:
- `console.log` command output timeline for the stage.
- `fault-injection-metadata.json` with deterministic toggle settings.
- Any discovered diagnostics snapshots matching `*diagnostic*.json`, `*timeline*.json`, `*trace*.json`, `*metric*.json`, `*fault*.json`.

Primary triage signals:
- event timeline dumps (from timeline/diagnostic exports),
- logs/metrics/traces snapshots,
- fault injection metadata.

## 4) Retry Policy

Retries are allowed only for known transient infrastructure failure classes:
- Postgres startup race (`database system is starting up`, code `57P03`),
- container/network bootstrap interruptions outside test logic.

Retries are not allowed for product-behavior failures, including:
- deterministic assertion failures,
- ordering/sequence mismatches,
- timing-sleep race tests.

## 5) Flake Quarantine Process

If a test is flaky, open a quarantine record before merge:

| Field | Required Value |
|---|---|
| TestID | Exact behavior/scenario/integration ID (`B-*`, `GS-*`, `ITX-*`) |
| TestFile | Canonical spec file path |
| Owner | Single accountable engineer |
| DateOpened | UTC date |
| Deadline | UTC date; max 14 days |
| FailureSignature | Deterministic error fingerprint |
| ExitCondition | Condition to remove quarantine |

Rules:
- Quarantine must have owner + deadline.
- Quarantined tests are never silently ignored.
- Expired quarantine blocks release until resolved or re-approved.

## 6) Deterministic Release Gate

Release readiness requires all integration-primary requirements from `docs/integration-tests.md` section 5.1 to pass deterministically in CI.

If any integration-primary test is flaky or quarantined, release is blocked until resolved.
