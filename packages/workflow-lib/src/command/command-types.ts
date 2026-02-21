export interface CommandPolicy {
  allowCommands: string[];
  denyCommands?: string[];
  allowedCwdPrefixes: string[];
  blockedEnvKeys: string[];
  timeoutMsMax: number;
  outputMaxBytes: number;
  redactFields: string[];
}

export interface CommandExecutionRequest {
  command: string;
  args?: string[];
  stdin?: string;
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
  allowNonZeroExit?: boolean;
}

export interface CommandExecutionResult {
  command: string;
  args: string[];
  stdin: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  truncated: boolean;
  redactedFields: string[];
}
