import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  appendAcpNotificationChunk,
  extractFixtureKey,
  loadNextFixture,
  parseStructuredOutput,
  resetFixtureCounters,
  sliceAcpPromptOutput,
  toCopilotAcpLaunchArgs,
  toSchemaFollowUpPrompt,
  toSchemaRetryPrompt,
} from '../../src/workflows/copilot-prompt.js';

const tempDirs: string[] = [];

afterEach(() => {
  resetFixtureCounters();
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

const makeTempFixtureDir = (): string => {
  const dir = mkdtempSync(path.join(tmpdir(), 'copilot-prompt-fixture-'));
  tempDirs.push(dir);
  return dir;
};

describe('toCopilotAcpLaunchArgs', () => {
  it('builds copilot ACP launch args by default', () => {
    const args = toCopilotAcpLaunchArgs({
      prompt: 'Create a hello world app',
    });

    expect(args).toEqual(['--acp', '--stdio', '--allow-all-tools', '--no-color']);
  });

  it('supports custom args and directory options', () => {
    const args = toCopilotAcpLaunchArgs({
      prompt: 'Refactor the service layer',
      baseArgs: ['--model', 'gpt-5.3-codex', '--silent'],
      logDir: '/tmp/copilot-logs',
      allowedDirs: ['/workspace/a', '/workspace/b'],
    });

    expect(args).toEqual([
      '--acp',
      '--stdio',
      '--model',
      'gpt-5.3-codex',
      '--silent',
      '--log-dir',
      '/tmp/copilot-logs',
      '--add-dir',
      '/workspace/a',
      '--add-dir',
      '/workspace/b',
    ]);
  });
});

describe('schema helpers', () => {
  it('builds a schema follow-up prompt with strict JSON instruction', () => {
    const prompt = toSchemaFollowUpPrompt('{"field":""}');
    expect(prompt).toContain('Return only valid JSON');
    expect(prompt).toContain('{"field":""}');
  });

  it('builds a schema retry prompt that includes the previous output and schema', () => {
    const prompt = toSchemaRetryPrompt('{"field":"string"}', '{"field":123}');
    expect(prompt).toContain('previous JSON response was invalid');
    expect(prompt).toContain('{"field":123}');
    expect(prompt).toContain('Return only valid JSON');
    expect(prompt).toContain('{"field":"string"}');
  });

  it('parses structured JSON output', () => {
    expect(parseStructuredOutput('{"ok":true}')).toEqual({ ok: true });
  });

  it('accumulates ACP text chunks and slices outputs for sequential prompts', () => {
    const toNotification = (text: string): unknown => ({
      update: {
        sessionUpdate: 'agent_message_chunk',
        content: {
          type: 'text',
          text,
        },
      },
    });

    let transcript = '';
    const initialStart = transcript.length;
    transcript = appendAcpNotificationChunk(
      transcript,
      toNotification('First prompt answer part 1 ') as never,
    );
    transcript = appendAcpNotificationChunk(transcript, toNotification('part 2') as never);

    const initialOutput = sliceAcpPromptOutput(transcript, initialStart);
    expect(initialOutput).toBe('First prompt answer part 1 part 2');

    const followUpStart = transcript.length;
    transcript = appendAcpNotificationChunk(transcript, {
      update: {
        sessionUpdate: 'plan',
        plan: { entries: [] },
      },
    } as never);
    transcript = appendAcpNotificationChunk(transcript, toNotification('{"status":"ok"}') as never);

    const followUpOutput = sliceAcpPromptOutput(transcript, followUpStart);
    expect(followUpOutput).toBe('{"status":"ok"}');
  });
});

describe('fixture helpers', () => {
  it('extracts the fixture key from the schema $id basename', () => {
    const schema = JSON.stringify({
      $id: 'https://composable-workflow.local/schemas/app-builder/spec-doc/spec-integration-output.schema.json',
    });

    expect(extractFixtureKey(schema)).toBe('spec-integration-output');
  });

  it('wraps array-backed fixtures back to the first entry after the last item', () => {
    const fixtureDir = makeTempFixtureDir();
    writeFileSync(
      path.join(fixtureDir, 'consistency-check-output.json'),
      JSON.stringify([{ value: 'first' }, { value: 'second' }]),
      'utf-8',
    );

    expect(loadNextFixture(fixtureDir, 'consistency-check-output')).toEqual({ value: 'first' });
    expect(loadNextFixture(fixtureDir, 'consistency-check-output')).toEqual({ value: 'second' });
    expect(loadNextFixture(fixtureDir, 'consistency-check-output')).toEqual({ value: 'first' });
  });

  it('throws for empty array-backed fixtures', () => {
    const fixtureDir = makeTempFixtureDir();
    writeFileSync(path.join(fixtureDir, 'default.json'), '[]', 'utf-8');

    expect(() => loadNextFixture(fixtureDir, 'default')).toThrow(
      'Fixture array for key "default" must contain at least one entry',
    );
  });
});
