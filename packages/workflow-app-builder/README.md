# workflow-app-builder

Workflow package that provides `app-builder.copilot.prompt.v1`, which runs GitHub Copilot CLI with a prompt.

## Workflow input

- `prompt: string`
- `baseArgs?: string[]` — Copilot CLI options inserted after `--acp --stdio`
- `logDir?: string` — optional `--log-dir` path for Copilot internal logs
- `allowedDirs?: string[]` — optional directories passed as repeated `--add-dir <path>`
- `outputSchema?: string` — optional JSON template/schema for an ACP follow-up prompt in the same session
- `timeoutMs?: number`
- `cwd?: string`

## Workflow output

- `status: 'completed'`
- `prompt: string`
- `exitCode: number`
- `stdout: string` — primary prompt stdout
- `stderr: string` — primary prompt stderr
- `sessionId?: string` — ACP session ID returned by `session/new`
- `structuredOutputRaw?: string` — raw text from schema follow-up ACP prompt
- `structuredOutput?: unknown` — parsed JSON value from `structuredOutputRaw`

Default invocation shape:

```bash
copilot --acp --stdio --allow-all-tools --no-color
```

## Copilot CLI arguments you can pass in `baseArgs`

The following are the currently supported top-level options from local `copilot --help`.

### General / mode

- `--acp` — Start as Agent Client Protocol server.
- `-h, --help` — Display help for command.
- `-v, --version` — Show version information.
- `-i, --interactive <prompt>` — Start interactive mode and automatically execute this prompt.
- `-p, --prompt <text>` — Execute a prompt in non-interactive mode (exits after completion).
- `--continue` — Resume the most recent session.
- `--resume [sessionId]` — Resume from a previous session (optionally by ID).

### Permissions / safety

- `--allow-all` — Equivalent to `--allow-all-tools --allow-all-paths --allow-all-urls`.
- `--yolo` — Equivalent to `--allow-all-tools --allow-all-paths --allow-all-urls`.
- `--allow-all-tools` — Auto-allow all tools (required for non-interactive mode).
- `--allow-all-paths` — Disable path verification.
- `--allow-all-urls` — Allow all URLs.
- `--allow-tool [tools...]` — Allow specific tools.
- `--deny-tool [tools...]` — Deny specific tools.
- `--allow-url [urls...]` — Allow specific URLs/domains.
- `--deny-url [urls...]` — Deny specific URLs/domains.
- `--disallow-temp-dir` — Prevent automatic access to temp directory.
- `--no-ask-user` — Disable `ask_user` tool interaction.

### MCP / tool configuration

- `--add-github-mcp-tool <tool>` — Add a GitHub MCP tool (`*` for all).
- `--add-github-mcp-toolset <toolset>` — Add a GitHub MCP toolset (`all` for all toolsets).
- `--enable-all-github-mcp-tools` — Enable all GitHub MCP tools.
- `--disable-builtin-mcps` — Disable all built-in MCP servers.
- `--disable-mcp-server <server-name>` — Disable a specific MCP server.
- `--additional-mcp-config <json>` — Add extra MCP config (JSON string or `@file`).
- `--available-tools [tools...]` — Restrict tools available to the model.
- `--excluded-tools [tools...]` — Exclude listed tools from availability.

### Autopilot / execution behavior

- `--autopilot` — Enable autopilot continuation in prompt mode.
- `--max-autopilot-continues <count>` — Cap autopilot continuation messages.
- `--disable-parallel-tools-execution` — Execute tool calls sequentially.

### UX / output

- `--no-color` — Disable all color output.
- `--stream <mode>` — Enable/disable streaming (`on`|`off`).
- `-s, --silent` — Output only response text (no stats).
- `--screen-reader` — Enable screen reader optimizations.
- `--banner` — Show startup banner.
- `--alt-screen [value]` — Alternate screen buffer (`on`|`off`).
- `--no-alt-screen` — Disable alternate screen buffer.
- `--plain-diff` — Disable rich diff rendering.
- `--share [path]` — Export session to markdown after non-interactive completion.
- `--share-gist` — Export session to secret gist after non-interactive completion.

### Model / agent selection

- `--model <model>` — Select model.
- `--agent <agent>` — Select custom agent.

### Configuration / runtime

- `--config-dir <directory>` — Set config directory.
- `--log-dir <directory>` — Set logs directory.
- `--log-level <level>` — Set log level (`none|error|warning|info|debug|all|default`).
- `--no-auto-update` — Disable automatic CLI updates.
- `--experimental` — Enable experimental features.
- `--no-experimental` — Disable experimental features.
- `--bash-env [value]` — Enable BASH_ENV support (`on|off`).
- `--no-bash-env` — Disable BASH_ENV support.
- `--add-dir <directory>` — Add trusted/allowed file-access directory.
- `--no-custom-instructions` — Disable loading instructions from AGENTS.md and related files.

## Copilot CLI commands

- `login [options]` — Authenticate with OAuth device flow.
- `help [topic]` — Display help information.
- `init` — Initialize Copilot instructions for this repository.
- `update` — Download latest version.
- `version` — Show version and update check.
- `plugin` — Manage plugins and plugin marketplaces.

## Notes for this workflow

- `baseArgs` is inserted after `--acp --stdio`.
- If `logDir` is provided, the workflow appends `--log-dir <path>`.
- If `allowedDirs` is provided, each entry is appended as `--add-dir <path>`.
- If `outputSchema` is provided, a second ACP prompt runs in the same ACP session using the session ID from `session/new`.
- The follow-up prompt must return JSON; otherwise the workflow fails.
- If your server uses default policy, `copilot` is allowed by default in this repository.

For app-builder spec generation workflows, the preferred schema/output contract is a markdown file path reference (for example `specPath`) rather than embedding full markdown bodies in schema-validated JSON.
