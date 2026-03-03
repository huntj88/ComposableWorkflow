import type { Command } from 'commander';

import { CliUsageError, type CliDependencies } from '../index.js';

const parseResponse = (
  raw: string,
): { questionId: string; selectedOptionIds?: number[]; text?: string } => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new CliUsageError('--response must be valid JSON');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new CliUsageError('--response must be a JSON object');
  }

  return parsed as { questionId: string; selectedOptionIds?: number[]; text?: string };
};

export const registerFeedbackRespondCommand = (program: Command, deps: CliDependencies): void => {
  const feedback =
    program.commands.find((command) => command.name() === 'feedback') ??
    program.command('feedback');
  feedback.description('Human feedback operations');

  feedback
    .command('respond')
    .description('Submit a human feedback response')
    .requiredOption('--feedback-run-id <id>', 'Feedback run identifier')
    .requiredOption('--response <json>', 'Feedback response payload JSON')
    .requiredOption('--responded-by <id>', 'Responder identifier')
    .option('--json', 'Render machine-readable JSON output')
    .action(
      async (options: {
        feedbackRunId: string;
        response: string;
        respondedBy: string;
        json?: boolean;
      }) => {
        const responsePayload = parseResponse(options.response);
        const result = await deps.client.respondFeedbackRequest({
          feedbackRunId: options.feedbackRunId,
          response: responsePayload,
          respondedBy: options.respondedBy,
        });

        if (options.json) {
          deps.io.writeStdout(JSON.stringify(result));
          return;
        }

        if (result.status === 'accepted') {
          deps.io.writeStdout(`Accepted feedback response for ${result.feedbackRunId}`);
          deps.io.writeStdout(`Accepted at: ${result.acceptedAt}`);
          return;
        }

        deps.io.writeStdout(`Conflict: feedback request already terminal (${result.status})`);
        if (result.respondedAt) {
          deps.io.writeStdout(`Responded at: ${result.respondedAt}`);
        }
        if (result.cancelledAt) {
          deps.io.writeStdout(`Cancelled at: ${result.cancelledAt}`);
        }
      },
    );
};
