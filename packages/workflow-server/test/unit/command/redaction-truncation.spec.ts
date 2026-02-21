import { describe, expect, it } from 'vitest';

import { REDACTION_MARKER, redactPayloadFields } from '../../../src/command/redaction.js';
import { truncateCommandPayload } from '../../../src/command/truncation.js';

describe('command redaction and truncation helpers', () => {
  it('redacts configured fields deterministically', () => {
    const redacted = redactPayloadFields({
      payload: {
        stdin: 'secret-input',
        stdout: 'visible',
        stderr: 'err',
      },
      redactFields: ['stdin', 'stderr'],
    });

    expect(redacted.value.stdin).toBe(REDACTION_MARKER);
    expect(redacted.value.stderr).toBe(REDACTION_MARKER);
    expect(redacted.value.stdout).toBe('visible');
    expect(redacted.redactedFields).toEqual(['stdin', 'stderr']);
  });

  it('applies truncation after redaction', () => {
    const redacted = redactPayloadFields({
      payload: {
        stdin: 'very-secret',
        stdout: '123456789',
      },
      redactFields: ['stdin'],
    });
    const truncated = truncateCommandPayload({
      payload: redacted.value,
      outputMaxBytes: 5,
    });

    expect(truncated.truncated).toBe(true);
    expect(truncated.value.stdin).toBe(REDACTION_MARKER.slice(0, 5));
    expect(truncated.value.stdout).toBe('12345');
  });
});
