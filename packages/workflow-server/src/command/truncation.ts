export interface TruncationResult<T> {
  value: T;
  truncated: boolean;
}

const truncateStringBytes = (
  value: string,
  maxBytes: number,
): { value: string; truncated: boolean } => {
  if (Buffer.byteLength(value, 'utf8') <= maxBytes) {
    return { value, truncated: false };
  }

  return {
    value: Buffer.from(value, 'utf8').subarray(0, maxBytes).toString('utf8'),
    truncated: true,
  };
};

export const truncateCommandPayload = <T extends Record<string, unknown>>(params: {
  payload: T;
  outputMaxBytes: number;
  fields?: string[];
}): TruncationResult<T> => {
  const fields = params.fields ?? ['stdin', 'stdout', 'stderr'];
  const nextValue = { ...params.payload } as Record<string, unknown>;
  let truncated = false;

  for (const field of fields) {
    const rawValue = nextValue[field];
    if (typeof rawValue !== 'string') {
      continue;
    }

    const truncatedField = truncateStringBytes(rawValue, params.outputMaxBytes);
    nextValue[field] = truncatedField.value;
    truncated = truncated || truncatedField.truncated;
  }

  return {
    value: nextValue as T,
    truncated,
  };
};
