import { spawn } from 'node:child_process';

import type { NormalizedCommandRequest } from './command-policy.js';

export interface CommandRunnerResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  timedOut: boolean;
}

export interface CommandRunnerAdapter {
  run: (request: NormalizedCommandRequest) => Promise<CommandRunnerResult>;
}

export type CommandLifecycleOutcome = 'command.completed' | 'command.failed';

export const mapCommandOutcome = (params: {
  exitCode: number;
  timedOut: boolean;
  allowNonZeroExit: boolean;
}): CommandLifecycleOutcome => {
  if (params.timedOut) {
    return 'command.failed';
  }

  if (params.exitCode !== 0 && !params.allowNonZeroExit) {
    return 'command.failed';
  }

  return 'command.completed';
};

export class SpawnCommandRunnerAdapter implements CommandRunnerAdapter {
  async run(request: NormalizedCommandRequest): Promise<CommandRunnerResult> {
    return new Promise<CommandRunnerResult>((resolve, reject) => {
      const startedAtDate = new Date();
      let stdout = '';
      let stderr = '';
      let timedOut = false;
      let settled = false;

      const child = spawn(request.command, request.args, {
        cwd: request.cwd,
        env: {
          ...process.env,
          ...request.env,
        },
        stdio: 'pipe',
      });

      const timeoutHandle = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
        setTimeout(() => {
          if (!child.killed) {
            child.kill('SIGKILL');
          }
        }, 100).unref();
      }, request.timeoutMs);

      child.stdout.on('data', (chunk: Buffer | string) => {
        stdout += chunk.toString();
      });

      child.stderr.on('data', (chunk: Buffer | string) => {
        stderr += chunk.toString();
      });

      child.once('error', (error) => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timeoutHandle);
        reject(error);
      });

      child.once('close', (code, signal) => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timeoutHandle);
        const completedAtDate = new Date();
        const effectiveExitCode =
          typeof code === 'number' ? code : signal === null ? -1 : timedOut ? 124 : 1;

        resolve({
          stdout,
          stderr,
          exitCode: effectiveExitCode,
          startedAt: startedAtDate.toISOString(),
          completedAt: completedAtDate.toISOString(),
          durationMs: completedAtDate.getTime() - startedAtDate.getTime(),
          timedOut,
        });
      });

      child.stdin.write(request.stdin);
      child.stdin.end();
    });
  }
}

export const createSpawnCommandRunnerAdapter = (): CommandRunnerAdapter =>
  new SpawnCommandRunnerAdapter();
