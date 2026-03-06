# Workflow CLI Spec (`workflow-cli`)

> Canonical specification for `apps/workflow-cli` — the user-facing operator/developer CLI application.
>
> Cross-cutting architecture: [architecture.md](../../../docs/architecture.md)
> Server API: [typescript-server-workflow-spec.md](../../../packages/workflow-server/docs/typescript-server-workflow-spec.md)
> Shared transport contracts: [workflow-api-types-spec.md](../../../packages/workflow-api-types/docs/workflow-api-types-spec.md)

---

## 1) Purpose

User CLI tooling belongs in `apps/workflow-cli` and is not invoked from workflow state handlers.
This is intentionally separate from workflow step command execution APIs in `workflow-lib`.

## 2) Responsibilities

- run workflow by type + input JSON,
- query currently running workflows,
- inspect run tree and linear event history,
- stream logs/events for operational debugging,
- stream transition/events to stdout,
- list pending human-feedback requests,
- submit human-feedback response by feedback run id,
- optional graph metadata dump.

## 3) Example Commands

```sh
workflow run --type billing.invoice.v1 --input '{...}'
workflow runs list --lifecycle running
workflow runs events --run-id wr_123 --follow
workflow runs tree --run-id wr_123 --depth 3
workflow inspect --type billing.invoice.v1 --graph
workflow feedback list --run-id wr_123 --status awaiting_response
workflow feedback respond --feedback-run-id wr_feedback_123 --response '{"questionId":"q_scope_001","selectedOptionIds":[2],"text":"..."}' --responded-by operator_a
```

Human-feedback CLI scope decision (locked):
- MVP includes minimal operator CLI support for human feedback (`feedback list`, `feedback respond`).
- Advanced feedback UX (watch mode, rich formatting, bulk actions, escalation tooling) is out of scope for MVP.

## 4) Shared Contract Consumption

The CLI must consume shared transport DTO/event contracts from `@composable-workflow/workflow-api-types` for all covered endpoints (see [workflow-api-types-spec.md](../../../packages/workflow-api-types/docs/workflow-api-types-spec.md)).
No local DTO duplication for covered APIs.

## 5) CLI Behaviors

### B-CLI-001: `workflow run` starts run via server API
### B-CLI-002: `workflow runs list` reflects server-side active filter
### B-CLI-003: `workflow runs events --follow` streams incremental events
### B-CLI-004: `workflow inspect --graph` resolves definition metadata
### B-CLI-005: `workflow feedback list` lists pending feedback requests
### B-CLI-006: `workflow feedback respond` submits feedback response

## 6) Testing Strategy

- command parsing and output formatting,
- run/list/inspect/events command behavior,
- API integration and follow-stream behavior.

---

## Related Specs

- [Architecture overview](../../../docs/architecture.md)
- [Server spec](../../../packages/workflow-server/docs/typescript-server-workflow-spec.md) — server API the CLI consumes
- [API types spec](../../../packages/workflow-api-types/docs/workflow-api-types-spec.md) — shared transport contracts
- [Workflow-lib spec](../../../packages/workflow-lib/docs/workflow-lib-spec.md) — runtime types
