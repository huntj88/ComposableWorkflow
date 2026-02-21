export interface RunTreeNodeRecord {
  runId: string;
  workflowType: string;
  workflowVersion: string;
  lifecycle: string;
  currentState: string;
  parentRunId: string | null;
  startedAt: string;
  endedAt: string | null;
}

export interface RunChildLinkRecord {
  parentRunId: string;
  childRunId: string;
  parentState: string;
  createdAt: string;
  linkedByEventId: string;
}

export interface ProjectionEvent {
  sequence: number;
  eventType: string;
  timestamp: string;
  payload?: Record<string, unknown> | null;
}

export interface TransitionEdge {
  from: string;
  to: string;
  name?: string;
}

export interface RunTreeNode {
  runId: string;
  workflowType: string;
  workflowVersion: string;
  lifecycle: string;
  currentState: string;
  parentRunId: string | null;
  startedAt: string;
  endedAt: string | null;
  children: RunTreeNode[];
}

export interface DynamicOverlay {
  runId: string;
  activeNode: string;
  traversedEdges: TransitionEdge[];
  pendingEdges: TransitionEdge[];
  failedEdges: TransitionEdge[];
  childGraphLinks: Array<{
    parentRunId: string;
    childRunId: string;
    parentState: string;
    createdAt: string;
    linkedByEventId: string;
  }>;
  transitionTimeline: Array<{
    sequence: number;
    eventType: string;
    timestamp: string;
    from?: string;
    to?: string;
    name?: string;
  }>;
}

export const projectRunTree = (
  rootRunId: string,
  nodes: RunTreeNodeRecord[],
  links: RunChildLinkRecord[],
): RunTreeNode => {
  const nodeById = new Map<string, RunTreeNode>(
    nodes.map((node) => [
      node.runId,
      {
        runId: node.runId,
        workflowType: node.workflowType,
        workflowVersion: node.workflowVersion,
        lifecycle: node.lifecycle,
        currentState: node.currentState,
        parentRunId: node.parentRunId,
        startedAt: node.startedAt,
        endedAt: node.endedAt,
        children: [],
      },
    ]),
  );

  for (const link of links) {
    const parent = nodeById.get(link.parentRunId);
    const child = nodeById.get(link.childRunId);

    if (!parent || !child) {
      continue;
    }

    parent.children.push(child);
  }

  const root = nodeById.get(rootRunId);
  if (!root) {
    throw new Error(`Root run ${rootRunId} is not present in projection nodes`);
  }

  return root;
};

const asTransitionEdge = (payload: Record<string, unknown> | null | undefined): TransitionEdge => ({
  from: typeof payload?.from === 'string' ? payload.from : '',
  to: typeof payload?.to === 'string' ? payload.to : '',
  name: typeof payload?.name === 'string' ? payload.name : undefined,
});

export const buildDynamicOverlay = (params: {
  runId: string;
  activeNode: string;
  events: ProjectionEvent[];
  transitions: TransitionEdge[];
  childLinks: RunChildLinkRecord[];
}): DynamicOverlay => {
  const traversedEdges = params.events
    .filter((event) => event.eventType === 'transition.completed')
    .map((event) => asTransitionEdge(event.payload))
    .filter((edge) => edge.from && edge.to);

  const failedEdges = params.events
    .filter((event) => event.eventType === 'transition.failed')
    .map((event) => asTransitionEdge(event.payload))
    .filter((edge) => edge.from && edge.to);

  const traversedKeys = new Set(traversedEdges.map((edge) => `${edge.from}->${edge.to}`));
  const failedKeys = new Set(failedEdges.map((edge) => `${edge.from}->${edge.to}`));

  const pendingEdges = params.transitions.filter((edge) => {
    const key = `${edge.from}->${edge.to}`;
    return !traversedKeys.has(key) && !failedKeys.has(key);
  });

  const transitionTimeline = params.events
    .filter(
      (event) =>
        event.eventType.startsWith('transition.') ||
        event.eventType === 'state.entered' ||
        event.eventType.startsWith('workflow.'),
    )
    .map((event) => ({
      sequence: event.sequence,
      eventType: event.eventType,
      timestamp: event.timestamp,
      from: typeof event.payload?.from === 'string' ? event.payload.from : undefined,
      to: typeof event.payload?.to === 'string' ? event.payload.to : undefined,
      name: typeof event.payload?.name === 'string' ? event.payload.name : undefined,
    }));

  return {
    runId: params.runId,
    activeNode: params.activeNode,
    traversedEdges,
    pendingEdges,
    failedEdges,
    childGraphLinks: params.childLinks.map((link) => ({
      parentRunId: link.parentRunId,
      childRunId: link.childRunId,
      parentState: link.parentState,
      createdAt: link.createdAt,
      linkedByEventId: link.linkedByEventId,
    })),
    transitionTimeline,
  };
};
