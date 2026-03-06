/**
 * B-WEB-033: Contract mismatch and invariant violations visibly surfaced.
 * B-WEB-034: Child-launch annotations preserved and rendered.
 * B-WEB-035: Large-graph performance mode threshold and features.
 * B-WEB-041: Layout failures surface retryable error state with no silent fallback.
 * B-WEB-042: Graph legend and required visual encoding semantics.
 * B-WEB-044: Node selection reveals metadata and linked transitions.
 * B-WEB-061/B-WEB-063: Child drill-down, breadcrumb, history, and iteration selection.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactElement,
} from 'react';
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
} from 'reactflow';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  ButtonBase,
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
  RunTreeResponse,
  WorkflowDefinitionResponse,
  WorkflowStreamFrame,
} from '@composable-workflow/workflow-api-types';

import { applyOverlay, type OverlayMismatch } from '../graph/applyOverlay';
import { layoutGraph, resolveLayoutDirection, type LayoutDirection } from '../graph/layoutGraph';
import {
  projectDefinitionToGraph,
  type FsmEdgeData,
  type FsmNodeData,
  type InvariantViolation,
} from '../graph/projectDefinitionToGraph';
import {
  asChildLaunchAnnotation,
  collectChildLaunchIterations,
  resolveChildDrilldownTarget,
  type ChildDrilldownTarget,
  type ChildLaunchIteration,
} from '../graph/resolveChildDrilldownTarget';
import { FsmGraphBreadcrumbs, type FsmGraphBreadcrumbItem } from './FsmGraphBreadcrumbs';
import { IterationSelectorDialog } from './IterationSelectorDialog';

const PERF_NODE_THRESHOLD = 120;
const PERF_EDGE_THRESHOLD = 200;
const EDGE_LABEL_ZOOM_THRESHOLD = 0.85;
const ACTIVE_PATH_HOP_LIMIT = 2;

export type GraphDrilldownAncestor = {
  runId: string;
  workflowType: string | null;
  label: string;
};

export type FsmGraphPanelProps = {
  runId: string;
  definition: WorkflowDefinitionResponse | null;
  tree: RunTreeResponse | null;
  summary: RunSummaryResponse | null;
  events: RunEventsResponse | null;
  streamFrames: WorkflowStreamFrame[];
  navigationContext: {
    ancestors: GraphDrilldownAncestor[];
    current: GraphDrilldownAncestor;
    breadcrumbs: FsmGraphBreadcrumbItem[];
  };
  isLoading: boolean;
  errorMessage: string | null;
  onRetry: () => Promise<void>;
};

const buildNodeSurfaceSx = (
  data: FsmNodeData,
  base: Record<string, unknown>,
): Record<string, unknown> => ({
  ...base,
  opacity: data.isDimmed ? 0.35 : 1,
  filter: data.isUnreachable ? 'saturate(0.35)' : undefined,
  boxShadow: data.isSelected
    ? '0 0 0 3px rgba(144, 202, 249, 0.95)'
    : data.isNeighborhood
      ? '0 0 0 2px rgba(77, 182, 172, 0.85)'
      : undefined,
  borderStyle: data.isOrphan ? 'dashed' : undefined,
  transition: 'opacity 140ms ease, box-shadow 140ms ease, filter 140ms ease',
});

const ChildLaunchBadge = ({ count }: { count: number }): ReactElement => (
  <Chip
    size="small"
    label={`🚀 ${count}`}
    color="info"
    sx={{ height: 18, fontSize: '0.65rem' }}
    data-testid="child-launch-badge"
  />
);

const NodeRelationshipBadges = ({ data }: { data: FsmNodeData }): ReactElement | null => {
  const showBadges = data.childLaunchAnnotations.length > 0 || data.isOrphan || data.isUnreachable;

  if (!showBadges) {
    return null;
  }

  return (
    <Stack direction="row" spacing={0.5} justifyContent="center" flexWrap="wrap" useFlexGap>
      {data.childLaunchAnnotations.length > 0 ? (
        <ChildLaunchBadge count={data.childLaunchAnnotations.length} />
      ) : null}
      {data.isOrphan ? <Chip size="small" label="Orphan" color="warning" /> : null}
      {data.isUnreachable ? <Chip size="small" label="Unreachable" color="default" /> : null}
    </Stack>
  );
};

const ChildLaunchButtons = ({ data }: { data: FsmNodeData }): ReactElement | null => {
  if (!data.drilldownActions || data.drilldownActions.length === 0) {
    return null;
  }

  const handleActivate = (
    event: ReactMouseEvent<HTMLButtonElement>,
    onActivate: () => void,
  ): void => {
    event.preventDefault();
    event.stopPropagation();
    onActivate();
  };

  return (
    <Stack spacing={0.5} sx={{ mt: 0.75 }}>
      {data.drilldownActions.map((action) => (
        <ButtonBase
          key={action.key}
          className="nodrag nopan"
          onClick={(event) => handleActivate(event, action.onActivate)}
          sx={{
            borderRadius: 1,
            border: '1px solid',
            borderColor: 'info.main',
            px: 0.75,
            py: 0.35,
            fontSize: '0.65rem',
            fontWeight: 700,
            color: 'info.main',
            backgroundColor: 'rgba(2, 136, 209, 0.08)',
            '&.Mui-focusVisible': {
              outline: '2px solid #90caf9',
              outlineOffset: 2,
            },
          }}
          aria-label={`Open child workflow ${action.childWorkflowType} from ${data.stateId}`}
          data-testid={`graph-drilldown-${data.stateId}-${action.childWorkflowType}`}
        >
          ↗ {action.label}
        </ButtonBase>
      ))}
    </Stack>
  );
};

const FsmInitialNode = ({ data }: NodeProps<FsmNodeData>): ReactElement => (
  <Tooltip title={`Initial state: ${data.stateId}`}>
    <Stack
      alignItems="center"
      spacing={0.75}
      data-testid={`graph-node-${data.stateId}`}
      data-role="initial"
    >
      <Box
        sx={buildNodeSurfaceSx(data, {
          px: 2,
          py: 1,
          borderRadius: '50%',
          border: '3px solid #1976d2',
          background: 'inherit',
          minWidth: 72,
          textAlign: 'center',
          fontSize: '0.8rem',
          fontWeight: 700,
        })}
      >
        {data.stateId}
      </Box>
      <NodeRelationshipBadges data={data} />
      <ChildLaunchButtons data={data} />
    </Stack>
  </Tooltip>
);

const FsmTerminalNode = ({ data }: NodeProps<FsmNodeData>): ReactElement => (
  <Tooltip title={`Terminal state: ${data.stateId}`}>
    <Stack
      alignItems="center"
      spacing={0.75}
      data-testid={`graph-node-${data.stateId}`}
      data-role="terminal"
    >
      <Box
        sx={buildNodeSurfaceSx(data, {
          px: 2,
          py: 1,
          borderRadius: 1,
          border: '3px double #d32f2f',
          background: 'inherit',
          minWidth: 72,
          textAlign: 'center',
          fontSize: '0.8rem',
          fontWeight: 600,
        })}
      >
        {data.stateId}
      </Box>
      <NodeRelationshipBadges data={data} />
      <ChildLaunchButtons data={data} />
    </Stack>
  </Tooltip>
);

const FsmDecisionNode = ({ data }: NodeProps<FsmNodeData>): ReactElement => (
  <Tooltip title={`Decision state: ${data.stateId}`}>
    <Stack
      alignItems="center"
      spacing={0.75}
      data-testid={`graph-node-${data.stateId}`}
      data-role="decision"
    >
      <Box
        sx={buildNodeSurfaceSx(data, {
          px: 2,
          py: 1,
          transform: 'rotate(45deg)',
          border: '2px solid #ed6c02',
          background: 'inherit',
          minWidth: 44,
          textAlign: 'center',
          fontSize: '0.75rem',
          '& > span': { display: 'inline-block', transform: 'rotate(-45deg)' },
        })}
      >
        <span>{data.stateId}</span>
      </Box>
      <NodeRelationshipBadges data={data} />
      <ChildLaunchButtons data={data} />
    </Stack>
  </Tooltip>
);

const FsmStandardNode = ({ data }: NodeProps<FsmNodeData>): ReactElement => (
  <Tooltip title={`State: ${data.stateId}`}>
    <Stack
      alignItems="center"
      spacing={0.75}
      data-testid={`graph-node-${data.stateId}`}
      data-role="standard"
    >
      <Box
        sx={buildNodeSurfaceSx(data, {
          px: 2,
          py: 1,
          borderRadius: 1,
          border: '2px solid #90a4ae',
          background: 'inherit',
          minWidth: 72,
          textAlign: 'center',
          fontSize: '0.8rem',
        })}
      >
        {data.stateId}
      </Box>
      <NodeRelationshipBadges data={data} />
      <ChildLaunchButtons data={data} />
    </Stack>
  </Tooltip>
);

const nodeTypes: NodeTypes = {
  fsmInitial: FsmInitialNode,
  fsmTerminal: FsmTerminalNode,
  fsmDecision: FsmDecisionNode,
  fsmStandard: FsmStandardNode,
};

const GraphLegend = (): ReactElement => (
  <Paper
    variant="outlined"
    sx={{ p: 1, position: 'absolute', top: 8, right: 8, zIndex: 10, opacity: 0.95 }}
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
      <LegendEntry shape="badge" color="#0288d1" label="Child launch" />
      <LegendEntry shape="line-dashed" color="#f57c00" label="Orphan" />
      <LegendEntry shape="square-muted" color="#90a4ae" label="Unreachable" />
      <LegendEntry shape="line-solid" color="#2e7d32" label="Traversed" />
      <LegendEntry shape="line-parallel" color="#546e7a" label="Parallel transition" />
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
  | 'line-parallel'
  | 'square-muted'
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
        return { width: 10, height: 10, border: `2px solid ${color}`, transform: 'rotate(45deg)' };
      case 'double-border':
        return { width: 12, height: 12, borderRadius: 2, border: `3px double ${color}` };
      case 'line-solid':
        return { width: 18, height: 0, borderTop: `2px solid ${color}` };
      case 'line-dashed':
        return { width: 18, height: 0, borderTop: `2px dashed ${color}` };
      case 'line-parallel':
        return {
          width: 18,
          height: 8,
          borderTop: `2px solid ${color}`,
          borderBottom: `2px solid ${color}`,
        };
      case 'square-muted':
        return {
          width: 12,
          height: 12,
          borderRadius: 2,
          border: `2px solid ${color}`,
          opacity: 0.45,
        };
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

const GraphSummaryIndicator = ({
  stateCount,
  transitionCount,
  unreachableStateCount,
  terminalStateCount,
  orphanStateCount,
}: {
  stateCount: number;
  transitionCount: number;
  unreachableStateCount: number;
  terminalStateCount: number;
  orphanStateCount: number;
}): ReactElement => (
  <Paper
    variant="outlined"
    sx={{ p: 1, position: 'absolute', top: 48, left: 8, zIndex: 10, opacity: 0.95, maxWidth: 340 }}
    data-testid="graph-summary"
  >
    <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
      <Chip size="small" label={`States ${stateCount}`} data-testid="graph-summary-states" />
      <Chip
        size="small"
        label={`Transitions ${transitionCount}`}
        data-testid="graph-summary-transitions"
      />
      <Chip
        size="small"
        label={`Unreachable ${unreachableStateCount}`}
        color={unreachableStateCount > 0 ? 'warning' : 'default'}
        data-testid="graph-summary-unreachable"
      />
      <Chip
        size="small"
        label={`Terminal ${terminalStateCount}`}
        data-testid="graph-summary-terminal"
      />
      {orphanStateCount > 0 ? <Chip size="small" label={`Orphans ${orphanStateCount}`} /> : null}
    </Stack>
  </Paper>
);

const NodeSelectionDetail = ({
  node,
  edges,
}: {
  node: Node<FsmNodeData>;
  edges: Edge<FsmEdgeData>[];
}): ReactElement => {
  const inbound = edges.filter((edge) => edge.target === node.id);
  const outbound = edges.filter((edge) => edge.source === node.id);

  return (
    <Paper
      variant="outlined"
      sx={{ p: 1.5, position: 'absolute', bottom: 8, left: 8, zIndex: 10, maxWidth: 320 }}
      data-testid="node-selection-detail"
    >
      <Typography variant="subtitle2" gutterBottom>
        {node.data.stateId}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        Role: {node.data.role} · Type: {node.data.workflowType}
      </Typography>
      {node.data.isOrphan || node.data.isUnreachable ? (
        <Typography variant="caption" display="block" color="warning.main">
          {node.data.isOrphan ? 'Orphan state' : null}
          {node.data.isOrphan && node.data.isUnreachable ? ' · ' : null}
          {node.data.isUnreachable ? 'Unreachable from initial state' : null}
        </Typography>
      ) : null}
      {node.data.childLaunchAnnotations.length > 0 ? (
        <Typography variant="caption" display="block" color="info.main">
          Child launches: {node.data.childLaunchAnnotations.length}
        </Typography>
      ) : null}
      {inbound.length > 0 ? (
        <Box mt={0.75}>
          <Typography variant="caption" fontWeight={600}>
            Inbound ({inbound.length})
          </Typography>
          {inbound.map((edge) => (
            <Typography key={edge.id} variant="caption" display="block" sx={{ pl: 1 }}>
              ← {edge.data?.fromState}
              {edge.data?.transitionName ? ` (${edge.data.transitionName})` : ''}
            </Typography>
          ))}
        </Box>
      ) : null}
      {outbound.length > 0 ? (
        <Box mt={0.75}>
          <Typography variant="caption" fontWeight={600}>
            Outbound ({outbound.length})
          </Typography>
          {outbound.map((edge) => (
            <Typography key={edge.id} variant="caption" display="block" sx={{ pl: 1 }}>
              → {edge.data?.toState}
              {edge.data?.transitionName ? ` (${edge.data.transitionName})` : ''}
            </Typography>
          ))}
        </Box>
      ) : null}
    </Paper>
  );
};

type InternalGraphProps = {
  runId: string;
  definition: WorkflowDefinitionResponse;
  tree: RunTreeResponse | null;
  summary: RunSummaryResponse | null;
  events: RunEventsResponse | null;
  streamFrames: WorkflowStreamFrame[];
  navigationContext: FsmGraphPanelProps['navigationContext'];
};

const InternalGraph = ({
  runId,
  definition,
  tree,
  summary,
  events,
  streamFrames,
  navigationContext,
}: InternalGraphProps): ReactElement => {
  const { fitView } = useReactFlow();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const [layoutDirection, setLayoutDirection] = useState<LayoutDirection>('LR');
  const [layoutError, setLayoutError] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState('');
  const [currentZoom, setCurrentZoom] = useState(1);
  const [iterationDialog, setIterationDialog] = useState<{
    stateId: string;
    childWorkflowType: string;
    iterations: ChildLaunchIteration[];
  } | null>(null);
  const layoutKeyRef = useRef<string | null>(null);

  const projection = useMemo(() => projectDefinitionToGraph(definition), [definition]);

  const isPerformanceMode =
    projection.nodes.length > PERF_NODE_THRESHOLD || projection.edges.length > PERF_EDGE_THRESHOLD;

  const layoutResult = useMemo(
    () => layoutGraph(projection.nodes, projection.edges, layoutDirection),
    [layoutDirection, projection.edges, projection.nodes],
  );

  useEffect(() => {
    setLayoutError(layoutResult.ok ? null : layoutResult.error);
  }, [layoutResult]);

  const layoutKey = `${definition.workflowType}::${definition.workflowVersion}::${layoutDirection}`;
  useEffect(() => {
    if (layoutKeyRef.current !== null && layoutKeyRef.current !== layoutKey) {
      void fitView({ duration: isPerformanceMode ? 0 : 200 });
    }
    layoutKeyRef.current = layoutKey;
  }, [fitView, isPerformanceMode, layoutKey]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setLayoutDirection(resolveLayoutDirection(entry.contentRect.width));
      }
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const structuredLayout = useMemo(() => {
    if (!layoutResult.ok) {
      return null;
    }

    return {
      nodes: groupOrphanNodes(layoutResult.nodes, layoutDirection),
      edges: applyStructuralEdgeStyling(layoutResult.edges),
    };
  }, [layoutDirection, layoutResult]);

  const overlayResult = useMemo(() => {
    if (!structuredLayout) {
      return null;
    }

    return applyOverlay(structuredLayout.nodes, structuredLayout.edges, {
      workflowType: definition.workflowType,
      summary,
      events,
      streamFrames,
    });
  }, [definition.workflowType, events, streamFrames, structuredLayout, summary]);

  const filteredNodes = useMemo(() => {
    if (!overlayResult) {
      return [] as Node<FsmNodeData>[];
    }

    let nextNodes = overlayResult.nodes;

    if (searchFilter.trim()) {
      const query = searchFilter.trim().toLowerCase();
      nextNodes = nextNodes.filter((node) => node.data.stateId.toLowerCase().includes(query));
    }

    if (isPerformanceMode && !searchFilter.trim()) {
      const activeNodeId = overlayResult.nodes.find(
        (node) => node.style?.background === '#1976d2',
      )?.id;
      if (activeNodeId) {
        const reachable = collectHopNeighbors(
          activeNodeId,
          overlayResult.edges,
          ACTIVE_PATH_HOP_LIMIT,
        );
        nextNodes = nextNodes.filter((node) => reachable.has(node.id));
      }
    }

    return nextNodes;
  }, [isPerformanceMode, overlayResult, searchFilter]);

  const filteredEdges = useMemo(() => {
    if (!overlayResult) {
      return [] as Edge<FsmEdgeData>[];
    }

    const nodeIds = new Set(filteredNodes.map((node) => node.id));
    let nextEdges = overlayResult.edges.filter(
      (edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target),
    );

    if (isPerformanceMode && currentZoom < EDGE_LABEL_ZOOM_THRESHOLD) {
      nextEdges = nextEdges.map((edge) => ({ ...edge, label: undefined }));
    }

    return nextEdges;
  }, [currentZoom, filteredNodes, isPerformanceMode, overlayResult]);

  const nextNavigationState = useMemo(
    () => ({ graphAncestors: [...navigationContext.ancestors, navigationContext.current] }),
    [navigationContext.ancestors, navigationContext.current],
  );

  const navigateToTarget = useCallback(
    (target: ChildDrilldownTarget) => {
      navigate(target.path, { state: nextNavigationState });
    },
    [navigate, nextNavigationState],
  );

  const handleChildLaunchActivate = useCallback(
    (stateId: string, annotationRecord: Record<string, unknown>) => {
      const annotation = asChildLaunchAnnotation(annotationRecord);
      if (!annotation) {
        return;
      }

      const iterations = collectChildLaunchIterations({ annotation, tree, events });
      if (iterations.length > 1) {
        setIterationDialog({
          stateId,
          childWorkflowType: annotation.childWorkflowType,
          iterations,
        });
        return;
      }

      navigateToTarget(resolveChildDrilldownTarget({ annotation, tree, events }));
    },
    [events, navigateToTarget, tree],
  );

  const graphWithNeighborhood = useMemo(() => {
    const nodesWithActions = filteredNodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        drilldownActions: node.data.childLaunchAnnotations
          .map((annotation, index) => {
            const parsed = asChildLaunchAnnotation(annotation);
            if (!parsed) {
              return null;
            }

            return {
              key: `${node.id}-${index}`,
              label: parsed.childWorkflowType,
              childWorkflowType: parsed.childWorkflowType,
              onActivate: () => handleChildLaunchActivate(node.data.stateId, annotation),
            };
          })
          .filter(
            (action): action is NonNullable<FsmNodeData['drilldownActions']>[number] =>
              action !== null,
          ),
      },
    }));

    return applyNeighborhoodHighlight(nodesWithActions, filteredEdges, selectedNodeId);
  }, [filteredEdges, filteredNodes, handleChildLaunchActivate, selectedNodeId]);

  useEffect(() => {
    if (selectedNodeId && !graphWithNeighborhood.nodes.some((node) => node.id === selectedNodeId)) {
      setSelectedNodeId(null);
    }
  }, [graphWithNeighborhood.nodes, selectedNodeId]);

  const selectedNode = useMemo(
    () => graphWithNeighborhood.nodes.find((node) => node.id === selectedNodeId) ?? null,
    [graphWithNeighborhood.nodes, selectedNodeId],
  );

  const onNodeClick = useCallback((_: ReactMouseEvent, node: Node<FsmNodeData>) => {
    setSelectedNodeId((previous) => (previous === node.id ? null : node.id));
  }, []);

  const handleLayoutRetry = useCallback(() => {
    setLayoutError(null);
    setLayoutDirection((previous) => {
      const next = previous === 'LR' ? 'TB' : 'LR';
      setTimeout(() => setLayoutDirection(previous), 0);
      return next;
    });
  }, []);

  const allViolations = projection.invariantViolations;
  const allMismatches = overlayResult?.mismatches ?? [];
  const hasDiagnostics = allViolations.length > 0 || allMismatches.length > 0;

  if (import.meta.env.DEV && hasDiagnostics) {
    console.warn('[FsmGraphPanel] diagnostics', { allViolations, allMismatches, runId });
  }

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
    <Box ref={containerRef} sx={{ height: '100%', minHeight: 420, position: 'relative' }}>
      {hasDiagnostics ? (
        <DiagnosticsBanner violations={allViolations} mismatches={allMismatches} />
      ) : null}
      {isPerformanceMode ? (
        <Chip
          size="small"
          label="Performance mode"
          color="warning"
          sx={{ position: 'absolute', top: 8, left: 8, zIndex: 10 }}
          data-testid="performance-mode-indicator"
        />
      ) : null}
      {isPerformanceMode ? (
        <TextField
          size="small"
          placeholder="Filter states…"
          value={searchFilter}
          onChange={(event) => setSearchFilter(event.target.value)}
          sx={{ position: 'absolute', top: 8, left: 160, zIndex: 10, width: 190 }}
          data-testid="graph-search-filter"
        />
      ) : null}
      <GraphSummaryIndicator {...projection.summary} />
      <GraphLegend />
      <ReactFlow
        nodes={graphWithNeighborhood.nodes}
        edges={graphWithNeighborhood.edges}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        onPaneClick={() => setSelectedNodeId(null)}
        onMove={(_event, viewport) => setCurrentZoom(viewport.zoom)}
        fitView
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        {...(isPerformanceMode ? { edgesUpdatable: false } : {})}
      >
        <Controls />
        <MiniMap nodeStrokeWidth={3} zoomable pannable />
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
      </ReactFlow>
      {selectedNode ? (
        <NodeSelectionDetail node={selectedNode} edges={graphWithNeighborhood.edges} />
      ) : null}
      <IterationSelectorDialog
        open={iterationDialog !== null}
        stateId={iterationDialog?.stateId ?? ''}
        childWorkflowType={iterationDialog?.childWorkflowType ?? ''}
        iterations={iterationDialog?.iterations ?? []}
        onClose={() => setIterationDialog(null)}
        onSelect={(iteration) => {
          setIterationDialog(null);
          navigateToTarget(iteration.target);
        }}
      />
    </Box>
  );
};

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
      sx={{ position: 'absolute', bottom: 8, right: 8, zIndex: 10, maxWidth: 420 }}
      data-testid="graph-diagnostics"
    >
      <Alert
        severity="warning"
        action={
          <Button size="small" onClick={() => setExpanded((previous) => !previous)}>
            {expanded ? 'Hide' : 'Show'} ({total})
          </Button>
        }
      >
        {total} graph diagnostic{total !== 1 ? 's' : ''}
      </Alert>
      <Collapse in={expanded}>
        <Paper variant="outlined" sx={{ p: 1, mt: 0.5, maxHeight: 220, overflow: 'auto' }}>
          {violations.map((violation, index) => (
            <Typography key={`violation-${index}`} variant="caption" display="block" color="error">
              [{violation.kind}] {violation.message}
            </Typography>
          ))}
          {mismatches.map((mismatch, index) => (
            <Typography
              key={`mismatch-${index}`}
              variant="caption"
              display="block"
              color="warning.main"
            >
              [{mismatch.kind}] {mismatch.message}
            </Typography>
          ))}
        </Paper>
      </Collapse>
    </Box>
  );
};

function collectHopNeighbors(
  startId: string,
  edges: Edge<FsmEdgeData>[],
  maxHops: number,
): Set<string> {
  const visited = new Set<string>([startId]);
  let frontier = new Set<string>([startId]);

  for (let hop = 0; hop < maxHops; hop += 1) {
    const next = new Set<string>();
    for (const edge of edges) {
      if (frontier.has(edge.source) && !visited.has(edge.target)) {
        next.add(edge.target);
      }
      if (frontier.has(edge.target) && !visited.has(edge.source)) {
        next.add(edge.source);
      }
    }

    for (const nodeId of next) {
      visited.add(nodeId);
    }

    frontier = next;
    if (frontier.size === 0) {
      break;
    }
  }

  return visited;
}

function groupOrphanNodes(
  nodes: Node<FsmNodeData>[],
  layoutDirection: LayoutDirection,
): Node<FsmNodeData>[] {
  const orphanNodes = nodes.filter((node) => node.data.isOrphan);
  if (orphanNodes.length === 0) {
    return nodes;
  }

  const connectedNodes = nodes.filter((node) => !node.data.isOrphan);
  const bounds = connectedNodes.length > 0 ? getGraphBounds(connectedNodes) : getGraphBounds(nodes);

  return nodes.map((node) => {
    if (!node.data.isOrphan) {
      return node;
    }

    const orphanIndex = orphanNodes.findIndex((candidate) => candidate.id === node.id);
    return {
      ...node,
      position:
        layoutDirection === 'LR'
          ? { x: bounds.maxX + 260, y: bounds.minY + orphanIndex * 120 }
          : { x: bounds.minX + orphanIndex * 220, y: bounds.maxY + 180 },
    };
  });
}

function getGraphBounds(nodes: Node<FsmNodeData>[]): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
} {
  return nodes.reduce(
    (accumulator, node) => ({
      minX: Math.min(accumulator.minX, node.position.x),
      maxX: Math.max(accumulator.maxX, node.position.x),
      minY: Math.min(accumulator.minY, node.position.y),
      maxY: Math.max(accumulator.maxY, node.position.y),
    }),
    {
      minX: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
    },
  );
}

function applyStructuralEdgeStyling(edges: Edge<FsmEdgeData>[]): Edge<FsmEdgeData>[] {
  return edges.map((edge) => {
    const data = edge.data;

    return {
      ...edge,
      type: data?.isParallel ? 'smoothstep' : edge.type,
      markerEnd: { type: MarkerType.ArrowClosed, color: '#607d8b' },
      style: {
        ...edge.style,
        stroke: '#607d8b',
        strokeWidth: data?.isParallel ? 1.75 : 1.35,
        opacity: 0.95,
        strokeDasharray: data?.isParallel && data.parallelIndex % 2 === 1 ? '4 2' : undefined,
      },
      zIndex: data?.isParallel ? data.parallelIndex + 1 : edge.zIndex,
    };
  });
}

function applyNeighborhoodHighlight(
  nodes: Node<FsmNodeData>[],
  edges: Edge<FsmEdgeData>[],
  selectedNodeId: string | null,
): { nodes: Node<FsmNodeData>[]; edges: Edge<FsmEdgeData>[] } {
  if (!selectedNodeId) {
    return {
      nodes: nodes.map((node) => ({
        ...node,
        data: { ...node.data, isDimmed: false, isSelected: false, isNeighborhood: false },
      })),
      edges,
    };
  }

  const relatedNodeIds = new Set<string>([selectedNodeId]);
  const relatedEdgeIds = new Set<string>();

  for (const edge of edges) {
    if (edge.source === selectedNodeId || edge.target === selectedNodeId) {
      relatedEdgeIds.add(edge.id);
      relatedNodeIds.add(edge.source);
      relatedNodeIds.add(edge.target);
    }
  }

  return {
    nodes: nodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        isSelected: node.id === selectedNodeId,
        isNeighborhood: node.id !== selectedNodeId && relatedNodeIds.has(node.id),
        isDimmed: !relatedNodeIds.has(node.id),
      },
    })),
    edges: edges.map((edge) => {
      const currentStrokeWidth =
        typeof edge.style?.strokeWidth === 'number' ? edge.style.strokeWidth : 1.35;
      return relatedEdgeIds.has(edge.id)
        ? {
            ...edge,
            style: { ...edge.style, opacity: 1, strokeWidth: currentStrokeWidth + 0.75 },
            zIndex: 20,
          }
        : { ...edge, style: { ...edge.style, opacity: 0.16 } };
    }),
  };
}

export const FsmGraphPanel = ({
  runId,
  definition,
  tree,
  summary,
  events,
  streamFrames,
  navigationContext,
  isLoading,
  errorMessage,
  onRetry,
}: FsmGraphPanelProps): ReactElement => (
  <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
    <Stack spacing={1.5} sx={{ height: '100%' }}>
      <Typography variant="h6">FSM Graph</Typography>
      <FsmGraphBreadcrumbs items={navigationContext.breadcrumbs} />
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
        <Box sx={{ flex: 1, minHeight: 420 }}>
          <InternalGraph
            runId={runId}
            definition={definition}
            tree={tree}
            summary={summary}
            events={events}
            streamFrames={streamFrames}
            navigationContext={navigationContext}
          />
        </Box>
      ) : null}
    </Stack>
  </Paper>
);
