# T27 - Contract Lock Drift Verification

## Depends On
- `T24`
- `T25`

## Objective
Implement automated CI-verifiable contract lock drift tests between the endpoint contract lock table in `docs/typescript-server-workflow-spec.md` Section 6.9.1 and the web spec endpoint matrix in `apps/workflow-web/docs/workflow-web-spec.md` Section 6.2. This ensures method, path, and shared contract names remain exactly synchronized across both documents.

## Fixed Implementation Decisions
- Drift test is a static validation concern, not a runtime behavior test.
- Contract lock comparison is implemented as a vitest test that parses both markdown tables and asserts exact row-level equality.
- Test runs as part of the standard test suite and CI pipeline.
- Comparison covers: HTTP method, path, and shared contract name(s) for each endpoint row.
- Test fails on any drift: added/removed/modified rows in either table without matching update in the other.

## Interface/Schema Contracts
- Section 6.9.1 table format: `| Capability | Method + Path | Shared Contract(s) |`
- Web spec Section 6.2 table format: matches the same logical structure (method, path, contracts).
- Comparison is structural (method + path + contracts), not cosmetic (capability label differences are tolerated).

## Implementation Tasks
- [x] Implement contract lock drift test that parses spec Section 6.9.1 and web spec Section 6.2 tables.
- [x] Assert exact match on method, path, and shared contract names between the two tables.
- [x] Ensure test fails on any drift (added/removed/modified entries).
- [x] Add test to CI pipeline as part of standard test suite.
- [x] Update coverage matrix with new entries.

## Required Artifacts
- `packages/workflow-server/test/integration/contract/contract-lock-drift.spec.ts`

## File Plan (Exact)
### Create
- `packages/workflow-server/test/integration/contract/contract-lock-drift.spec.ts`

### Modify
- `docs/testing/coverage-matrix.md`

## Acceptance Criteria
- Drift test parses both markdown tables correctly.
- Test passes when tables are synchronized.
- Test fails when any row differs between the two tables.
- Test runs in CI and blocks merge on drift.

## Verification
- Command: `pnpm --filter @composable-workflow/workflow-server test:system -- contract-lock-drift`
  - Expected: contract lock drift test passes when spec and web spec tables are synchronized.

## Spec/Behavior Links
- Spec: sections 6.9.1, 6.9.2.
- Behaviors: `B-CONTRACT-004`.
- Integration: `ITX-032`.

## One-to-One Requirement Mapping
| Requirement ID | Implementation Artifact | Verification Assertion |
|---|---|---|
| B-CONTRACT-004 | `test/integration/contract/contract-lock-drift.spec.ts` | Spec Section 6.9.1 and web spec Section 6.2 tables match exactly on method, path, and contract names. |
| ITX-032 | `test/integration/contract/contract-lock-drift.spec.ts` | CI fails on any drift between the two contract lock tables. |
