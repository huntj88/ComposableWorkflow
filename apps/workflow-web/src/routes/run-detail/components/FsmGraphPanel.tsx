/**
 * B-WEB-033: Contract mismatch and invariant violations visibly surfaced.
 * B-WEB-034: Child-launch annotations preserved and rendered.
 * B-WEB-035: Large-graph performance mode threshold and features.
 * B-WEB-041: Layout failures surface retryable error state with no silent fallback.
 * B-WEB-042: Graph legend and required visual encoding semantics.
 * B-WEB-044: Node selection reveals metadata and linked transitions.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import ReactFlow, {
  MiniMap,
  Controls,
  Background,
  BackgroundVariant,
  useReactFlow,
  type Node,
  type Edge,
  type NodeTypes,
  type NodeProps,
} from 'reactflow';
import {
  Alert,
  Box,
  Button,
  Chip,
  Collapse,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import 'reactflow/dist/style.css';

import type {
  RunEventsResponse,
  RunSummaryResponse,
  WorkflowDefinitionResponse,
  WorkflowStreamFrame,
} from '@composable-workflow/workflow-api-types';

import {
  projectDefinitionToGraph,
  type FsmNodeData,
  type FsmEdgeData,
  type InvariantViolation,
} from '../graph/projectDefinitionToGraph';
import { layoutGraph, resolveLayoutDirection, type LayoutDirection } from '../graph/layoutGraph';
import { applyOverlay, type OverlayMismatch } from '../graph/applyOverlay';

// ---------------------------------------------------------------------------
// Performance mode thresholds (B-WEB-035)
// ---------------------------------------------------------------------------

const PERF_NODE_THRESHOLD = 120;
const PERF_EDGE_THRESHOLD = 200;
const EDGE_LABEL_ZOOM_THRESHOLD = 0.85;
const ACTIVE_PATH_HOP_LIMIT = 2;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export type FsmGraphPanelProps = {
  definition: WorkflowDefinitionResponse | null;
  summary: RunSummaryResponse | null;
  events: RunEventsResponse | null;
  streamFrames: WorkflowStreamFrame[];
  isLoading: boolean;
  errorMessage: string | null;
  onRetry: () => Promise<void>;
};

// ---------------------------------------------------------------------------
// Custom node components (B-WEB-042 role → shape semantics)
// ---------------------------------------------------------------------------

const FsmInitialNode = ({ data }: NodeProps<FsmNodeData>): ReactElement => (
  <Tooltip title={`Initial state: ${data.stateId}`}>
    <Box
      data-testid={`graph-node-${data.stateId}`}
      data-role="initial"
      sx={{
        px: 2,
        py: 1,
        borderRadius: '50%',
        border: '3px solid #1976d2',
        background: 'inherit',
        minWidth: 60,
        textAlign: 'center',
        fontSize: '0.8rem',
        fontWeight: 700,
      }}
    >
      {data.stateId}
      {data.childLaunchAnnotations.length > 0 && (
        <ChildLaunchBadge count={data.childLaunchAnnotations.length} />
      )}
    </Box>
  </Tooltip>
);

const FsmTerminalNode = ({ data }: NodeProps<FsmNodeData>): ReactElement => (
  <Tooltip title={`Terminal state: ${data.stateId}`}>
    <Box
      data-testid={`graph-node-${data.stateId}`}
      data-role="terminal"
      sx={{
        px: 2,
        py: 1,
        borderRadius: 1,
        border: '3px double #d32f2f',
        background: 'inherit',
        minWidth: 60,
        textAlign: 'center',
        fontSize: '0.8rem',
        fontWeight: 600,
      }}
    >
      {data.stateId}
    </Box>
  </Tooltip>
);

const FsmDecisionNode = ({ data }: NodeProps<FsmNodeData>): ReactElement => (
  <Tooltip title={`Decision state: ${data.stateId}`}>
    <Box
      data-testid={`graph-node-${data.stateId}`}
      data-role="decision"
      sx={{
        px: 2,
        py: 1,
        transform: 'rotate(45deg)',
        border: '2px solid #ed6c02',
        background: 'inherit',
        minWidth: 40,
        textAlign: 'center',
        fontSize: '0.75rem',
        '& > span': { display: 'inline-block', transform: 'rotate(-45deg)' },
      }}
    >
      <span>
        {data.stateId}
        {data.childLaunchAnnotations.length > 0 && (
          <ChildLaunchBadge count={data.childLaunchAnnotations.length} />
        )}
      </span>
    </Box>
  </Tooltip>
);

const FsmStandardNode = ({ data }: NodeProps<FsmNodeData>): ReactElement => (
  <Tooltip title={`State: ${data.stateId}`}>
    <Box
      data-testid={`graph-node-${data.stateId}`}
      data-role="standard"
      sx={{
        px: 2,
        py: 1,
        borderRadius: 1,
        border: '2px solid #90a4ae',
        background: 'inherit',
        minWidth: 60,
        textAlign: 'center',
        fontSize: '0.8rem',
      }}
    >
      {data.stateId}
      {data.childLaunchAnnotations.length > 0 && (
        <ChildLaunchBadge count={data.childLaunchAnnotations.length} />
      )}
    </Box>
  </Tooltip>
);

const ChildLaunchBadge = ({ count }: { count: number }): ReactElement => (
  <Chip
    size="small"
    label={`🚀 ${count}`}
    color="info"
    sx={{ ml: 0.5, height: 18, fontSize: '0.65rem' }}
    data-testid="child-launch-badge"
  />
);

const nodeTypes: NodeTypes = {
  fsmInitial: FsmInitialNode,
  fsmTerminal: FsmTerminalNode,
  fsmDecision: FsmDecisionNode,
  fsmStandard: FsmStandardNode,
};

// ---------------------------------------------------------------------------
// Legend (B-WEB-042)
// ---------------------------------------------------------------------------

const GraphLegend = (): ReactElement => (
  <Paper
    variant="outlined"
    sx={{ p: 1, position: 'absolute', top: 8, right: 8, zIndex: 10, opacity: 0.92 }}
    data-testid="graph-legend"
  >
    <Typography variant="caption" fontWeight={600} gutterBottom>
      Legend
    </Typography>
    <Stack spacing={0.25}>
      <LegendEntry shape="circle" color="#1976d2" label="Initial" />
      <LegendEntry shape="square" color="#90a4ae" label="Standard" />
      <LegendEntry shape="diamond" color="#ed6c02" label="Decision" />
      <LegendEntry shape="double-border" color="#d32f2f" label="Terminal" />
      <LegendEntry shape="line-solid" color="#2e7d32" label="Traversed" />
      <LegendEntry shape="line-dashed" color="#d32f2f" label="Failed" />
      <LegendEntry shape="line-solid" color="#90a4ae" label="Default" />
      <LegendEntry shape="badge" color="#0288d1" label="Child launch" />
    </Stack>
  </Paper>
);

type LegendShape =
  | 'circle'
  | 'square'
  | 'diamond'
  | 'double-border'
  | 'line-solid'
  | 'line-dashed'
  | 'badge';

const LegendEntry = ({
  shape,
  color,
  label,
}: {
  shape: LegendShape;
  color: string;
  label: string;
}): ReactElement => {
  const iconStyle = (): Record<string, unknown> => {
    switch (shape) {
      case 'circle':
        return { width: 12, height: 12, borderRadius: '50%', border: `2px solid ${color}` };
      case 'square':
        return { width: 12, height: 12, borderRadius: 2, border: `2px solid ${color}` };
      case 'diamond':
        return {
          width: 10,
          height: 10,
          border: `2px solid ${color}`,
          transform: 'rotate(45deg)',
        };
      case 'double-border':
        return {
          width: 12,
          height: 12,
          borderRadius: 2,
          border: `3px double ${color}`,
        };
      case 'line-solid':
        return { width: 18, height: 0, borderTop: `2px solid ${color}` };
      case 'line-dashed':
        return { width: 18, height: 0, borderTop: `2px dashed ${color}` };
      case 'badge':
        return {
          width: 14,
          height: 14,
          borderRadius: 2,
          background: color,
          fontSize: '8px',
          color: '#fff',
          textAlign: 'center',
          lineHeight: '14px',
        };
      default:
        return {};
    }
  };

  return (
    <Stack direction="row" spacing={0.5} alignItems="center">
      <Box sx={iconStyle()} />
      <Typography variant="caption" sx={{ fontSize: '0.65rem' }}>
        {label}
      </Typography>
    </Stack>
  );
};

// ---------------------------------------------------------------------------
// Selection detail panel (B-WEB-044)
// ---------------------------------------------------------------------------

const NodeSelectionDetail = ({
  node,
  edges,
}: {
  node: Node<FsmNodeData>;
  edges: Edge<FsmEdgeData>[];
}): ReactElement => {
  const inbound = edges.filter((e) => e.target === node.id);
  const outbound = edges.filter((e) => e.source === node.id);

  return (
    <Paper
      variant="outlined"
      sx={{ p: 1.5, position: 'absolute', bottom: 8, left: 8, zIndex: 10, maxWidth: 300 }}
      data-testid="node-selection-detail"
    >
      <Typography variant="subtitle2" gutterBottom>
        {node.data.stateId}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        Role: {node.data.role} · Type: {node.data.workflowType}
      </Typography>
      {node.data.childLaunchAnnotations.length > 0 && (
        <Typography variant="caption" display="block" color="info.main">
          Child launches: {node.data.childLaunchAnnotations.length}
        </Typography>
      )}
      {inbound.length > 0 && (
        <Box mt={0.5}>
          <Typography variant="caption" fontWeight={600}>
            Inbound ({inbound.length}):
          </Typography>
          {inbound.map((e) => (
            <Typography key={e.id} variant="caption" display="block" sx={{ pl: 1 }}>
              ← {e.data?.fromState}
              {e.data?.transitionName ? ` (${e.data.transitionName})` : ''}
            </Typography>
          ))}
        </Box>
      )}
      {outbound.length > 0 && (
        <Box mt={0.5}>
          <Typography variant="caption" fontWeight={600}>
            Outbound ({outbound.length}):
          </Typography>
          {outbound.map((e) => (
            <Typography key={e.id} variant="caption" display="block" sx={{ pl: 1 }}>
              → {e.data?.toState}
              {e.data?.transitionName ? ` (${e.data.transitionName})` : ''}
            </Typography>
          ))}
        </Box>
      )}
    </Paper>
  );
};

// ---------------------------------------------------------------------------
// Internal graph renderer (needs useReactFlow context)
// ---------------------------------------------------------------------------

type InternalGraphProps = {
  definition: WorkflowDefinitionResponse;
  summary: RunSummaryResponse | null;
  events: RunEventsResponse | null;
  streamFrames: WorkflowStreamFrame[];
};

const InternalGraph = ({
  definition,
  summary,
  events,
  streamFrames,
}: InternalGraphProps): ReactElement => {
  const { fitView } = useReactFlow();
  const containerRef = useRef<HTMLDivElement>(null);
  const [layoutDirection, setLayoutDirection] = useState<LayoutDirection>('LR');
  const [layoutError, setLayoutError] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState('');
  const layoutKeyRef = useRef<string | null>(null);
  const [currentZoom, setCurrentZoom] = useState(1);

  // --- Projection (deterministic, only changes when definition changes) ----
  const projection = useMemo(() => projectDefinitionToGraph(definition), [definition]);

  const isPerformanceMode =
    projection.nodes.length > PERF_NODE_THRESHOLD || projection.edges.length > PERF_EDGE_THRESHOLD;

  // --- Layout (only on definition or direction change, NOT on overlay) ------
  const layoutResult = useMemo(() => {
    const result = layoutGraph(projection.nodes, projection.edges, layoutDirection);
    if (!result.ok) {
      setLayoutError(result.error);
    } else {
      setLayoutError(null);
    }
    return result;
  }, [projection.nodes, projection.edges, layoutDirection]);

  // Track layout key for viewport preservation (B-WEB-031)
  const layoutKey = `${definition.workflowType}::${definition.workflowVersion}::${layoutDirection}`;
  useEffect(() => {
    if (layoutKeyRef.current !== null && layoutKeyRef.current !== layoutKey) {
      // Definition or direction changed → fit view
      void fitView({ duration: isPerformanceMode ? 0 : 200 });
    }
    layoutKeyRef.current = layoutKey;
  }, [layoutKey, fitView, isPerformanceMode]);

  // --- Overlay (changes on summary/events/stream, does NOT relayout) -------
  const overlayResult = useMemo(() => {
    if (!layoutResult.ok) return null;
    return applyOverlay(layoutResult.nodes, layoutResult.edges, {
      workflowType: definition.workflowType,
      summary,
      events,
      streamFrames,
    });
  }, [layoutResult, definition.workflowType, summary, events, streamFrames]);

  // --- Direction responsive to viewport width (B-WEB-031) ------------------
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setLayoutDirection(resolveLayoutDirection(entry.contentRect.width));
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // --- Performance mode: active-path 2-hop focus (B-WEB-035) ---------------
  const visibleNodes = useMemo(() => {
    if (!overlayResult) return [];
    let filtered = overlayResult.nodes;

    // Search filter
    if (searchFilter.trim()) {
      const q = searchFilter.trim().toLowerCase();
      filtered = filtered.filter((n) => n.data.stateId.toLowerCase().includes(q));
    }

    // Active-path focus in performance mode
    if (isPerformanceMode && !searchFilter.trim()) {
      const activeNodeId = overlayResult.nodes.find((n) => n.style?.background === '#1976d2')?.id;
      if (activeNodeId) {
        const reachable = collectHopNeighbors(
          activeNodeId,
          overlayResult.edges,
          ACTIVE_PATH_HOP_LIMIT,
        );
        filtered = filtered.filter((n) => reachable.has(n.id));
      }
    }

    return filtered;
  }, [overlayResult, searchFilter, isPerformanceMode]);

  const visibleEdges = useMemo(() => {
    if (!overlayResult) return [];
    const nodeIds = new Set(visibleNodes.map((n) => n.id));
    let filtered = overlayResult.edges.filter(
      (e) => nodeIds.has(e.source) && nodeIds.has(e.target),
    );

    // Performance mode: hide edge labels below zoom threshold (B-WEB-035)
    if (isPerformanceMode && currentZoom < EDGE_LABEL_ZOOM_THRESHOLD) {
      filtered = filtered.map((e) => ({ ...e, label: undefined }));
    }

    return filtered;
  }, [overlayResult, visibleNodes, isPerformanceMode, currentZoom]);

  // --- Selection (B-WEB-044) -----------------------------------------------
  const selectedNode = useMemo(
    () => visibleNodes.find((n) => n.id === selectedNodeId) ?? null,
    [visibleNodes, selectedNodeId],
  );

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node<FsmNodeData>) => {
    setSelectedNodeId((prev) => (prev === node.id ? null : node.id));
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  // --- Layout retry (B-WEB-041) --------------------------------------------
  const handleLayoutRetry = useCallback(() => {
    setLayoutError(null);
    // Force relayout by toggling direction
    setLayoutDirection((prev) => {
      const next = prev === 'LR' ? 'TB' : 'LR';
      // Switch back on next tick
      setTimeout(() => setLayoutDirection(prev), 0);
      return next;
    });
  }, []);

  // --- Invariant / mismatch diagnostics (B-WEB-033) ------------------------
  const allViolations = projection.invariantViolations;
  const allMismatches = overlayResult?.mismatches ?? [];
  const hasDiagnostics = allViolations.length > 0 || allMismatches.length > 0;

  if (import.meta.env.DEV && hasDiagnostics) {
    console.warn('[FsmGraphPanel] diagnostics', { allViolations, allMismatches });
  }

  // --- Layout error state (B-WEB-041) --------------------------------------
  if (layoutError) {
    return (
      <Box ref={containerRef} sx={{ height: '100%', minHeight: 200 }}>
        <Alert
          severity="error"
          data-testid="graph-layout-error"
          action={
            <Button color="inherit" size="small" onClick={handleLayoutRetry}>
              Retry
            </Button>
          }
        >
          Layout failed: {layoutError}
        </Alert>
      </Box>
    );
  }

  return (
    <Box ref={containerRef} sx={{ height: '100%', minHeight: 400, position: 'relative' }}>
      {/* Diagnostics banner (B-WEB-033) */}
      {hasDiagnostics && (
        <DiagnosticsBanner violations={allViolations} mismatches={allMismatches} />
      )}

      {/* Performance mode indicator */}
      {isPerformanceMode && (
        <Chip
          size="small"
          label="Performance mode"
          color="warning"
          sx={{ position: 'absolute', top: 8, left: 8, zIndex: 10 }}
          data-testid="performance-mode-indicator"
        />
      )}

      {/* Search/filter (B-WEB-035) */}
      {isPerformanceMode && (
        <TextField
          size="small"
          placeholder="Filter states…"
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
          sx={{ position: 'absolute', top: 8, left: 160, zIndex: 10, width: 180 }}
          data-testid="graph-search-filter"
        />
      )}

      <GraphLegend />

      <ReactFlow
        nodes={visibleNodes}
        edges={visibleEdges}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onMove={(_event, viewport) => setCurrentZoom(viewport.zoom)}
        fitView
        proOptions={{ hideAttribution: true }}
        minZoom={0.1}
        maxZoom={2}
        // B-WEB-035: Disable animations in performance mode
        {...(isPerformanceMode ? { edgesUpdatable: false } : {})}
      >
        <Controls />
        <MiniMap nodeStrokeWidth={3} zoomable pannable />
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
      </ReactFlow>

      {/* Selection detail (B-WEB-044) */}
      {selectedNode && <NodeSelectionDetail node={selectedNode} edges={visibleEdges} />}
    </Box>
  );
};

