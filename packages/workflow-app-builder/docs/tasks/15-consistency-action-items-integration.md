# SDB-15 - Consistency-Action-Items Integration Path

## Depends On
- `SDB-03`

## Objective
Extend `IntegrateIntoSpec` so the workflow can immediately apply delegated child `actionableItems` using `source: "consistency-action-items"` while preserving existing first-pass and feedback-pass behavior.

## Implementation Tasks
- [x] Add `source: "consistency-action-items"` handling to `IntegrateIntoSpec` input construction.
- [x] Forward `actionableItems` unchanged and in order to the integration prompt/template variables.
- [x] Preserve `specPath` carry-forward and prior accepted decisions for immediate-action passes.
- [x] Update `IntegrateIntoSpec` state tests to cover the new source mode without regressing existing source handling.
- [x] Keep `spec-integration-input.schema.json` / prompt interpolation aligned with the actionable-item contract.
- [x] Ensure `actionableItems` is required only for `source: "consistency-action-items"` and remains optional/absent for the other two source modes.

## Required Artifacts
- `packages/workflow-app-builder/src/workflows/spec-doc/states/integrate-into-spec.ts`
- `packages/workflow-app-builder/src/workflows/spec-doc/contracts.ts`
- `packages/workflow-app-builder/src/workflows/spec-doc/prompt-templates.ts`
- `packages/workflow-app-builder/docs/schemas/spec-doc/spec-integration-input.schema.json`
- `packages/workflow-app-builder/test/workflows/spec-doc/integrate-into-spec.test.ts`

## Acceptance Criteria
- `IntegrateIntoSpec` accepts `source: "consistency-action-items"`.
- `actionableItems` are forwarded unchanged and in child-provided order.
- Immediate-action passes reuse prior `specPath` and do not require numbered answers.
- `actionableItems` is required when `source === "consistency-action-items"` and is absent or ignored for the other source modes.
- Existing `workflow-input` and `numbered-options-feedback` paths continue to behave unchanged.
- Unit tests cover all three input source modes.

## Spec/Behavior Links
- Spec: sections 6.2 (`IntegrateIntoSpec`), 6.5, 7.1, 7.2.1, 10.2 (`AC-2`, `AC-8`).
- Behaviors: `B-SD-INPUT-001`, `B-SD-INPUT-002`, `B-SD-INPUT-003`, `B-SD-INPUT-004`.

## Fixed Implementation Decisions
- `actionableItems` remain ordered integration directives; no local re-sorting is allowed.
- `source` selection remains explicit rather than inferred from ad-hoc field presence.
- Immediate-action passes do not require `answers` and must not fabricate empty normalized-answer records.
- Prompt interpolation continues to be the only place where runtime values enter the hardcoded template.

## Interface/Schema Contracts
- `IntegrateIntoSpecInput.source` supports `"workflow-input" | "numbered-options-feedback" | "consistency-action-items"`.
- `actionableItems` is required when `source === "consistency-action-items"`.
- `{{actionableItemsJson}}` is provided to template `spec-doc.integrate.v1` and preserves array order.
- `spec-integration-input.schema.json` must express the same conditional requirement so runtime validation and task expectations cannot drift.
- Output contract remains `spec-integration-output.schema.json`.

## File Plan (Exact)
### Modify
- `packages/workflow-app-builder/src/workflows/spec-doc/states/integrate-into-spec.ts`
- `packages/workflow-app-builder/src/workflows/spec-doc/contracts.ts`
- `packages/workflow-app-builder/src/workflows/spec-doc/prompt-templates.ts`
- `packages/workflow-app-builder/docs/schemas/spec-doc/spec-integration-input.schema.json`
- `packages/workflow-app-builder/test/workflows/spec-doc/integrate-into-spec.test.ts`

## Verification
- Command: `pnpm --filter @composable-workflow/workflow-app-builder exec vitest run test/workflows/spec-doc/integrate-into-spec.test.ts`
  - Expected: all three `IntegrateIntoSpec` source modes pass with correct contract construction.

## One-to-One Requirement Mapping
| Requirement ID | Implementation Artifact | Verification Assertion |
|---|---|---|
| SD-ACT-001-ImmediateActionSource | `src/workflows/spec-doc/states/integrate-into-spec.ts` | `source: "consistency-action-items"` is accepted and routed through integration input construction. |
| SD-ACT-002-OrderedActionableItemsForwarding | `src/workflows/spec-doc/states/integrate-into-spec.ts` | `actionableItems` are forwarded unchanged and in original order. |
| SD-ACT-003-TemplateActionableItemsInterpolation | `src/workflows/spec-doc/prompt-templates.ts` | `{{actionableItemsJson}}` is included for immediate-action integration passes. |
| SD-ACT-004-ConditionalActionableItemsSchema | `docs/schemas/spec-doc/spec-integration-input.schema.json` | schema requires `actionableItems` only for `source: "consistency-action-items"`. |
| SD-ACT-005-ThreeModeIntegrationCoverage | `test/workflows/spec-doc/integrate-into-spec.test.ts` | tests cover `workflow-input`, `numbered-options-feedback`, and `consistency-action-items`. |
