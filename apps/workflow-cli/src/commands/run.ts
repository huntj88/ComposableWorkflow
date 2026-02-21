import type { Command } from 'commander';

import { CliUsageError, type CliDependencies } from '../index.js';

const parseJsonInput = (rawInput: string): unknown => {
  try {
    return JSON.parse(rawInput) as unknown;
  } catch {
    throw new CliUsageError('--input must be valid JSON');
  }
};

const toRunJsonOutput = (summary: {
  runId: string;
  workflowType: string;
  workflowVersion: string;
  lifecycle: string;
  startedAt: string;
}) => ({
  runId: summary.runId,
  workflowType: summary.workflowType,
  workflowVersion: summary.workflowVersion,
  lifecycle: summary.lifecycle,
  startedAt: summary.startedAt,
});

export const registerRunCommand = (program: Command, deps: CliDependencies): void => {
  program
    .command('run')
    .description('Start a workflow run')
    .requiredOption('--type <workflowType>', 'Workflow type to start')
    .requiredOption('--input <json>', 'JSON payload for workflow input')
    .option('--idempotency-key <key>', 'Optional idempotency key')
    .option('--json', 'Render machine-readable JSON output')
    .action(
      async (options: { type: string; input: string; idempotencyKey?: string; json?: boolean }) => {
        const input = parseJsonInput(options.input);
        const summary = await deps.client.startWorkflow({
          workflowType: options.type,
          input,
          idempotencyKey: options.idempotencyKey,
        });

        if (options.json) {
          deps.io.writeStdout(JSON.stringify(toRunJsonOutput(summary)));
          return;
        }

        deps.io.writeStdout(`Run started: ${summary.runId}`);
        deps.io.writeStdout(`Workflow: ${summary.workflowType}@${summary.workflowVersion}`);
        deps.io.writeStdout(`Lifecycle: ${summary.lifecycle}`);
        deps.io.writeStdout(`Started: ${summary.startedAt}`);
      },
    );
};
