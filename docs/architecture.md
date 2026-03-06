# Composable Workflow — Architecture Overview

> Cross-cutting architecture, goals, and delivery plan for the ComposableWorkflow monorepo.
> Per-package specifications live alongside each package; this document covers concerns that span multiple packages.

## 1) Summary

This document specifies a server-side TypeScript implementation inspired by `huntj88/flow` (composable, compile-time-validated state machine flows with child flow composition), adapted for backend execution and API-driven observability.

The system is a monorepo with:
- a workflow runtime library used by all workflow packages,
- a shared API contract package for HTTP/SSE request-response/event types,
- a server process that dynamically loads and executes workflow packages,
- an API for launching workflows and querying rich runtime state/history/logs,
- a web SPA client that consumes the shared API contract package,
- first-class support for child workflows and complete transition lineage.

### Per-Package Spec References

| Package | Spec |
|---|---|
| `packages/workflow-lib` | [workflow-lib-spec.md](../packages/workflow-lib/docs/workflow-lib-spec.md) |
| `packages/workflow-api-types` | [workflow-api-types-spec.md](../packages/workflow-api-types/docs/workflow-api-types-spec.md) |
| `packages/workflow-server` | [typescript-server-workflow-spec.md](../packages/workflow-server/docs/typescript-server-workflow-spec.md) |
| `packages/workflow-app-builder` | [spec-doc-generation-workflow.md](../packages/workflow-app-builder/docs/spec-doc-generation-workflow.md) |
| `apps/workflow-cli` | [workflow-cli-spec.md](../apps/workflow-cli/docs/workflow-cli-spec.md) |
| `apps/workflow-web` | [workflow-web-spec.md](../apps/workflow-web/docs/workflow-web-spec.md) |

---

## 2) Goals

1. Preserve Flow-style composability:
   - parent workflow can launch child workflow(s),
   - parent resumes with child output.
2. Strongly typed workflow authoring in TypeScript packages.
3. Dynamic workflow package loading at runtime on the server.
4. Rich runtime introspection:
   - active workflow tree,
   - current state/node,
   - child workflow status,
   - transition history (linear event stream),
   - logs/telemetry by transition/state/child workflow lifecycle.
5. Decoupled architecture:
   - workflow packages depend only on shared workflow library,
   - server depends on the same library and package contracts,
   - workflow packages do not depend on server internals.
6. Library includes workflow-invoked command execution support for workflow steps.
7. User-facing CLI tooling is a separate capability (for operators/developers), not part of workflow step execution.
8. Server instruments workflow library operations with logging + telemetry.
9. API request/response/event types are defined once in a shared package and consumed by both server and clients.

## 3) Non-Goals

- Building any UI.
- Defining a specific diagram rendering engine.
- Defining a state machine code generator (can be added later).

## 3.1 Defer-Now, Adopt-Later Checklist (State Machine Code Generator)

To keep later generator adoption low-risk while deferring it now:
- Keep workflow definitions declarative with explicit `states` and `transitions` metadata (avoid hidden dynamic transition wiring).
- Standardize state/transition naming conventions across workflow packages (`domain.action.state` style or equivalent documented scheme).
- Keep all workflow contracts (`WorkflowDefinition`, `WorkflowContext`, event payload shapes) stable and versioned through `workflow-lib` only.
- Require transition validity/unit tests for every workflow package (including invalid-transition failure paths).
- Ensure definition metadata exposed by API (`/api/v1/workflows/definitions/{workflowType}`) remains complete and generator-friendly.
- Avoid package-specific DSLs/macros that would conflict with a future shared generator output format.

---

## 4) Core Concepts

## 4.1 Workflow Definition
A workflow is a finite state machine definition with:
- typed input/output,
- explicit states,
- explicit transitions,
- optional side effects/actions,
- ability to launch child workflows.

## 4.2 Workflow Instance
Runtime execution of a workflow definition. Every instance has:
- unique `workflowRunId`,
- `workflowType` and package metadata,
- lifecycle (`running | completed | failed | cancelled` plus control transitional lifecycles),
- current state,
- timestamps,
- parent link (if child),
- child run references,
- append-only event history.

## 4.3 Event-Sourced Runtime Log
All meaningful events are appended in order to a per-run event stream:
- run started,
- transition attempted/succeeded/failed,
- state entered/exited,
- child run started/completed/failed,
- run completed/failed/cancelled,
- custom workflow log events.

This linear history is source-of-truth for inspection and replay diagnostics.

## 4.4 Execution Tree
A root workflow plus transitive children forms a workflow tree (DAG constrained to parent-child ownership; no shared mutable child instances).

---

## 5) Monorepo Architecture

