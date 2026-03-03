import type { Command } from 'commander';

import type { CliDependencies } from '../index.js';

const formatRows = (
  items: Array<{
    feedbackRunId: string;
    status: 'awaiting_response' | 'responded' | 'cancelled';
    questionId: string;
    parentRunId: string;
    requestedAt: string;
  }>,
): string[] => {
  if (items.length === 0) {
    return ['No feedback requests found'];
  }

  const headers = ['FEEDBACK RUN ID', 'STATUS', 'QUESTION ID', 'PARENT RUN ID', 'REQUESTED AT'];
  const rows = items.map((item) => [
    item.feedbackRunId,
    item.status,
    item.questionId,
    item.parentRunId,
    item.requestedAt,
  ]);
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => row[index].length)),
  );

  const formatRow = (columns: string[]): string =>
    columns.map((column, index) => column.padEnd(widths[index])).join('  ');

  return [
    formatRow(headers),
    formatRow(widths.map((width) => '-'.repeat(width))),
    ...rows.map(formatRow),
  ];
};

export const registerFeedbackListCommand = (program: Command, deps: CliDependencies): void => {
  const feedback =
    program.commands.find((command) => command.name() === 'feedback') ??
    program.command('feedback');
  feedback.description('Human feedback operations');

  feedback
    .command('list')
    .description('List human feedback requests')
    .option('--status <status>', 'Status filter (awaiting_response, responded, cancelled)')
    .option('--json', 'Render machine-readable JSON output')
    .action(
      async (options: {
        status?: 'awaiting_response' | 'responded' | 'cancelled';
        json?: boolean;
      }) => {
        const items = await deps.client.listFeedbackRequests({ status: options.status });

        if (options.json) {
          deps.io.writeStdout(JSON.stringify({ items }));
          return;
        }

        for (const line of formatRows(items)) {
          deps.io.writeStdout(line);
        }
      },
    );
};
