# Human Input Schemas (Server-Owned)

This directory defines server/runtime-owned schemas for human feedback transport contracts.

## Purpose

These schemas are the canonical boundary for:
- request envelopes used by server-provided human-feedback workflows,
- response payload validation for human-feedback submission endpoints,
- deterministic correlation fields (`questionId`) used for replay and diagnostics.

Feature workflow packages (for example `workflow-app-builder`) must consume these contracts and should not re-implement transport-level schema rules.

## Schemas

- `numbered-question-item.schema.json`
  - Transport-level shape for numbered-options questions.
  - Includes `questionId`, `prompt`, `options`, `allowsCustomPrompt`.
  - Does **not** include workflow-specific semantics (for example app-builder `kind` values).

- `numbered-options-response-input.schema.json`
  - Transport-level response payload shape for numbered-options submissions.
  - Includes `questionId`, `selectedOptionIds`, optional `text`.
  - Endpoint/server policy enforces additional runtime checks (for example selected option IDs must exist in offered options).

## Ownership Boundary

Server-owned (this directory):
- feedback transport request/response envelope schemas,
- generic numbered-options question and response payload contracts,
- endpoint-level request validation contracts.

Workflow-owned (package docs/schemas):
- workflow-specific meaning layered on top of transport envelopes,
- state-specific structured outputs unrelated to transport mechanics,
- extension fields that represent domain semantics (for example app-builder question `kind`).

## Extension Pattern

Workflow packages should extend server-owned schemas using JSON Schema composition (`allOf` + `$ref`) rather than copy/paste.

Example pattern:

```json
{
  "allOf": [
    { "$ref": "../../../../../docs/schemas/human-input/numbered-question-item.schema.json" },
    {
      "type": "object",
      "required": ["kind"],
      "properties": {
        "kind": { "type": "string", "enum": ["issue-resolution", "completion-confirmation"] }
      }
    }
  ]
}
```

## Related Spec

Canonical behavior/contract text lives in:
- `docs/typescript-server-workflow-spec.md` (Server-Provided Human Feedback Workflow Contract)
