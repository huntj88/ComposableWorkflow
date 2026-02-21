import type { Command } from 'commander';

import type { CliDependencies } from '../index.js';
import { isTransientError } from '../http/client.js';

const formatEvent = (event: {
  sequence: number;
  timestamp: string;
  eventType: string;
  eventId: string;
}): string =>
  `${event.sequence.toString().padStart(6, '0')}  ${event.timestamp}  ${event.eventType}  ${event.eventId}`;

const delay = async (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export const registerRunsEventsCommand = (program: Command, deps: CliDependencies): void => {
  const runs =
    program.commands.find((command) => command.name() === 'runs') ?? program.command('runs');
  runs.description('Run operations');

  runs
    .command('events')
    .description('List or follow run events')
    .requiredOption('--run-id <id>', 'Run identifier')
    .option('--follow', 'Follow events incrementally via stream endpoint')
    .option('--cursor <cursor>', 'Cursor to resume from')
    .option('--json', 'Render machine-readable JSON output')
    .action(
      async (options: { runId: string; follow?: boolean; cursor?: string; json?: boolean }) => {
        if (options.follow) {
          let cursor = options.cursor;
          const abortController = new AbortController();

          const sigintHandler = (): void => {
            abortController.abort();
          };

          process.on('SIGINT', sigintHandler);

          try {
            while (!abortController.signal.aborted) {
              try {
                for await (const chunk of deps.client.streamRunEvents({
                  runId: options.runId,
                  cursor,
                  signal: abortController.signal,
                })) {
                  if (chunk.cursor) {
                    cursor = chunk.cursor;
                  }

                  if (options.json) {
                    deps.io.writeStdout(JSON.stringify(chunk.event));
                  } else {
                    deps.io.writeStdout(formatEvent(chunk.event));
                  }
                }

                if (!abortController.signal.aborted) {
                  await delay(250);
                }
              } catch (error) {
                if (abortController.signal.aborted) {
                  break;
                }

                if (!isTransientError(error)) {
                  throw error;
                }

                await delay(500);
              }
            }
          } finally {
            process.off('SIGINT', sigintHandler);
          }

          return;
        }

        const response = await deps.client.listRunEvents({
          runId: options.runId,
          cursor: options.cursor,
        });

        if (options.json) {
          deps.io.writeStdout(JSON.stringify(response));
          return;
        }

        for (const event of response.items) {
          deps.io.writeStdout(formatEvent(event));
        }

        if (response.nextCursor) {
          deps.io.writeStdout(`nextCursor=${response.nextCursor}`);
        }
      },
    );
};
