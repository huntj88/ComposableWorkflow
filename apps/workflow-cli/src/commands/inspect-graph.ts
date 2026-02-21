import type { Command } from 'commander';

import { CliUsageError, type CliDependencies } from '../index.js';

const formatGraph = (definition: {
  workflowType: string;
  workflowVersion: string;
  states: string[];
  transitions: Array<{ from: string; to: string; name?: string }>;
}): string[] => {
  const lines: string[] = [];
  lines.push(`Workflow: ${definition.workflowType}@${definition.workflowVersion}`);
  lines.push('States:');

  for (const state of definition.states) {
    lines.push(`  - ${state}`);
  }

  lines.push('Graph:');

  if (definition.transitions.length === 0) {
    lines.push('  (no transitions)');
  } else {
    for (const transition of definition.transitions) {
      const name = transition.name ? ` [${transition.name}]` : '';
      lines.push(`  ${transition.from} -> ${transition.to}${name}`);
    }
  }

  return lines;
};

export const registerInspectGraphCommand = (program: Command, deps: CliDependencies): void => {
  program
    .command('inspect')
    .description('Inspect workflow definitions')
    .requiredOption('--type <workflowType>', 'Workflow type')
    .option('--graph', 'Render graph view output')
    .option('--json', 'Render machine-readable JSON output')
    .action(async (options: { type: string; graph?: boolean; json?: boolean }) => {
      if (!options.graph) {
        throw new CliUsageError('inspect requires --graph');
      }

      const definition = await deps.client.inspectDefinition(options.type);
      if (options.json) {
        deps.io.writeStdout(JSON.stringify(definition));
        return;
      }

      for (const line of formatGraph(definition)) {
        deps.io.writeStdout(line);
      }
    });
};
