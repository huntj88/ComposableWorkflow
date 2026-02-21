import { describe, expect, it } from 'vitest';

import { getServerStatus } from '../src/index.js';

describe('workflow-server', () => {
  it('returns ready status', () => {
    expect(getServerStatus()).toBe('ready');
  });
});
