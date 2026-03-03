# TSD01 - Prompt Template Catalog and Delegation Plumbing

## Depends On
- `TSD00`

## Objective
Implement the fixed, versioned prompt-template catalog and one delegation path to `app-builder.copilot.prompt.v1` that always supplies state-specific `outputSchema`.

## Implementation Tasks
- [ ] Add hardcoded prompt template constants for the four delegated states.
- [ ] Implement a single delegation helper that injects template ID, interpolation vars, output schema, and optional input schema.
- [ ] Enforce schema-required delegation calls (no call without `outputSchema`).
- [ ] Forward `copilotPromptOptions` from `SpecDocGenerationInput` (baseArgs, allowedDirs, timeoutMs, cwd) to all copilot delegation calls.
- [ ] Add tests verifying template IDs, interpolation, schema argument propagation, and `copilotPromptOptions` pass-through.

## Required Artifacts
- `packages/workflow-app-builder/src/workflows/spec-doc/prompt-templates.ts`
- `packages/workflow-app-builder/src/workflows/spec-doc/copilot-delegation.ts`
- `packages/workflow-app-builder/test/workflows/spec-doc/prompt-templates.test.ts`
- `packages/workflow-app-builder/test/workflows/spec-doc/copilot-delegation.test.ts`

## Acceptance Criteria
- Prompt template IDs match spec section 7.2 exactly.
- Every delegated call includes the state-appropriate `outputSchema`, and optionally `inputSchema` when required (e.g., `IntegrateIntoSpec`).
- `copilotPromptOptions` from workflow input is forwarded to every copilot delegation call.
- Branching contract requires validated `structuredOutput` from delegation helper.

## Spec/Behavior Links
- Spec: sections 7, 7.1, 7.2.
- Behaviors: `B-SD-COPILOT-001`, `B-SD-COPILOT-003`.

## Fixed Implementation Decisions
- Prompt template strings are code constants, not runtime-configurable in MVP.
- A single delegation helper normalizes child workflow invocation and error wrapping.
- Template IDs are treated as stable versioned observability keys.

## Interface/Schema Contracts
- Template ID union:
  - `spec-doc.integrate.v1`
  - `spec-doc.consistency-check.v1`
  - `spec-doc.classify-custom-prompt.v1`
  - `spec-doc.expand-clarification.v1`.
- Delegation helper input includes `{ templateId, outputSchemaId, inputSchemaId?, variables, state, copilotPromptOptions? }`.

## File Plan (Exact)
### Create
- `packages/workflow-app-builder/src/workflows/spec-doc/prompt-templates.ts`
- `packages/workflow-app-builder/src/workflows/spec-doc/copilot-delegation.ts`
- `packages/workflow-app-builder/test/workflows/spec-doc/prompt-templates.test.ts`
- `packages/workflow-app-builder/test/workflows/spec-doc/copilot-delegation.test.ts`

### Modify
- `packages/workflow-app-builder/src/workflows/copilot-prompt.ts`

## Verification
- Command: `pnpm --filter @composable-workflow/workflow-app-builder test -- prompt-templates`
  - Expected: template IDs/text align with section 7.2 definitions.
- Command: `pnpm --filter @composable-workflow/workflow-app-builder test -- copilot-delegation`
  - Expected: all delegated calls include `outputSchema` and template metadata.

## One-to-One Requirement Mapping
| Requirement ID | Implementation Artifact | Verification Assertion |
|---|---|---|
| SD-Prompt-001-VersionedTemplateCatalog | `src/workflows/spec-doc/prompt-templates.ts` | all four required templates exist with exact versioned IDs. |
| SD-Prompt-002-DelegationOnly | `src/workflows/spec-doc/copilot-delegation.ts` | state handlers call prompt workflow through shared delegation helper only. |
| SD-Prompt-003-OutputSchemaAlwaysProvided | `src/workflows/spec-doc/copilot-delegation.ts` | delegation rejects attempts without `outputSchema`. |
| SD-Prompt-004-StructuredOutputBranching | `test/workflows/spec-doc/copilot-delegation.test.ts` | branching uses validated `structuredOutput`, not free text. |
| SD-Prompt-005-InputSchemaSupport | `src/workflows/spec-doc/copilot-delegation.ts` | delegation helper accepts optional `inputSchemaId` and passes it to copilot child when provided. |
| SD-Prompt-006-CopilotPromptOptionsPassThrough | `src/workflows/spec-doc/copilot-delegation.ts` | `copilotPromptOptions` from workflow input is forwarded to all delegation calls. |