// ---------------------------------------------------------------------------
// Diagnostics banner (B-WEB-033)
// ---------------------------------------------------------------------------

const DiagnosticsBanner = ({
  violations,
  mismatches,
}: {
  violations: InvariantViolation[];
  mismatches: OverlayMismatch[];
}): ReactElement => {
  const [expanded, setExpanded] = useState(false);
  const total = violations.length + mismatches.length;

  return (
    <Box
      sx={{ position: 'absolute', bottom: 8, right: 8, zIndex: 10, maxWidth: 400 }}
      data-testid="graph-diagnostics"
    >
      <Alert
        severity="warning"
        action={
          <Button size="small" onClick={() => setExpanded((p) => !p)}>
            {expanded ? 'Hide' : 'Show'} ({total})
          </Button>
        }
      >
        {total} graph diagnostic{total !== 1 ? 's' : ''}
      </Alert>
      <Collapse in={expanded}>
        <Paper variant="outlined" sx={{ p: 1, mt: 0.5, maxHeight: 200, overflow: 'auto' }}>
          {violations.map((v, i) => (
            <Typography key={`v-${i}`} variant="caption" display="block" color="error">
              [{v.kind}] {v.message}
            </Typography>
          ))}
          {mismatches.map((m, i) => (
            <Typography key={`m-${i}`} variant="caption" display="block" color="warning.main">
              [{m.kind}] {m.message}
            </Typography>
          ))}
        </Paper>
      </Collapse>
    </Box>
  );
};

