import path from 'node:path';

export interface CommandPolicy {
  allowCommands: string[];
  denyCommands?: string[];
  allowedCwdPrefixes: string[];
  blockedEnvKeys: string[];
  timeoutMsMax: number;
  outputMaxBytes: number;
  redactFields: string[];
}

export interface CommandRequest {
  command: string;
  args?: string[];
  stdin?: string;
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
  allowNonZeroExit?: boolean;
}

export interface NormalizedCommandRequest {
  command: string;
  args: string[];
  stdin: string;
  cwd: string;
  env: Record<string, string>;
  timeoutMs: number;
  allowNonZeroExit: boolean;
}

export class CommandPolicyError extends Error {
  readonly code:
    | 'command.not-allowed'
    | 'command.denied'
    | 'cwd.not-allowed'
    | 'env.blocked'
    | 'request.invalid';

  constructor(
    code:
      | 'command.not-allowed'
      | 'command.denied'
      | 'cwd.not-allowed'
      | 'env.blocked'
      | 'request.invalid',
    message: string,
  ) {
    super(message);
    this.name = 'CommandPolicyError';
    this.code = code;
  }
}

const normalizeList = (list: string[] | undefined): string[] =>
  (list ?? []).map((item) => item.trim()).filter((item) => item.length > 0);

export const normalizeCommandPolicy = (policy: CommandPolicy): CommandPolicy => {
  const allowCommands = normalizeList(policy.allowCommands);
  const denyCommands = normalizeList(policy.denyCommands);
  const allowedCwdPrefixes = normalizeList(policy.allowedCwdPrefixes).map((prefix) =>
    path.resolve(prefix),
  );
  const blockedEnvKeys = normalizeList(policy.blockedEnvKeys);
  const redactFields = normalizeList(policy.redactFields);

  if (allowCommands.length === 0) {
    throw new Error('Command policy allowCommands must not be empty');
  }

  if (allowedCwdPrefixes.length === 0) {
    throw new Error('Command policy allowedCwdPrefixes must not be empty');
  }

  if (!Number.isFinite(policy.timeoutMsMax) || policy.timeoutMsMax <= 0) {
    throw new Error('Command policy timeoutMsMax must be > 0');
  }

  if (!Number.isFinite(policy.outputMaxBytes) || policy.outputMaxBytes <= 0) {
    throw new Error('Command policy outputMaxBytes must be > 0');
  }

  return {
    allowCommands,
    denyCommands,
    allowedCwdPrefixes,
    blockedEnvKeys,
    timeoutMsMax: Math.floor(policy.timeoutMsMax),
    outputMaxBytes: Math.floor(policy.outputMaxBytes),
    redactFields,
  };
};

export const defaultCommandPolicy = (): CommandPolicy =>
  normalizeCommandPolicy({
    allowCommands: ['node', 'pnpm', 'npm'],
    denyCommands: [],
    allowedCwdPrefixes: [process.cwd()],
    blockedEnvKeys: ['TOKEN', 'SECRET', 'PASSWORD', 'KEY'],
    timeoutMsMax: 30_000,
    outputMaxBytes: 8_192 * 16, // ~128KB
    redactFields: [],
  });

const startsWithPathPrefix = (value: string, prefix: string): boolean => {
  const relative = path.relative(prefix, value);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
};

const assertValidRequestShape = (request: CommandRequest): void => {
  if (typeof request.command !== 'string' || request.command.trim().length === 0) {
    throw new CommandPolicyError('request.invalid', 'Command request must include command');
  }

  if (request.args && !Array.isArray(request.args)) {
    throw new CommandPolicyError('request.invalid', 'Command args must be an array of strings');
  }

  if (request.args?.some((arg) => typeof arg !== 'string')) {
    throw new CommandPolicyError('request.invalid', 'Command args must be an array of strings');
  }

  if (request.env && typeof request.env !== 'object') {
    throw new CommandPolicyError(
      'request.invalid',
      'Command env must be a string map when provided',
    );
  }
};

export const evaluateCommandPolicy = (params: {
  policy: CommandPolicy;
  request: CommandRequest;
}): NormalizedCommandRequest => {
  const policy = normalizeCommandPolicy(params.policy);
  const request = params.request;

  assertValidRequestShape(request);

  const command = request.command.trim();
  const allowedSet = new Set(policy.allowCommands);
  const deniedSet = new Set(policy.denyCommands ?? []);

  if (!allowedSet.has(command)) {
    throw new CommandPolicyError('command.not-allowed', `Command ${command} is not allowed`);
  }

  if (deniedSet.has(command)) {
    throw new CommandPolicyError('command.denied', `Command ${command} is denied`);
  }

  const cwd = path.resolve(request.cwd ?? process.cwd());
  const isCwdAllowed = policy.allowedCwdPrefixes.some((prefix) =>
    startsWithPathPrefix(cwd, prefix),
  );
  if (!isCwdAllowed) {
    throw new CommandPolicyError('cwd.not-allowed', `Command cwd ${cwd} is not allowed`);
  }

  const env = { ...(request.env ?? {}) };
  const blockedKey = Object.keys(env).find((key) =>
    policy.blockedEnvKeys.some((blocked) => key.toUpperCase().includes(blocked.toUpperCase())),
  );
  if (blockedKey) {
    throw new CommandPolicyError('env.blocked', `Command env key ${blockedKey} is blocked`);
  }

  const timeoutMs = Math.min(
    Math.max(1, Math.floor(request.timeoutMs ?? policy.timeoutMsMax)),
    policy.timeoutMsMax,
  );

  return {
    command,
    args: request.args ?? [],
    stdin: request.stdin ?? '',
    cwd,
    env,
    timeoutMs,
    allowNonZeroExit: request.allowNonZeroExit === true,
  };
};
