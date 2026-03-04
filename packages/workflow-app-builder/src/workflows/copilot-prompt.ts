import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { Readable, Writable } from 'node:stream';

import * as acp from '@agentclientprotocol/sdk';
import { Ajv2020 } from 'ajv/dist/2020.js';
import type {
  WorkflowDefinition,
  WorkflowRegistration,
  WorkflowTransitionDescriptor,
} from '@composable-workflow/workflow-lib/contracts';

export const COPILOT_APP_BUILDER_WORKFLOW_TYPE = 'app-builder.copilot.prompt.v1';

export interface CopilotAppBuilderInput {
  prompt: string;
  /**
   * Additional Copilot CLI arguments inserted before `-p <prompt>`.
   *
   * For the complete list of currently supported CLI arguments, see
   * `packages/workflow-app-builder/README.md`.
   */
  baseArgs?: string[];
  /**
   * Optional directory where Copilot CLI should write its internal logs.
   */
  logDir?: string;
  /**
   * Optional additional directories to trust/allow via repeated `--add-dir`.
   */
  allowedDirs?: string[];
  /**
   * Optional JSON template/schema prompt used to request structured output from
   * the same Copilot session via a follow-up `--resume <sessionId>` command.
   */
  outputSchema?: string;
  timeoutMs?: number;
  cwd?: string;
}

export interface CopilotAppBuilderOutput {
  status: 'completed';
  prompt: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  sessionId?: string;
  structuredOutputRaw?: string;
  structuredOutput?: unknown;
}

export const copilotAppBuilderTransitions: WorkflowTransitionDescriptor[] = [
  { from: 'start', to: 'finalize', name: 'copilot-command-finished' },
];

export const toCopilotAcpLaunchArgs = (input: CopilotAppBuilderInput): string[] => [
  '--acp',
  '--stdio',
  ...(input.baseArgs ?? ['--allow-all-tools', '--no-color']),
  ...(input.logDir ? ['--log-dir', input.logDir] : []),
  ...(input.allowedDirs?.flatMap((dir) => ['--add-dir', dir]) ?? []),
];

const selectPermissionOptionId = (request: acp.RequestPermissionRequest): string | undefined => {
  const preferredKinds: acp.PermissionOptionKind[] = ['allow_always', 'allow_once'];

  for (const kind of preferredKinds) {
    const option = request.options.find((item) => item.kind === kind);
    if (option) {
      return option.optionId;
    }
  }

  return undefined;
};

const buildPermissionResponse = (
  request: acp.RequestPermissionRequest,
): acp.RequestPermissionResponse => {
  const selectedOptionId = selectPermissionOptionId(request);
  if (!selectedOptionId) {
    return {
      outcome: {
        outcome: 'cancelled',
      },
    };
  }

  return {
    outcome: {
      outcome: 'selected',
      optionId: selectedOptionId,
    },
  };
};

const extractTextChunk = (notification: acp.SessionNotification): string | undefined => {
  const update = notification.update;
  if (update.sessionUpdate !== 'agent_message_chunk') {
    return undefined;
  }

  if (update.content.type !== 'text') {
    return undefined;
  }

  return update.content.text;
};

export const appendAcpNotificationChunk = (
  transcript: string,
  notification: acp.SessionNotification,
): string => {
  const chunk = extractTextChunk(notification);
  if (!chunk) {
    return transcript;
  }

  return `${transcript}${chunk}`;
};

export const sliceAcpPromptOutput = (transcript: string, startOffset: number): string =>
  transcript.slice(startOffset).trim();

interface AcpExecutionResult {
  sessionId: string;
  initialOutputText: string;
  followUpOutputText?: string;
  structuredOutput?: unknown;
  structuredOutputRaw?: string;
  stderr: string;
}

