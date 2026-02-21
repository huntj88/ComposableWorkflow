import type { Command } from 'commander';

import type { CliDependencies } from '../index.js';

const formatRows = (
  items: Array<{ runId: string; workflowType: string; lifecycle: string; startedAt: string }>,
): string[] => {
  if (items.length === 0) {
    return ['No runs found'];
  }

  const headers = ['RUN ID', 'WORKFLOW', 'LIFECYCLE', 'STARTED AT'];
  const rows = items.map((item) => [item.runId, item.workflowType, item.lifecycle, item.startedAt]);
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

export const registerRunsListCommand = (program: Command, deps: CliDependencies): void => {
  const runs =
    program.commands.find((command) => command.name() === 'runs') ?? program.command('runs');
  runs.description('Run operations');

  runs
    .command('list')
    .description('List workflow runs')
    .option('--lifecycle <state>', 'Lifecycle filter; accepts comma-separated values')
    .option('--workflow-type <type>', 'Workflow type filter; accepts comma-separated values')
    .option('--json', 'Render machine-readable JSON output')
    .action(async (options: { lifecycle?: string; workflowType?: string; json?: boolean }) => {
      const items = await deps.client.listRuns({
        lifecycle: options.lifecycle,
        workflowType: options.workflowType,
      });

      if (options.json) {
        deps.io.writeStdout(JSON.stringify({ items }));
        return;
      }

      for (const line of formatRows(items)) {
        deps.io.writeStdout(line);
      }
    });
};
