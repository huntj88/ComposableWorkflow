import pino, { type Logger } from 'pino';

export type LogSeverity = 'debug' | 'info' | 'warn' | 'error';

export interface WorkflowLogRecord {
  runId: string;
  workflowType: string;
  eventId: string;
  sequence: number;
  timestamp: string;
  severity: LogSeverity;
  message: string;
  parentRunId?: string;
  state?: string;
  transition?: {
    from?: string;
    to?: string;
    name?: string;
  };
  childRunId?: string;
  command?: string;
  args?: string[];
  stdin?: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  durationMs?: number;
  timeoutMs?: number;
  truncated?: boolean;
  redactedFields?: string[];
}

export interface WorkflowLogger {
  emit(record: WorkflowLogRecord): void;
}

export interface PinoWorkflowLoggerOptions {
  logger?: Logger;
  level?: string;
}

export class PinoWorkflowLogger implements WorkflowLogger {
  constructor(private readonly logger: Logger) {}

  emit(record: WorkflowLogRecord): void {
    this.logger[record.severity](record);
  }
}

export const createPinoWorkflowLogger = (
  options: PinoWorkflowLoggerOptions = {},
): PinoWorkflowLogger => {
  const logger =
    options.logger ??
    pino({
      level: options.level ?? process.env.WORKFLOW_LOG_LEVEL ?? 'info',
      base: undefined,
      timestamp: false,
    });

  return new PinoWorkflowLogger(logger);
};

export class InMemoryWorkflowLogger implements WorkflowLogger {
  readonly records: WorkflowLogRecord[] = [];

  emit(record: WorkflowLogRecord): void {
    this.records.push(record);
  }
}
