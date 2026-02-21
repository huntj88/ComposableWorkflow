export const REDACTION_MARKER = '***REDACTED***';

export interface RedactionResult<T> {
  value: T;
  redactedFields: string[];
}

export const redactPayloadFields = <T extends Record<string, unknown>>(params: {
  payload: T;
  redactFields: string[];
}): RedactionResult<T> => {
  const nextValue = { ...params.payload } as Record<string, unknown>;
  const redactedFields: string[] = [];

  for (const field of params.redactFields) {
    if (!(field in nextValue)) {
      continue;
    }

    nextValue[field] = REDACTION_MARKER;
    redactedFields.push(field);
  }

  return {
    value: nextValue as T,
    redactedFields,
  };
};
