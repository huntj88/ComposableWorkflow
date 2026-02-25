import { spawn } from 'node:child_process';
import { Readable, Writable } from 'node:stream';

import * as acp from '@agentclientprotocol/sdk';
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
  const timeoutMs = input.timeoutMs ?? 120_000;
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

        const followUpStart = transcriptText.length;
        await connection.prompt({
          sessionId: session.sessionId,
          prompt: [{ type: 'text', text: toSchemaFollowUpPrompt(input.outputSchema) }],
        });

        return {
          sessionId: session.sessionId,
          initialOutputText,
          followUpOutputText: sliceAcpPromptOutput(transcriptText, followUpStart),
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

export const parseStructuredOutput = (raw: string): unknown => JSON.parse(raw.trim());

export const createCopilotAppBuilderDefinition = (): WorkflowDefinition<
  CopilotAppBuilderInput,
  CopilotAppBuilderOutput
> => ({
  initialState: 'start',
  transitions: copilotAppBuilderTransitions,
  states: {
    start: async (ctx) => {
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

      const structuredOutputRaw = result.followUpOutputText?.trim() ?? '';
      let structuredOutput: unknown;
      try {
        structuredOutput = parseStructuredOutput(structuredOutputRaw);
      } catch {
        ctx.fail(
          new Error(
            'Copilot follow-up response for outputSchema was not valid JSON. Ensure schema requests JSON-only output.',
          ),
        );
        return;
      }

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
