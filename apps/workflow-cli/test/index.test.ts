import { describe, expect, it } from 'vitest';

import { run } from '../src/index.js';

describe('workflow-cli', () => {
  it('returns command marker', () => {
    expect(run()).toBe('workflow-cli');
  });
});