const executeWithCopilotAcp = async (
  input: CopilotAppBuilderInput,
): Promise<AcpExecutionResult> => {
  const child = spawn('copilot', toCopilotAcpLaunchArgs(input), {
    cwd: input.cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const stderrChunks: string[] = [];
  child.stderr.on('data', (chunk: Buffer | string) => {
    stderrChunks.push(chunk.toString());
  });

  if (!child.stdin || !child.stdout) {
    throw new Error('Failed to start Copilot ACP process with piped stdin/stdout');
  }

  const output = Writable.toWeb(child.stdin) as WritableStream<Uint8Array>;
  const inputStream = Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>;
  const stream = acp.ndJsonStream(output, inputStream);

  let transcriptText = '';

  const client: acp.Client = {
    async requestPermission(params) {
      return buildPermissionResponse(params);
    },
    async sessionUpdate(params) {
      transcriptText = appendAcpNotificationChunk(transcriptText, params);
    },
  };

  const connection = new acp.ClientSideConnection((_agent) => client, stream);
  const timeoutMs = input.timeoutMs ?? 1_200_000;
  let timedOut = false;

  const terminateProcess = async (): Promise<void> => {
    if (!child.killed) {
      child.stdin.end();
      child.kill('SIGTERM');
    }

    await new Promise<void>((resolve) => {
      child.once('exit', () => resolve());
      setTimeout(() => resolve(), 2_000);
    });
  };

  const withTimeout = async <T>(promise: Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        timedOut = true;
        void terminateProcess().finally(() => {
          reject(new Error(`Copilot ACP execution timed out after ${timeoutMs}ms`));
        });
      }, timeoutMs);

      promise.then(
        (value) => {
          clearTimeout(timeoutHandle);
          resolve(value);
        },
        (error: unknown) => {
          clearTimeout(timeoutHandle);
          reject(error);
        },
      );
    });

  try {
    return await withTimeout(
      (async () => {
        await connection.initialize({
          protocolVersion: acp.PROTOCOL_VERSION,
          clientCapabilities: {},
        });

        const session = await connection.newSession({
          cwd: input.cwd ?? process.cwd(),
          mcpServers: [],
        });

        const initialStart = transcriptText.length;
        await connection.prompt({
          sessionId: session.sessionId,
          prompt: [{ type: 'text', text: input.prompt }],
        });
        const initialOutputText = sliceAcpPromptOutput(transcriptText, initialStart);

        if (!input.outputSchema) {
          return {
            sessionId: session.sessionId,
            initialOutputText,
            stderr: stderrChunks.join(''),
          };
        }

        // Schema follow-up with in-session retry on validation failure
        let lastFollowUpOutput = '';
        for (let attempt = 0; attempt <= MAX_SCHEMA_RETRIES; attempt++) {
          const followUpStart = transcriptText.length;
          const followUpPrompt =
            attempt === 0
              ? toSchemaFollowUpPrompt(input.outputSchema)
              : toSchemaRetryPrompt(input.outputSchema, lastFollowUpOutput);
          await connection.prompt({
            sessionId: session.sessionId,
            prompt: [{ type: 'text', text: followUpPrompt }],
          });
          lastFollowUpOutput = sliceAcpPromptOutput(transcriptText, followUpStart);

          const raw = lastFollowUpOutput.trim();
          let parsed: unknown;
          try {
            parsed = parseStructuredOutput(raw);
          } catch {
            // Not valid JSON — retry within this session
            if (attempt < MAX_SCHEMA_RETRIES) continue;
            return {
              sessionId: session.sessionId,
              initialOutputText,
              followUpOutputText: lastFollowUpOutput,
              stderr: stderrChunks.join(''),
            };
          }

          const validationError = validateAgainstOutputSchema(parsed, input.outputSchema);
          if (validationError) {
            // Schema invalid — retry within this session
            if (attempt < MAX_SCHEMA_RETRIES) continue;
            return {
              sessionId: session.sessionId,
              initialOutputText,
              followUpOutputText: lastFollowUpOutput,
              stderr: stderrChunks.join(''),
            };
          }

          // Valid — return early with parsed output
          return {
            sessionId: session.sessionId,
            initialOutputText,
            followUpOutputText: raw,
            structuredOutput: parsed,
            structuredOutputRaw: raw,
            stderr: stderrChunks.join(''),
          };
        }

        // Fallback (should not be reached)
        return {
          sessionId: session.sessionId,
          initialOutputText,
          followUpOutputText: lastFollowUpOutput,
          stderr: stderrChunks.join(''),
        };
      })(),
    );
  } finally {
    if (!timedOut) {
      await terminateProcess();
    }
  }
};

export const toSchemaFollowUpPrompt = (schema: string): string =>
  [
    'Use the work completed earlier in this Copilot session to fill this output template.',
    'Return only valid JSON and no markdown code fences.',
    schema,
  ].join('\n\n');

export const toSchemaRetryPrompt = (schema: string, previousOutput: string): string =>
  [
    'Your previous JSON response was invalid. Here is what you returned:',
    '```',
    previousOutput,
    '```',
    'Fix the output so it conforms exactly to the required JSON schema. Return only valid JSON and no markdown code fences.',
    schema,
  ].join('\n\n');

