import { describe, expect, it } from 'vitest';

import { openRunStream } from '../../../src/stream/openRunStream';

describe('integration.stream.unsupported-eventType-filter', () => {
  it('surfaces explicit request error and avoids opening EventSource for unsupported eventType', () => {
    const seenUrls: string[] = [];
    let requestError: string | null = null;

    const stream = openRunStream({
      runId: 'wr_unsupported_filter',
      eventType: 'not-supported.event-type',
      eventSourceFactory: (url) => {
        seenUrls.push(url);
        return { close: () => {} } as unknown as EventSource;
      },
      onFrame: () => true,
      onRequestError: (message) => {
        requestError = message;
      },
    });

    expect(requestError).toBe('Unsupported stream eventType filter: not-supported.event-type');
    expect(seenUrls).toHaveLength(0);
    expect(stream.getLastSeenCursor()).toBeUndefined();

    stream.close();
  });
});