```text
ComposableWorkflow/
  docs/
  packages/
    workflow-lib/                # shared runtime + contracts + workflow command runner helpers
    workflow-api-types/          # shared HTTP/SSE API schemas + TypeScript types
    workflow-server/             # HTTP/gRPC server + persistence + instrumentation
    workflow-package-<name>/     # one or more decoupled workflow definitions
    workflow-package-<name2>/
  apps/
    workflow-cli/                # optional user-facing CLI app (operator/developer commands)
    workflow-web/                # browser SPA for workflow visualization + operator controls
```

## 5.1 Package Responsibilities

### `packages/workflow-lib`
→ Full spec: [workflow-lib-spec.md](../packages/workflow-lib/docs/workflow-lib-spec.md)

Exports:
- workflow type contracts,
- runtime interfaces and execution context,
- transition primitives,
- child workflow launch APIs,
- event/logging hooks (instrumentable),
- package manifest interfaces,
- workflow-invoked command execution helpers for workflow steps.

No server-specific DB, transport, or framework coupling.

### `packages/workflow-api-types`
→ Full spec: [workflow-api-types-spec.md](../packages/workflow-api-types/docs/workflow-api-types-spec.md)

Exports versioned API contracts shared by server and clients:
- route DTO types for REST requests/responses,
- SSE stream frame/event types,
- query parameter/pagination/filter contract types,
- JSON schema or Zod schema artifacts (where validation is required at runtime).

Dependency rules:
- may depend on foundational shared contracts from `workflow-lib`,
- must not depend on server implementation modules/framework internals,
- server and clients (CLI/web) must import these API contracts instead of redefining DTOs.

### `packages/workflow-server`
→ Full spec: [typescript-server-workflow-spec.md](../packages/workflow-server/docs/typescript-server-workflow-spec.md)

Implements:
- dynamic package discovery/loading,
- workflow registry,
- execution orchestrator,
- persistence for run/event data,
- telemetry/logging adapters,
- API layer.

### `packages/workflow-package-*`
Contain user workflows and optional shared domain code.
Must depend only on `workflow-lib` (and their own domain deps), not `workflow-server`.

Each package may expose one workflow or multiple related workflows.

### `apps/workflow-cli`
→ Full spec: [workflow-cli-spec.md](../apps/workflow-cli/docs/workflow-cli-spec.md)

Optional user-facing CLI application for operators/developers.
Uses server APIs and/or package metadata for tasks like run/inspect/list/tail events.
This is intentionally separate from workflow step command execution APIs in `workflow-lib`.

### `apps/workflow-web`
→ Full spec: [workflow-web-spec.md](../apps/workflow-web/docs/workflow-web-spec.md)

User-facing SPA for live workflow visualization and interaction.
Consumes server APIs and SSE stream using shared DTO/event contracts from `packages/workflow-api-types`.
Must not import server implementation modules.

---

## 6) Security and Multi-Tenancy (Out of Scope)

Security and multi-tenancy are not goals of this project and are out of scope for the current delivery.

---

## 7) Testing Strategy

1. `workflow-lib` unit tests:
   - transition validity,
   - child workflow orchestration,
   - event emission correctness.
2. workflow package tests:
   - state progression,
   - failure paths,
   - child dependencies.
3. server integration tests:
   - package loading,
   - API correctness,
   - persistence and event ordering,
   - observability hooks,
   - human feedback request/response API and run linkage behavior,
   - run-scoped feedback discovery endpoint (`GET /api/v1/workflows/runs/{runId}/feedback-requests`) pagination/filter behavior,
   - endpoint handler type conformance against `workflow-api-types` exports for all Section 4 routes,
   - contract lock drift test for workflow-api-types-spec.md §2 table vs web spec Section 6.2 table (method/path/contract equality).
4. Workflow-invoked command execution tests:
  - run command behavior from workflow state handlers,
  - timeout/non-zero exit handling,
  - command event/log emission correctness.
5. User CLI tests:
  - command parsing and output formatting,
  - run/list/inspect/events command behavior,
  - API integration and follow-stream behavior.
6. Pause/Resume/Recovery tests:
  - valid/invalid state transitions for pause and resume (`409` behavior),
  - lifecycle checkpoint events are emitted for pause/resume/recovery transitions (`workflow.pausing`, `workflow.paused`, `workflow.resuming`, `workflow.resumed`, `workflow.recovering`, `workflow.recovered`),
  - crash recovery reconciliation and idempotent re-run behavior,
  - parent/child behavior during pause, resume, and propagated cancel.
7. Human feedback orchestration tests:
  - parent workflow blocks on feedback child and resumes on response,
  - invalid `selectedOptionIds` are rejected with `400` and do not terminalize pending feedback,
  - feedback response endpoint first-response-wins idempotency,
  - unresolved feedback remains pending until response or cancellation,
  - no duplicate feedback side effects across recovery reconciliation.

---

## 8) Phased Delivery Plan

