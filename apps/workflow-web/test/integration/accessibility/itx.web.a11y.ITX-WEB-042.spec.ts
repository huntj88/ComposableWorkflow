/**
 * ITX-WEB-042: Accessibility announcement levels and focus-return targets.
 *
 * B-WEB-055: aria-live politeness and deterministic focus-target rules.
 *
 * Validates that:
 * - Non-terminal updates announce via aria-live="polite"; terminal failures via aria-live="assertive".
 * - Retry returns focus to panel retry trigger.
 * - Feedback submit success moves focus to updated feedback status region.
 * - Run-not-found navigation sets focus to /runs primary heading/action region.
 *
 * @vitest-environment jsdom
 */

import { afterEach, describe, expect, it } from 'vitest';

import type { WorkflowLifecycle } from '@composable-workflow/workflow-api-types';

import {
  announce,
  announceLifecycleChange,
  FocusTargets,
  getLifecycleAnnouncementLevel,
  type LiveRegionLevel,
  moveFocusTo,
  returnFocusToElement,
} from '../../../src/a11y/liveAnnouncements';
import {
  lifecycleTokens,
  resolveLifecycleToken,
  resolveStreamHealthToken,
  streamHealthTokens,
} from '../../../src/theme/tokens';

const removeLiveRegions = (): void => {
  for (const id of ['a11y-live-region-polite', 'a11y-live-region-assertive']) {
    document.getElementById(id)?.remove();
  }
};

describe('integration.accessibility.ITX-WEB-042', () => {
  afterEach(() => {
    removeLiveRegions();
  });

  // -----------------------------------------------------------------------
  // B-WEB-055: aria-live level classification
  // -----------------------------------------------------------------------

  it('non-terminal lifecycle states use polite announcements', () => {
    const nonTerminal: WorkflowLifecycle[] = [
      'running',
      'pausing',
      'paused',
      'resuming',
      'recovering',
      'cancelling',
    ];

    for (const lc of nonTerminal) {
      expect(getLifecycleAnnouncementLevel(lc)).toBe('polite');
    }
  });

  it('terminal failure lifecycle uses assertive announcement', () => {
    expect(getLifecycleAnnouncementLevel('failed')).toBe('assertive');
  });

  it('completed and cancelled use polite (non-failure terminal)', () => {
    expect(getLifecycleAnnouncementLevel('completed')).toBe('polite');
    expect(getLifecycleAnnouncementLevel('cancelled')).toBe('polite');
  });

  it('assertive announcements create alert role element, polite creates status role', async () => {
    announceLifecycleChange('failed');
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    const assertiveEl = document.getElementById('a11y-live-region-assertive');
    expect(assertiveEl?.getAttribute('role')).toBe('alert');
    expect(assertiveEl?.getAttribute('aria-atomic')).toBe('true');

    announceLifecycleChange('running');
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    const politeEl = document.getElementById('a11y-live-region-polite');
    expect(politeEl?.getAttribute('role')).toBe('status');
    expect(politeEl?.getAttribute('aria-atomic')).toBe('true');
  });

  // -----------------------------------------------------------------------
  // B-WEB-055: focus-return targets
  // -----------------------------------------------------------------------

  it('retry action returns focus to the originating retry trigger element', () => {
    const retryButton = document.createElement('button');
    retryButton.textContent = 'Retry';
    document.body.appendChild(retryButton);

    try {
      // Simulate: user clicked retry, async operation completes, focus returns to trigger
      retryButton.blur();
      expect(document.activeElement).not.toBe(retryButton);

      returnFocusToElement(retryButton);
      expect(document.activeElement).toBe(retryButton);
    } finally {
      retryButton.remove();
    }
  });

  it('feedback submit success moves focus to feedback status region', () => {
    const statusRegion = document.createElement('div');
    statusRegion.setAttribute('data-focus-target', 'feedback-status');
    statusRegion.setAttribute('role', 'status');
    document.body.appendChild(statusRegion);

    try {
      const result = moveFocusTo(FocusTargets.FEEDBACK_STATUS);
      expect(result).toBe(true);
      expect(document.activeElement).toBe(statusRegion);
    } finally {
      statusRegion.remove();
    }
  });

  it('run-not-found navigation focuses /runs heading via RUNS_HEADING target', () => {
    const heading = document.createElement('h1');
    heading.setAttribute('data-focus-target', 'runs-heading');
    heading.textContent = 'Workflow Runs';
    document.body.appendChild(heading);

    try {
      const result = moveFocusTo(FocusTargets.RUNS_HEADING);
      expect(result).toBe(true);
      expect(document.activeElement).toBe(heading);
      // Should have been made focusable
      expect(heading.getAttribute('tabindex')).toBe('-1');
    } finally {
      heading.remove();
    }
  });

  it('RUN_DASHBOARD_HEADING target focuses the dashboard heading', () => {
    const heading = document.createElement('h1');
    heading.setAttribute('data-focus-target', 'run-dashboard-heading');
    document.body.appendChild(heading);

    try {
      const result = moveFocusTo(FocusTargets.RUN_DASHBOARD_HEADING);
      expect(result).toBe(true);
      expect(document.activeElement).toBe(heading);
    } finally {
      heading.remove();
    }
  });

  // -----------------------------------------------------------------------
  // B-WEB-028: Token consistency across panels
  // -----------------------------------------------------------------------

  it('lifecycle tokens cover all WorkflowLifecycle values', () => {
    const allLifecycles: WorkflowLifecycle[] = [
      'running',
      'pausing',
      'paused',
      'resuming',
      'recovering',
      'cancelling',
      'completed',
      'failed',
      'cancelled',
    ];

    for (const lc of allLifecycles) {
      const token = lifecycleTokens[lc];
      expect(token).toBeDefined();
      expect(token.color).toBeDefined();
      expect(token.semantic).toBeDefined();
      expect(token.label).toBeDefined();
      expect(token.label.length).toBeGreaterThan(0);
    }
  });

  it('resolveLifecycleToken returns fallback for unknown values', () => {
    const token = resolveLifecycleToken('unknown_state');
    expect(token.color).toBe('default');
    expect(token.semantic).toBe('neutral');
    expect(token.label).toBe('unknown_state');
  });

  it('stream health tokens cover all health states', () => {
    const healthStates: Array<'connected' | 'reconnecting' | 'stale'> = [
      'connected',
      'reconnecting',
      'stale',
    ];

    for (const state of healthStates) {
      const token = streamHealthTokens[state];
      expect(token).toBeDefined();
      expect(token.color).toBeDefined();
      expect(token.label).toBeDefined();
      expect(token.label.length).toBeGreaterThan(0);
    }
  });

  it('resolveStreamHealthToken returns fallback for unknown values', () => {
    const token = resolveStreamHealthToken('unknown_health');
    expect(token.color).toBe('warning');
    expect(token.label).toBe('unknown_health');
  });

  // -----------------------------------------------------------------------
  // Live region isolation
  // -----------------------------------------------------------------------

  it('live regions are visually hidden but screen-reader accessible', async () => {
    announce('test message', 'polite');
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    const region = document.getElementById('a11y-live-region-polite');
    expect(region).not.toBeNull();

    // Visually hidden clip technique
    expect(region!.style.position).toBe('absolute');
    expect(region!.style.width).toBe('1px');
    expect(region!.style.height).toBe('1px');
    expect(region!.style.overflow).toBe('hidden');
  });
});
