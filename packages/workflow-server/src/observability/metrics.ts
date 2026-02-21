import { metrics, ValueType, type Meter } from '@opentelemetry/api';

import type { WorkflowMetric } from '@composable-workflow/workflow-lib/contracts';

export interface RecordedMetric {
  name: string;
  value: number;
  unit?: string;
  tags: Record<string, string>;
  timestamp: string;
}

export interface WorkflowMetrics {
  emit(metric: WorkflowMetric): void;
}

const METRIC_TAG_KEYS = ['workflowType', 'lifecycle', 'transition', 'command', 'outcome'] as const;

const sanitizeDimension = (value: string | undefined): string => {
  if (!value || value.length === 0) {
    return 'none';
  }

  return value.slice(0, 64);
};

const normalizeTags = (tags: Record<string, string> | undefined): Record<string, string> => {
  const normalized: Record<string, string> = {};

  for (const key of METRIC_TAG_KEYS) {
    normalized[key] = sanitizeDimension(tags?.[key]);
  }

  return normalized;
};

export class OTelWorkflowMetrics implements WorkflowMetrics {
  private readonly counters = new Map<string, ReturnType<Meter['createCounter']>>();

  constructor(private readonly meter: Meter) {}

  emit(metric: WorkflowMetric): void {
    const tags = normalizeTags(metric.tags);
    const counter = this.getOrCreateCounter(metric.name, metric.unit);
    counter.add(metric.value, tags);
  }

  private getOrCreateCounter(
    name: string,
    unit: string | undefined,
  ): ReturnType<Meter['createCounter']> {
    const existing = this.counters.get(name);
    if (existing) {
      return existing;
    }

    const created = this.meter.createCounter(name, {
      unit,
      valueType: ValueType.INT,
    });
    this.counters.set(name, created);
    return created;
  }
}

export class InMemoryWorkflowMetrics implements WorkflowMetrics {
  readonly records: RecordedMetric[] = [];

  emit(metric: WorkflowMetric): void {
    this.records.push({
      name: metric.name,
      value: metric.value,
      unit: metric.unit,
      tags: normalizeTags(metric.tags),
      timestamp: metric.timestamp ?? new Date().toISOString(),
    });
  }
}

export const createOtelWorkflowMetrics = (
  meter: Meter = metrics.getMeter('workflow-server-observability'),
): OTelWorkflowMetrics => new OTelWorkflowMetrics(meter);
