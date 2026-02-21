# Composable Workflow

Monorepo baseline for a TypeScript 5.x + Node.js 22 workflow platform using `pnpm` workspaces.

## Prerequisites

- Node.js 22 LTS
- pnpm 9+
- Docker + Docker Compose v2
- Git

Linux/macOS quick install references:

- Node 22 + pnpm: use `nvm`/`asdf` + `corepack enable`
- Docker: Docker Engine (Linux) or Docker Desktop (macOS)

## One-command setup

```bash
corepack enable && pnpm install && docker compose up -d postgres
```

## Environment

Copy the template and adjust as needed:

```bash
cp .env.example .env
```

Required baseline variables:

- `DATABASE_URL=postgresql://workflow:workflow@localhost:5432/workflow`
- `WORKFLOW_SERVER_PORT=3000`

### Workflow package loader configuration

`workflow-server` supports dynamic package loading from `path`, `pnpm`, or `bundle` sources.

- `WORKFLOW_PACKAGE_SOURCES` (JSON array):

```bash
export WORKFLOW_PACKAGE_SOURCES='[
	{"source":"path","value":"./packages/workflow-package-reference/dist/index.js"},
	{"source":"pnpm","value":"@composable-workflow/workflow-package-reference"},
	{"source":"bundle","value":"file:///opt/workflows/reference.mjs"}
]'
```

- `WORKFLOW_TYPE_COLLISION_POLICY` controls duplicate `workflowType` handling:
  - default: `reject`
  - override mode: `override`

```bash
export WORKFLOW_TYPE_COLLISION_POLICY=override
```

Run loader startup diagnostics:

```bash
pnpm --filter @composable-workflow/workflow-server start:test
```

Expected startup diagnostic log events include:

- `Loaded workflow package` (package/version/workflow types/source)
- `Rejected workflow package` (source + explicit reason, including schema validation or collision envelope)
- `Workflow package load summary` (loaded count + rejected count)

## Workspace scripts

- `pnpm build` - builds all workspaces.
- `pnpm test` - runs all non-e2e tests.
- `pnpm lint` - lints all workspaces.
- `pnpm format:check` - checks formatting with Prettier.
- `pnpm format` - writes formatting changes.

## Pre-commit quality gates

Pre-commit checks are mandatory and run:

1. `pnpm lint`
2. `pnpm test`
3. `pnpm format:check`

Bypassing hooks is disallowed by repository policy.

## Local Postgres

Start database:

```bash
docker compose up -d postgres
docker compose ps
```

Stop database:

```bash
docker compose down
```
