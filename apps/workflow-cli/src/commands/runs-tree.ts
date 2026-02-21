import type { Command } from 'commander';

import { CliUsageError, type CliDependencies } from '../index.js';
import type { RunTreeNode } from '../http/client.js';

const parseDepth = (raw: string): number => {
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value <= 0) {
    throw new CliUsageError('--depth must be a positive integer');
  }

  return value;
};

const parseBoolean = (raw: string): boolean => {
  const normalized = raw.trim().toLowerCase();
  if (['true', '1', 'yes', 'y'].includes(normalized)) {
    return true;
  }

  if (['false', '0', 'no', 'n'].includes(normalized)) {
    return false;
  }

  throw new CliUsageError('--include-completed-children must be true or false');
};

const renderTree = (node: RunTreeNode, prefix = '', isLast = true): string[] => {
  const branch = prefix.length === 0 ? '' : isLast ? '└─ ' : '├─ ';
  const line = `${prefix}${branch}${node.runId}  ${node.workflowType}  ${node.lifecycle}  ${node.currentState}`;

  const childPrefix = prefix.length === 0 ? '' : `${prefix}${isLast ? '   ' : '│  '}`;

  const childrenLines = node.children.flatMap((child, index) =>
    renderTree(child, childPrefix, index === node.children.length - 1),
  );

  return [line, ...childrenLines];
};

export const registerRunsTreeCommand = (program: Command, deps: CliDependencies): void => {
  const runs =
    program.commands.find((command) => command.name() === 'runs') ?? program.command('runs');
  runs.description('Run operations');

  runs
    .command('tree')
    .description('Inspect run tree for a root run')
    .requiredOption('--run-id <id>', 'Run identifier')
    .option('--depth <n>', 'Maximum tree depth')
    .option(
      '--include-completed-children <bool>',
      'Include completed/failed/cancelled children (true|false)',
    )
    .option('--json', 'Render machine-readable JSON output')
    .action(
      async (options: {
        runId: string;
        depth?: string;
        includeCompletedChildren?: string;
        json?: boolean;
      }) => {
        const depth = typeof options.depth === 'string' ? parseDepth(options.depth) : undefined;
        const includeCompletedChildren =
          typeof options.includeCompletedChildren === 'string'
            ? parseBoolean(options.includeCompletedChildren)
            : undefined;

        const response = await deps.client.inspectRunTree({
          runId: options.runId,
          depth,
          includeCompletedChildren,
        });

        if (options.json) {
          deps.io.writeStdout(JSON.stringify(response));
          return;
        }

        for (const line of renderTree(response.tree)) {
          deps.io.writeStdout(line);
        }
      },
    );
};
