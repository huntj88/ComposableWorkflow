/**
 * ITX-WEB-035: Accessible critical-status announcements and panel-scoped empty/loading states.
 *
 * B-WEB-048: Critical SSE lifecycle changes are announced accessibly.
 *            Empty-state copy is task-oriented. Loading states are panel-scoped.
 *
 * Validates that:
 * - Critical status transitions emit accessible announcements.
 * - Empty-state copy is task-oriented.
 * - Loading states remain panel-scoped after initial route load.
 *
 * @vitest-environment jsdom
 */

import { afterEach, describe, expect, it } from 'vitest';

import type { WorkflowLifecycle } from '@composable-workflow/workflow-api-types';

import {
  announce,
  announceLifecycleChange,
  announceStreamHealthChange,
  buildFeedbackSubmitAnnouncement,
  buildLifecycleAnnouncement,
  buildStreamHealthAnnouncement,
  getLifecycleAnnouncementLevel,
  isTerminalLifecycle,
} from '../../../src/a11y/liveAnnouncements';
import { PANEL_EMPTY_TEXT, PANEL_LOADING_TEXT } from '../../../src/theme/tokens';

const removeLiveRegions = (): void => {
  for (const id of ['a11y-live-region-polite', 'a11y-live-region-assertive']) {
    document.getElementById(id)?.remove();
  }
};

describe('integration.accessibility.ITX-WEB-035', () => {
  afterEach(() => {
    removeLiveRegions();
  });

  // -----------------------------------------------------------------------
  // B-WEB-048: lifecycle announcements
  // -----------------------------------------------------------------------

  it('builds human-readable announcements for every lifecycle state', () => {
    const lifecycles: WorkflowLifecycle[] = [
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

    for (const lc of lifecycles) {
      const text = buildLifecycleAnnouncement(lc);
      expect(text.length).toBeGreaterThan(0);
      expect(typeof text).toBe('string');
    }
  });

  it('classifies failed as assertive and non-terminal states as polite', () => {
    expect(getLifecycleAnnouncementLevel('failed')).toBe('assertive');
    expect(getLifecycleAnnouncementLevel('running')).toBe('polite');
    expect(getLifecycleAnnouncementLevel('completed')).toBe('polite');
    expect(getLifecycleAnnouncementLevel('pausing')).toBe('polite');
    expect(getLifecycleAnnouncementLevel('cancelled')).toBe('polite');
    expect(getLifecycleAnnouncementLevel('recovering')).toBe('polite');
  });

  it('identifies terminal lifecycles correctly', () => {
    expect(isTerminalLifecycle('completed')).toBe(true);
    expect(isTerminalLifecycle('failed')).toBe(true);
    expect(isTerminalLifecycle('cancelled')).toBe(true);
    expect(isTerminalLifecycle('running')).toBe(false);
    expect(isTerminalLifecycle('paused')).toBe(false);
    expect(isTerminalLifecycle('recovering')).toBe(false);
  });

  it('announceLifecycleChange creates live region in DOM and sets text content', async () => {
    announceLifecycleChange('failed');

    // The announce function uses requestAnimationFrame for text update
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    const assertiveRegion = document.getElementById('a11y-live-region-assertive');
    expect(assertiveRegion).not.toBeNull();
    expect(assertiveRegion!.getAttribute('aria-live')).toBe('assertive');
    expect(assertiveRegion!.getAttribute('role')).toBe('alert');
    expect(assertiveRegion!.textContent).toBe('Workflow run has failed.');
  });

  it('announceLifecycleChange uses polite region for non-terminal states', async () => {
    announceLifecycleChange('running');

    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    const politeRegion = document.getElementById('a11y-live-region-polite');
    expect(politeRegion).not.toBeNull();
    expect(politeRegion!.getAttribute('aria-live')).toBe('polite');
    expect(politeRegion!.getAttribute('role')).toBe('status');
    expect(politeRegion!.textContent).toBe('Workflow run is now running.');
  });

  // -----------------------------------------------------------------------
  // B-WEB-048: stream health announcements
  // -----------------------------------------------------------------------

  it('builds stream health announcements for all states', () => {
    expect(buildStreamHealthAnnouncement('connected')).toContain('connected');
    expect(buildStreamHealthAnnouncement('reconnecting')).toContain('reconnecting');
    expect(buildStreamHealthAnnouncement('stale')).toContain('stale');
  });

  it('announceStreamHealthChange creates polite live region', async () => {
    announceStreamHealthChange('connected');

    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    const politeRegion = document.getElementById('a11y-live-region-polite');
    expect(politeRegion).not.toBeNull();
    expect(politeRegion!.textContent).toBe('Live stream connected.');
  });

  // -----------------------------------------------------------------------
  // B-WEB-048: feedback submit announcements
  // -----------------------------------------------------------------------

  it('builds feedback submit announcements for all outcomes', () => {
    expect(buildFeedbackSubmitAnnouncement('success')).toContain('successfully');
    expect(buildFeedbackSubmitAnnouncement('conflict')).toContain('conflict');
    expect(buildFeedbackSubmitAnnouncement('error')).toContain('failed');
  });

  // -----------------------------------------------------------------------
  // B-WEB-048: announce function level control
  // -----------------------------------------------------------------------

  it('announce with level off is a no-op', () => {
    announce('should not appear', 'off');
    const politeRegion = document.getElementById('a11y-live-region-polite');
    const assertiveRegion = document.getElementById('a11y-live-region-assertive');
    // Neither region should have been created since no previous announce calls created them
    expect(politeRegion).toBeNull();
    expect(assertiveRegion).toBeNull();
  });

  // -----------------------------------------------------------------------
  // B-WEB-048: task-oriented empty-state copy
  // -----------------------------------------------------------------------

  it('provides task-oriented empty-state copy for all panels', () => {
    const requiredPanels = ['summary', 'tree', 'events', 'logs', 'definition', 'feedback'];

    for (const panel of requiredPanels) {
      expect(PANEL_EMPTY_TEXT[panel]).toBeDefined();
      expect(PANEL_EMPTY_TEXT[panel].length).toBeGreaterThan(0);
    }
  });

  it('provides panel-scoped loading text for all panels', () => {
    const requiredPanels = ['summary', 'tree', 'events', 'logs', 'definition', 'feedback'];

    for (const panel of requiredPanels) {
      expect(PANEL_LOADING_TEXT[panel]).toBeDefined();
      expect(PANEL_LOADING_TEXT[panel].length).toBeGreaterThan(0);
    }
  });

  it('empty-state copy is task-oriented (includes actionable context)', () => {
    // Task-oriented means the copy tells the user what to do / what to expect
    expect(PANEL_EMPTY_TEXT.events).toMatch(/appear|execute|record/i);
    expect(PANEL_EMPTY_TEXT.logs).toMatch(/appear|execute|record/i);
    expect(PANEL_EMPTY_TEXT.feedback).toMatch(/appear|request|input/i);
  });
});
