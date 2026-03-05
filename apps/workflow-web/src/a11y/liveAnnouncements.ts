/**
 * Accessibility live-region announcements and focus management.
 *
 * B-WEB-048: Critical SSE lifecycle announcements, task-oriented empty/loading.
 * B-WEB-055: aria-live level rules and deterministic focus-return targets.
 *
 * Rules:
 * - Non-terminal status changes → aria-live="polite"
 * - Terminal failures (failed) → aria-live="assertive"
 * - Panel retry → focus returns to retry trigger
 * - Feedback submit success → focus moves to feedback status region
 * - Run-not-found navigation → focus to /runs heading
 */

import type { WorkflowLifecycle } from '@composable-workflow/workflow-api-types';

// ---------------------------------------------------------------------------
// Live region politeness
// ---------------------------------------------------------------------------

export type LiveRegionLevel = 'polite' | 'assertive' | 'off';

const TERMINAL_FAILURE_LIFECYCLES = new Set<string>(['failed']);
const TERMINAL_LIFECYCLES = new Set<string>(['completed', 'failed', 'cancelled']);

/**
 * Determine the aria-live level for a lifecycle status announcement.
 *
 * - Terminal failures → assertive
 * - Other state changes → polite
 */
export const getLifecycleAnnouncementLevel = (lifecycle: WorkflowLifecycle): LiveRegionLevel => {
  if (TERMINAL_FAILURE_LIFECYCLES.has(lifecycle)) return 'assertive';
  return 'polite';
};

/**
 * Whether a lifecycle state is terminal (no further transitions expected).
 */
export const isTerminalLifecycle = (lifecycle: string): boolean =>
  TERMINAL_LIFECYCLES.has(lifecycle);

// ---------------------------------------------------------------------------
// Announcement text builders
// ---------------------------------------------------------------------------

/**
 * Build accessible announcement text for a lifecycle status change.
 */
export const buildLifecycleAnnouncement = (lifecycle: WorkflowLifecycle): string => {
  switch (lifecycle) {
    case 'running':
      return 'Workflow run is now running.';
    case 'pausing':
      return 'Workflow run is pausing.';
    case 'paused':
      return 'Workflow run is paused.';
    case 'resuming':
      return 'Workflow run is resuming.';
    case 'recovering':
      return 'Workflow run is recovering.';
    case 'cancelling':
      return 'Workflow run is being cancelled.';
    case 'completed':
      return 'Workflow run completed successfully.';
    case 'failed':
      return 'Workflow run has failed.';
    case 'cancelled':
      return 'Workflow run was cancelled.';
    default:
      return `Workflow run status changed to ${lifecycle as string}.`;
  }
};

/**
 * Build accessible announcement for stream health changes.
 */
export const buildStreamHealthAnnouncement = (
  health: 'connected' | 'reconnecting' | 'stale',
): string => {
  switch (health) {
    case 'connected':
      return 'Live stream connected.';
    case 'reconnecting':
      return 'Live stream reconnecting. Dashboard remains interactive.';
    case 'stale':
      return 'Live stream is stale. Waiting for fresh events.';
    default:
      return `Stream health changed to ${health as string}.`;
  }
};

/**
 * Build accessible announcement for feedback submission outcome.
 */
export const buildFeedbackSubmitAnnouncement = (
  outcome: 'success' | 'conflict' | 'error',
): string => {
  switch (outcome) {
    case 'success':
      return 'Feedback submitted successfully.';
    case 'conflict':
      return 'Feedback submission conflict. The request is no longer awaiting a response.';
    case 'error':
      return 'Feedback submission failed. Please try again.';
    default:
      return 'Feedback submission status changed.';
  }
};

// ---------------------------------------------------------------------------
// Live region DOM manager
// ---------------------------------------------------------------------------

const LIVE_REGION_ID_POLITE = 'a11y-live-region-polite';
const LIVE_REGION_ID_ASSERTIVE = 'a11y-live-region-assertive';

/**
 * Ensure the aria-live container element exists in the DOM.
 * Creates it if missing. The element is visually hidden but
 * available to screen readers.
 */
const ensureLiveRegion = (id: string, level: 'polite' | 'assertive'): HTMLElement => {
  let element = document.getElementById(id);

  if (!element) {
    element = document.createElement('div');
    element.id = id;
    element.setAttribute('aria-live', level);
    element.setAttribute('aria-atomic', 'true');
    element.setAttribute('role', level === 'assertive' ? 'alert' : 'status');
    Object.assign(element.style, {
      position: 'absolute',
      width: '1px',
      height: '1px',
      padding: '0',
      margin: '-1px',
      overflow: 'hidden',
      clip: 'rect(0, 0, 0, 0)',
      whiteSpace: 'nowrap',
      border: '0',
    });
    document.body.appendChild(element);
  }

  return element;
};

/**
 * Announce a message to screen readers via the appropriate live region.
 */
export const announce = (message: string, level: LiveRegionLevel = 'polite'): void => {
  if (level === 'off') return;

  const id = level === 'assertive' ? LIVE_REGION_ID_ASSERTIVE : LIVE_REGION_ID_POLITE;
  const region = ensureLiveRegion(id, level);

  // Clear then set to force screen reader re-announcement even if text is the same.
  region.textContent = '';
  // Use requestAnimationFrame to ensure the clear is processed before the new text.
  requestAnimationFrame(() => {
    region.textContent = message;
  });
};

/**
 * Announce a lifecycle change using the correct aria-live level.
 */
export const announceLifecycleChange = (lifecycle: WorkflowLifecycle): void => {
  const level = getLifecycleAnnouncementLevel(lifecycle);
  const message = buildLifecycleAnnouncement(lifecycle);
  announce(message, level);
};

/**
 * Announce a stream health change (always polite — non-blocking info).
 */
export const announceStreamHealthChange = (
  health: 'connected' | 'reconnecting' | 'stale',
): void => {
  announce(buildStreamHealthAnnouncement(health), 'polite');
};

// ---------------------------------------------------------------------------
// Focus management helpers (B-WEB-055)
// ---------------------------------------------------------------------------

/**
 * Known focus-return target selectors. Used by panels to deterministically
 * return focus after an action completes.
 */
export const FocusTargets = {
  /** Primary heading on /runs page */
  RUNS_HEADING: '[data-focus-target="runs-heading"]',
  /** Feedback status region after successful submit */
  FEEDBACK_STATUS: '[data-focus-target="feedback-status"]',
  /** Run dashboard heading */
  RUN_DASHBOARD_HEADING: '[data-focus-target="run-dashboard-heading"]',
} as const;

/**
 * Attempt to move focus to a target element identified by CSS selector.
 * Returns true if focus was successfully moved.
 */
export const moveFocusTo = (selector: string): boolean => {
  const target = document.querySelector<HTMLElement>(selector);

  if (!target) return false;

  // Ensure the element is focusable
  if (!target.hasAttribute('tabindex') && !isFocusableElement(target)) {
    target.setAttribute('tabindex', '-1');
  }

  target.focus();
  return true;
};

/**
 * Move focus back to a specific retry button element (panel retry returns focus
 * to originating trigger — B-WEB-055).
 */
export const returnFocusToElement = (element: HTMLElement | null): void => {
  if (!element) return;
  element.focus();
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const FOCUSABLE_TAGS = new Set(['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'SUMMARY']);

const isFocusableElement = (element: HTMLElement): boolean =>
  FOCUSABLE_TAGS.has(element.tagName) || element.hasAttribute('tabindex');