// ---------------------------------------------------------------------------
// Hop-neighbor collection (B-WEB-035 active-path focus)
// ---------------------------------------------------------------------------

function collectHopNeighbors(
  startId: string,
  edges: Edge<FsmEdgeData>[],
  maxHops: number,
): Set<string> {
  const visited = new Set<string>([startId]);
  let frontier = new Set<string>([startId]);

  for (let hop = 0; hop < maxHops; hop++) {
    const next = new Set<string>();
    for (const edge of edges) {
      if (frontier.has(edge.source) && !visited.has(edge.target)) {
        next.add(edge.target);
      }
      if (frontier.has(edge.target) && !visited.has(edge.source)) {
        next.add(edge.source);
      }
    }
    for (const id of next) visited.add(id);
    frontier = next;
    if (frontier.size === 0) break;
  }

  return visited;
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

export const FsmGraphPanel = ({
  definition,
  summary,
  events,
  streamFrames,
  isLoading,
  errorMessage,
  onRetry,
}: FsmGraphPanelProps): ReactElement => (
  <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
    <Stack spacing={1.5} sx={{ height: '100%' }}>
      <Typography variant="h6">FSM Graph</Typography>
      {isLoading ? (
        <Typography variant="body2" color="text.secondary">
          Loading definition graph…
        </Typography>
      ) : null}
      {!isLoading && errorMessage ? (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => void onRetry()}>
              Retry
            </Button>
          }
        >
          {errorMessage}
        </Alert>
      ) : null}
      {!isLoading && !errorMessage && definition ? (
        <Box sx={{ flex: 1, minHeight: 400 }}>
          <InternalGraph
            definition={definition}
            summary={summary}
            events={events}
            streamFrames={streamFrames}
          />
        </Box>
      ) : null}
    </Stack>
  </Paper>
);
