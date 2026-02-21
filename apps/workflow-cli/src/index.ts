#!/usr/bin/env node

import { Command, CommanderError } from 'commander';

import { registerInspectGraphCommand } from './commands/inspect-graph.js';
import { registerRunCommand } from './commands/run.js';
import { registerRunsEventsCommand } from './commands/runs-events.js';
import { registerRunsListCommand } from './commands/runs-list.js';
import {
  WorkflowApiError,
  createWorkflowApiClient,
  type WorkflowApiClient,
} from './http/client.js';

export const EXIT_CODE_SUCCESS = 0;
export const EXIT_CODE_USAGE = 2;
export const EXIT_CODE_RUNTIME = 3;

export interface CliIo {
  writeStdout: (line: string) => void;
  writeStderr: (line: string) => void;
}

export interface CliDependencies {
  client: WorkflowApiClient;
  io: CliIo;
}

export class CliUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CliUsageError';
  }
}

const defaultIo: CliIo = {
  writeStdout: (line) => {
    process.stdout.write(`${line}\n`);
  },
  writeStderr: (line) => {
    process.stderr.write(`${line}\n`);
  },
};

const createDefaultDependencies = (): CliDependencies => ({
  client: createWorkflowApiClient({
    baseUrl: process.env.WORKFLOW_API_BASE_URL ?? 'http://127.0.0.1:3000',
  }),
  io: defaultIo,
});

export const createProgram = (deps: CliDependencies): Command => {
  const program = new Command();
  program.name('workflow').description('Composable Workflow operator CLI');
  program.showHelpAfterError();

  registerRunCommand(program, deps);
  registerRunsListCommand(program, deps);
  registerRunsEventsCommand(program, deps);
  registerInspectGraphCommand(program, deps);

  return program;
};

export const executeCli = async (argv: string[], deps: CliDependencies): Promise<number> => {
  const program = createProgram(deps);

  program.exitOverride();

  try {
    await program.parseAsync(argv);
    return EXIT_CODE_SUCCESS;
  } catch (error) {
    if (error instanceof CommanderError) {
      deps.io.writeStderr(error.message);
      return EXIT_CODE_USAGE;
    }

    if (error instanceof CliUsageError) {
      deps.io.writeStderr(error.message);
      return EXIT_CODE_USAGE;
    }

    if (error instanceof WorkflowApiError) {
      deps.io.writeStderr(
        `API error (${error.statusCode}${error.code ? ` ${error.code}` : ''}): ${error.message}`,
      );
      return EXIT_CODE_RUNTIME;
    }

    const message = error instanceof Error ? error.message : 'Unexpected error';
    deps.io.writeStderr(message);
    return EXIT_CODE_RUNTIME;
  }
};

export const run = async (argv: string[] = process.argv): Promise<number> => {
  const deps = createDefaultDependencies();
  return executeCli(argv, deps);
};

if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  const exitCode = await run(process.argv);
  process.exitCode = exitCode;
}
