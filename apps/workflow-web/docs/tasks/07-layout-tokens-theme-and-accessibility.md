# TWEB07 - Layout Architecture, Tokens/Theme, and Accessibility

## Depends On
- `TWEB01`
- `TWEB02`

## Objective
Implement required `/runs/:runId` information architecture across breakpoints, shared lifecycle/health token consistency, dark-default theme parity, keyboard-only interaction support, and deterministic accessibility announcement/focus rules.

## Fixed Implementation Decisions
- Desktop (`>=1280px`) uses required 3-zone layout; narrower view stacks in required priority order.
- Lifecycle and stream-health visual mappings are shared tokens across all panels.
- Accessibility live-region/focus-return semantics follow normative rules exactly.

## Interface/Schema Contracts
- Lifecycle enum: `WorkflowLifecycle` token mapping.
- Accessibility behavior: polite/assertive announcements + deterministic focus targets.

## Implementation Tasks
- [x] Implement responsive 3-zone architecture and narrow-width stack ordering.
- [x] Centralize lifecycle/health/error tokens and ensure parity across surfaces.
- [x] Implement keyboard-only interaction paths and visible focus indicators.
- [x] Implement aria-live levels and post-action focus-return management.
- [x] Implement dark-default theme with light parity and panel-scoped loading/empty states.

## Required Artifacts
- `apps/workflow-web/src/theme/tokens.ts`
- `apps/workflow-web/src/theme/theme.ts`
- `apps/workflow-web/src/routes/run-detail/layout/RunDashboardLayout.tsx`
- `apps/workflow-web/src/a11y/liveAnnouncements.ts`

## File Plan (Exact)
### Create
- `apps/workflow-web/src/theme/tokens.ts`
- `apps/workflow-web/src/a11y/liveAnnouncements.ts`

### Modify
- `apps/workflow-web/src/theme/theme.ts`
- `apps/workflow-web/src/routes/run-detail/layout/RunDashboardLayout.tsx`

## Acceptance Criteria
- Layout order/architecture follows desktop and narrow requirements.
- Shared tokens and theme rules are consistent and centralized.
- Keyboard and accessibility announcement/focus semantics are deterministic.
- Loading/empty/error states remain panel-scoped with task-oriented copy.

## Verification
- `pnpm --filter @composable-workflow/workflow-web exec vitest run test/integration/accessibility/itx.web.a11y.ITX-WEB-016.spec.ts`
- `pnpm --filter @composable-workflow/workflow-web exec vitest run test/integration/accessibility/itx.web.a11y.ITX-WEB-035.spec.ts`
- `pnpm --filter @composable-workflow/workflow-web exec vitest run test/integration/accessibility/itx.web.a11y.ITX-WEB-042.spec.ts`

## One-to-One Requirement Mapping
| Requirement ID | Primary Artifact | Verification Assertion |
|---|---|---|
| B-WEB-027 | `apps/workflow-web/src/routes/run-detail/layout/RunDashboardLayout.tsx` | Required 3-zone and responsive panel ordering are enforced. |
| B-WEB-028 | `apps/workflow-web/src/theme/tokens.ts` | Lifecycle/stream-health token mappings are consistent across panels. |
| B-WEB-029 | `apps/workflow-web/src/routes/run-detail/layout/RunDashboardLayout.tsx` | Keyboard-only completion paths with visible focus are supported. |
| B-WEB-046 | `apps/workflow-web/src/theme/theme.ts` | Dark-default theme with light parity is implemented. |
| B-WEB-047 | `apps/workflow-web/src/theme/tokens.ts` | Validation/conflict/transport failures have distinct token semantics. |
| B-WEB-048 | `apps/workflow-web/src/a11y/liveAnnouncements.ts` | Critical announcements and panel-scoped empty/loading behavior are implemented. |
| B-WEB-055 | `apps/workflow-web/src/a11y/liveAnnouncements.ts` | Live-region levels and deterministic focus-return targets are enforced. |