export const parseStructuredOutput = (raw: string): unknown => JSON.parse(raw.trim());

// ---------------------------------------------------------------------------
// Schema validation for retry logic
// ---------------------------------------------------------------------------

const MAX_SCHEMA_RETRIES = 2;

/**
 * Validate `structuredOutput` against the provided `outputSchema` JSON string.
 * Returns `null` when valid, or an error message string when invalid.
 */
function validateAgainstOutputSchema(
  structuredOutput: unknown,
  outputSchemaJson: string,
): string | null {
  let schema: Record<string, unknown>;
  try {
    schema = JSON.parse(outputSchemaJson) as Record<string, unknown>;
  } catch {
    // Cannot parse schema — skip validation (don't block on bad schema input)
    return null;
  }

  try {
    const ajv = new Ajv2020({ strict: false, allErrors: true });
    const validate = ajv.compile(schema);
    const valid = validate(structuredOutput);
    if (valid) return null;

    return ajv.errorsText(validate.errors, { separator: '; ', dataVar: 'data' });
  } catch {
    // Schema compilation error — skip validation
    return null;
  }
}

// ---------------------------------------------------------------------------
// Fixture mode for deterministic E2E testing
// ---------------------------------------------------------------------------

const COPILOT_FIXTURE_DIR = process.env.COPILOT_FIXTURE_DIR;

/** Per-(fixtureDir, schemaKey) FIFO counter for sequenced fixture responses. */
const fixtureCounters = new Map<string, number>();

/**
 * Extract a fixture key from the outputSchema JSON string by parsing the `$id`
 * field. Falls back to `'default'` if no `$id` is found.
 *
 * Example `$id`:
 *   `https://composable-workflow.local/schemas/app-builder/spec-doc/spec-integration-output.schema.json`
 * Extracted key: `spec-integration-output`
 */
export function extractFixtureKey(outputSchema: string | undefined): string {
  if (!outputSchema) return 'default';
  try {
    const schema = JSON.parse(outputSchema) as { $id?: string };
    if (schema.$id) {
      const basename = schema.$id.split('/').pop() ?? '';
      return basename.replace(/\.schema\.json$/, '') || 'default';
    }
  } catch {
    /* ignore parse errors */
  }
  return 'default';
}

interface FixtureEntry {
  __fixture_fail?: boolean;
  message?: string;
  [key: string]: unknown;
}

/**
 * Load the next fixture response for the given schema key from `fixtureDir`.
 * Supports two file layouts:
 *   1. Sequenced: `<key>.0.json`, `<key>.1.json`, … — one response per file.
 *   2. Array: `<key>.json` containing a JSON array of responses.
 *
 * When the counter exceeds available sequenced files the counter automatically
 * wraps back to 0 so that subsequent workflow runs against the same fixture
 * directory reuse the fixtures without requiring an explicit reset.
 *
 * Returns the parsed fixture object (used as `structuredOutput`).
 * Throws if no fixture file is found at all for the given key.
 */
export function loadNextFixture(fixtureDir: string, schemaKey: string): FixtureEntry {
  const counterKey = `${fixtureDir}::${schemaKey}`;
  const counter = fixtureCounters.get(counterKey) ?? 0;
  fixtureCounters.set(counterKey, counter + 1);

  // Try sequenced file first: <key>.<counter>.json
  const seqPath = path.join(fixtureDir, `${schemaKey}.${counter}.json`);
  if (existsSync(seqPath)) {
    return JSON.parse(readFileSync(seqPath, 'utf-8')) as FixtureEntry;
  }

  // Counter exceeded available sequenced files — wrap back to 0 and retry.
  if (counter > 0) {
    const zeroPath = path.join(fixtureDir, `${schemaKey}.0.json`);
    if (existsSync(zeroPath)) {
      fixtureCounters.set(counterKey, 0);
      return loadNextFixture(fixtureDir, schemaKey);
    }
  }

  // Fall back to array file: <key>.json
  const arrayPath = path.join(fixtureDir, `${schemaKey}.json`);
  if (existsSync(arrayPath)) {
    const content = JSON.parse(readFileSync(arrayPath, 'utf-8')) as FixtureEntry | FixtureEntry[];
    if (Array.isArray(content)) {
      if (counter < content.length) return content[counter];
      return content[content.length - 1]; // clamp to last entry
    }
    return content; // single object, always returned
  }

  throw new Error(
    `[copilot-fixture] No fixture found for key "${schemaKey}" at index ${counter} in ${fixtureDir}`,
  );
}