### Phase 1 (MVP)
- Monorepo scaffold.
- `workflow-lib` core contracts + runtime + child launch + events.
- `workflow-api-types` baseline API contract package with server/client-shared DTOs.
- `workflow-server` start run + get run + get events + list active + run tree + definition metadata.
- Local Postgres via Docker compose + initial migration set.
- Required parent/child lineage relation (`workflow_run_children`) in persistence model.
- One example workflow package.
- Command execution policy configuration (workflow-invoked commands).
- Basic logging + metrics.

### Phase 2
- SSE live stream.
- Initial `apps/workflow-cli` commands (run/list/inspect/events).
- Initial `apps/workflow-web` visualization experience (run list, run details, graph + tree, live updates).

### Phase 3
- Snapshots/replay optimizations.
- Advanced retry/cancellation policies.

---

## 9) Acceptance Criteria

1. A workflow package can be built and published without referencing server internals.
2. Server can dynamically load package(s) and start a workflow by type.
3. Parent workflow can launch child workflow and await typed result.
4. API exposes current run state, active children, and full linear transition/event history.
5. API exposes definition + runtime data that satisfies [workflow-api-types graph contract](../packages/workflow-api-types/docs/workflow-api-types-spec.md#5-data-contracts-for-flowchart-rendering) invariants (deterministic state/transition identity, stable transition ordering, and resolvable runtime overlay references).
6. Logs and telemetry are emitted for all major workflow-lib operations through server instrumentation.
7. Workflows can execute CLI commands through `workflow-lib` with policy enforcement, and those command steps are visible in events/logs/telemetry.
8. User-facing CLI commands (in `apps/workflow-cli`) can start/inspect workflows via server APIs, independent of workflow step command execution.
9. Cancellation uses cooperative stop mechanics and parent-propagated scope by default, and cancelled runs end with `workflow.cancelled`.
10. Runs can be paused, resumed, and recovered after crash/shutdown using the defined lifecycle transitions and recovery endpoints.
11. Pause/resume/recovery transitions emit matching lifecycle events as required observable checkpoints.
12. Human feedback collection is available as a server-owned default workflow contract and is consumable by workflow packages without transport coupling.
13. Server, CLI, and web clients consume shared transport DTO/event contracts from `packages/workflow-api-types` (no duplicated endpoint models for covered APIs).
14. API endpoints are documented with consistent absolute `/api/v1` path prefixes for REST and SSE routes.
15. API contract updates are versioned via `workflow-api-types`; incompatible changes are semver-major and are reflected in server/client compile-time checks.
16. `GET /api/v1/workflows/runs/{runId}/feedback-requests` returns deterministic, paginated feedback request discovery data for run dashboards without requiring prior `feedbackRunId` knowledge.
17. Every endpoint in [server spec Section 4](../packages/workflow-server/docs/typescript-server-workflow-spec.md#4-api-specification) has a matching shared transport contract in `packages/workflow-api-types`, and server/web/CLI consume those shared types without local duplicate DTOs for covered APIs.
18. Endpoints and shared contracts in [workflow-api-types endpoint lock](../packages/workflow-api-types/docs/workflow-api-types-spec.md#2-web-spa-endpoint-contract-lock) are an exact match to `apps/workflow-web/docs/workflow-web-spec.md` Section 6.2 (path + contract names).
19. CI fails if any covered endpoint transport contract diverges from `packages/workflow-api-types` exports or if endpoint lock tables drift.
20. `GET /api/v1/workflows/runs/{runId}/feedback-requests` enforces run-scoped filtering semantics and does not expose unrelated feedback requests.
21. Server graph contracts stay aligned with web graph requirements in `apps/workflow-web/docs/workflow-web-spec.md` Sections 6.6 and 8.5, and shared contract exports in `packages/workflow-api-types`.

---

## Cross-Cutting Task Index

Tasks that span multiple packages are tracked here. Package-specific tasks live alongside each package.

| Task | Document | Scope |
|---|---|---|
| `T00` | [00-monorepo-foundation.md](./tasks/00-monorepo-foundation.md) | All packages — monorepo scaffold |
| `T17` | [17-ci-quality-gates.md](./tasks/17-ci-quality-gates.md) | All packages — CI pipeline |

### Package-Specific Task Indexes

- [workflow-server tasks](../packages/workflow-server/docs/tasks/README.md)
- [workflow-lib tasks](../packages/workflow-lib/docs/tasks/README.md)
- [workflow-api-types tasks](../packages/workflow-api-types/docs/tasks/README.md)
- [workflow-cli tasks](../apps/workflow-cli/docs/tasks/README.md)
- [workflow-package-reference tasks](../packages/workflow-package-reference/docs/tasks/README.md)
- [workflow-app-builder tasks](../packages/workflow-app-builder/docs/tasks/README.md)
- [workflow-web tasks](../apps/workflow-web/docs/tasks/README.md)
