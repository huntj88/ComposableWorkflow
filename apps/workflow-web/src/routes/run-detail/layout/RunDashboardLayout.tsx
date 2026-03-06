/**
 * Run dashboard 3-zone layout component.
 *
 * B-WEB-027: Required 3-zone information architecture.
 *   Desktop (>=1280px): top summary strip, primary analysis (tree+graph),
 *   operational details (events/logs/feedback).
 *   Narrow (<1280px): stacks by priority: summary → tree/graph → events/logs → feedback.
 *
 * B-WEB-029: Keyboard-only completion paths with visible focus indicators.
 */

import type { ReactElement, ReactNode } from 'react';
import { Box, Stack } from '@mui/material';

import { spacing } from '../../../theme/tokens';

// ---------------------------------------------------------------------------
// Zone props
// ---------------------------------------------------------------------------

type RunDashboardLayoutProps = {
  /** Zone 1 — top summary strip (always visible). */
  summaryStrip: ReactNode;
  /** Zone 2A — primary analysis: execution tree. */
  executionTree: ReactNode;
  /** Zone 2B — primary analysis: FSM graph. */
  fsmGraph: ReactNode;
  /** Zone 3A — operational details: transition history. */
  transitionHistory: ReactNode;
  /** Zone 3A — operational details: events timeline. */
  eventsTimeline: ReactNode;
  /** Zone 3B — operational details: logs. */
  logs: ReactNode;
  /** Zone 3C — operational details: human feedback. */
  feedback: ReactNode;
  /** Header area (title, actions, alerts). */
  header: ReactNode;
};

// ---------------------------------------------------------------------------
// Breakpoint
// ---------------------------------------------------------------------------

const DESKTOP_BREAKPOINT = 1280;

/**
 * RunDashboardLayout implements the required 3-zone information architecture.
 *
 * At desktop width (>=1280px):
 *   ┌──────────────────────────────────────┐
 *   │          Header + Actions            │
 *   ├──────────────────────────────────────┤
 *   │          Summary Strip (Zone 1)      │
 *   ├────────────────┬─────────────────────┤
 *   │  Primary       │  Operational        │
 *   │  Analysis      │  Details            │
 *   │  (Zone 2)      │  (Zone 3)           │
 *   │  - Tree        │  - Events           │
 *   │  - Graph       │  - Logs             │
 *   │                │  - Feedback         │
 *   └────────────────┴─────────────────────┘
 *
 * At narrow width (<1280px), all panels stack in priority order.
 */
export const RunDashboardLayout = ({
  summaryStrip,
  executionTree,
  fsmGraph,
  transitionHistory,
  eventsTimeline,
  logs,
  feedback,
  header,
}: RunDashboardLayoutProps): ReactElement => (
  <Stack spacing={spacing.panelGap} role="main" aria-label="Run dashboard">
    {/* Header row — title, actions, alerts */}
    {header}

    {/* Zone 1: Summary strip — always visible, full width */}
    <Box component="section" aria-label="Run summary">
      {summaryStrip}
    </Box>

    {/* Zones 2+3: Desktop side-by-side, narrow stacked by priority */}
    <Stack
      direction={{ xs: 'column', lg: 'row' }}
      spacing={spacing.panelGap}
      alignItems="stretch"
      sx={{
        [`@media (min-width: ${DESKTOP_BREAKPOINT}px)`]: {
          flexDirection: 'row',
        },
      }}
    >
      {/* Zone 2: Primary Analysis — tree + graph */}
      <Stack
        component="section"
        aria-label="Primary analysis"
        spacing={spacing.panelGap}
        sx={{ flex: 2, minWidth: 0 }}
      >
        {executionTree}
        {fsmGraph}
      </Stack>

      {/* Zone 3: Operational Details — events + logs + feedback */}
      <Stack
        component="section"
        aria-label="Operational details"
        spacing={spacing.panelGap}
        sx={{ flex: 3, minWidth: 0 }}
      >
        {transitionHistory}
        {eventsTimeline}
        {logs}
        {feedback}
      </Stack>
    </Stack>
  </Stack>
);
