import { describe, expect, it } from 'vitest';

import {
  appendAcpNotificationChunk,
  parseStructuredOutput,
  sliceAcpPromptOutput,
  toCopilotAcpLaunchArgs,
  toSchemaFollowUpPrompt,
  toSchemaRetryPrompt,
} from '../../src/workflows/copilot-prompt.js';

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