/** Reset all fixture counters (used in tests). */
export function resetFixtureCounters(): void {
  fixtureCounters.clear();
}

export const createCopilotAppBuilderDefinition = (): WorkflowDefinition<
  CopilotAppBuilderInput,
  CopilotAppBuilderOutput
> => ({
  initialState: 'start',
  transitions: copilotAppBuilderTransitions,
  states: {
    start: async (ctx) => {
      // ---- Fixture mode ----
      if (COPILOT_FIXTURE_DIR) {
        const fixtureDir = ctx.input.cwd ?? COPILOT_FIXTURE_DIR;
        const schemaKey = extractFixtureKey(ctx.input.outputSchema);
        const fixture = loadNextFixture(fixtureDir, schemaKey);

        if (fixture.__fixture_fail) {
          ctx.fail(
            new Error(fixture.message ?? `[copilot-fixture] Simulated failure for ${schemaKey}`),
          );
          return;
        }

        const structuredOutputRaw = JSON.stringify(fixture);
        ctx.transition('finalize', {
          stdout: `[copilot-fixture] Loaded fixture for ${schemaKey}`,
          stderr: '',
          exitCode: 0,
          sessionId: `fixture-${schemaKey}`,
          structuredOutputRaw,
          structuredOutput: fixture,
        });
        return;
      }

      // ---- Normal execution ----
      const result = await executeWithCopilotAcp(ctx.input);

      if (!ctx.input.outputSchema) {
        ctx.transition('finalize', {
          stdout: result.initialOutputText,
          stderr: result.stderr,
          exitCode: 0,
          sessionId: result.sessionId,
        });
        return;
      }

      // If executeWithCopilotAcp already validated & parsed, use that directly
      if (result.structuredOutput !== undefined) {
        ctx.transition('finalize', {
          stdout: result.initialOutputText,
          stderr: result.stderr,
          exitCode: 0,
          sessionId: result.sessionId,
          structuredOutputRaw: result.structuredOutputRaw,
          structuredOutput: result.structuredOutput,
        });
        return;
      }

      // All in-session retries exhausted — report the final failure
      const structuredOutputRaw = result.followUpOutputText?.trim() ?? '';
      let structuredOutput: unknown;
      try {
        structuredOutput = parseStructuredOutput(structuredOutputRaw);
      } catch {
        ctx.fail(
          new Error(
            `Copilot follow-up response for outputSchema was not valid JSON after ${MAX_SCHEMA_RETRIES + 1} attempts. Ensure schema requests JSON-only output.`,
          ),
        );
        return;
      }

      const validationError = validateAgainstOutputSchema(structuredOutput, ctx.input.outputSchema);
      if (validationError) {
        ctx.fail(
          new Error(
            `Copilot structured output failed schema validation after ${MAX_SCHEMA_RETRIES + 1} attempts: ${validationError}`,
          ),
        );
        return;
      }

      // Should not reach here, but handle gracefully
      ctx.transition('finalize', {
        stdout: result.initialOutputText,
        stderr: result.stderr,
        exitCode: 0,
        sessionId: result.sessionId,
        structuredOutputRaw,
        structuredOutput,
      });
    },
    finalize: (ctx, data) => {
      const result = data as
        | {
            stdout?: string;
            stderr?: string;
            exitCode?: number;
          }
        | undefined;
      const sessionId = (data as { sessionId?: string } | undefined)?.sessionId;
      const structuredOutputRaw = (data as { structuredOutputRaw?: string } | undefined)
        ?.structuredOutputRaw;
      const structuredOutput = (data as { structuredOutput?: unknown } | undefined)
        ?.structuredOutput;

      ctx.complete({
        status: 'completed',
        prompt: ctx.input.prompt,
        exitCode: result?.exitCode ?? -1,
        stdout: result?.stdout ?? '',
        stderr: result?.stderr ?? '',
        sessionId,
        structuredOutputRaw,
        structuredOutput,
      });
    },
  },
});

export const copilotAppBuilderWorkflowRegistration: WorkflowRegistration<
  CopilotAppBuilderInput,
  CopilotAppBuilderOutput
> = {
  workflowType: COPILOT_APP_BUILDER_WORKFLOW_TYPE,
  workflowVersion: '1.0.0',
  metadata: {
    displayName: 'Copilot App Builder Workflow',
    description: 'Runs Copilot CLI with a prompt provided in workflow input.',
    tags: ['app-builder', 'copilot', 'command'],
  },
  factory: () => createCopilotAppBuilderDefinition(),
};
