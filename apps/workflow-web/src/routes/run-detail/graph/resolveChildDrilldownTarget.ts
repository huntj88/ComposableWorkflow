import type {
  RunEventsResponse,
  RunTreeNode,
  RunTreeResponse,
} from '@composable-workflow/workflow-api-types';

export type ChildLaunchAnnotation = {
  parentState: string;
  childWorkflowType: string;
  raw: Record<string, unknown>;
};

export type ChildDrilldownTarget =
  | {
      kind: 'run';
      path: string;
      runId: string;
      childWorkflowType: string;
      lifecycle: string;
    }
  | {
      kind: 'definition';
      path: string;
      workflowType: string;
      reason: 'annotation-only' | 'missing-runtime-match' | 'missing-iteration';
    };

type DefinitionTargetReason = 'annotation-only' | 'missing-runtime-match' | 'missing-iteration';

export type ChildLaunchIteration = {
  iteration: number;
  sequence: number;
  timestamp: string;
  childRunId: string | null;
  childWorkflowType: string;
  lifecycle: string;
  target: ChildDrilldownTarget;
};

export const asChildLaunchAnnotation = (
  annotation: Record<string, unknown>,
): ChildLaunchAnnotation | null => {
  const parentState =
    typeof annotation.parentState === 'string' ? annotation.parentState : undefined;
  const childWorkflowType =
    typeof annotation.childWorkflowType === 'string' ? annotation.childWorkflowType : undefined;

  if (!parentState || !childWorkflowType) {
    return null;
  }

  return {
    parentState,
    childWorkflowType,
    raw: annotation,
  };
};

export const findRunTreeNode = (root: RunTreeNode, runId: string): RunTreeNode | null => {
  if (root.runId === runId) {
    return root;
  }

  for (const child of root.children) {
    const match = findRunTreeNode(child, runId);
    if (match) {
      return match;
    }
  }

  return null;
};

const toRunTarget = (node: RunTreeNode): ChildDrilldownTarget => ({
  kind: 'run',
  path: `/runs/${encodeURIComponent(node.runId)}`,
  runId: node.runId,
  childWorkflowType: node.workflowType,
  lifecycle: node.lifecycle,
});

const toDefinitionTarget = (
  workflowType: string,
  reason: DefinitionTargetReason,
): ChildDrilldownTarget => ({
  kind: 'definition',
  path: `/definitions/${encodeURIComponent(workflowType)}`,
  workflowType,
  reason,
});

const getLinkedRuntimeChildren = (
  tree: RunTreeResponse | null,
  annotation: ChildLaunchAnnotation,
): RunTreeNode[] => {
  if (!tree) {
    return [];
  }

  const linkedChildren = tree.overlay.childGraphLinks
    .filter(
      (link) => link.parentRunId === tree.tree.runId && link.parentState === annotation.parentState,
    )
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    .map((link) => findRunTreeNode(tree.tree, link.childRunId))
    .filter(
      (node): node is RunTreeNode =>
        node !== null && node.workflowType === annotation.childWorkflowType,
    );

  if (linkedChildren.length > 0) {
    return linkedChildren;
  }

  return tree.tree.children
    .filter((child) => child.workflowType === annotation.childWorkflowType)
    .sort((left, right) => left.startedAt.localeCompare(right.startedAt));
};

export const collectChildLaunchIterations = (params: {
  annotation: ChildLaunchAnnotation;
  tree: RunTreeResponse | null;
  events: RunEventsResponse | null;
}): ChildLaunchIteration[] => {
  const { annotation, tree, events } = params;
  const runtimeChildrenByRunId = new Map<string, RunTreeNode>();

  if (tree) {
    const linkedChildren = getLinkedRuntimeChildren(tree, annotation);
    for (const child of linkedChildren) {
      runtimeChildrenByRunId.set(child.runId, child);
    }
  }

  const eventIterations = (events?.items ?? [])
    .filter(
      (event) =>
        event.eventType === 'child.started' &&
        event.state === annotation.parentState &&
        event.child?.childWorkflowType === annotation.childWorkflowType,
    )
    .sort((left, right) => left.sequence - right.sequence)
    .map((event, index) => {
      const childRunId = event.child?.childRunId ?? null;
      const matchedNode = childRunId ? (runtimeChildrenByRunId.get(childRunId) ?? null) : null;
      const target = matchedNode
        ? toRunTarget(matchedNode)
        : toDefinitionTarget(annotation.childWorkflowType, 'missing-iteration');

      return {
        iteration: index + 1,
        sequence: event.sequence,
        timestamp: event.timestamp,
        childRunId,
        childWorkflowType: annotation.childWorkflowType,
        lifecycle: matchedNode?.lifecycle ?? event.child?.lifecycle ?? 'missing',
        target,
      } satisfies ChildLaunchIteration;
    });

  if (eventIterations.length > 0) {
    return eventIterations;
  }

  return getLinkedRuntimeChildren(tree, annotation).map((child, index) => ({
    iteration: index + 1,
    sequence: index + 1,
    timestamp: child.startedAt,
    childRunId: child.runId,
    childWorkflowType: child.workflowType,
    lifecycle: child.lifecycle,
    target: toRunTarget(child),
  }));
};

export const resolveChildDrilldownTarget = (params: {
  annotation: ChildLaunchAnnotation;
  tree: RunTreeResponse | null;
  events: RunEventsResponse | null;
  iteration?: number;
}): ChildDrilldownTarget => {
  const { annotation, tree, events, iteration } = params;
  const iterations = collectChildLaunchIterations({ annotation, tree, events });

  if (typeof iteration === 'number') {
    const matched = iterations.find((candidate) => candidate.iteration === iteration);
    return matched?.target ?? toDefinitionTarget(annotation.childWorkflowType, 'missing-iteration');
  }

  if (iterations.length === 1) {
    return iterations[0].target;
  }

  if (iterations.length > 1) {
    return iterations[0].target;
  }

  const runtimeChildren = getLinkedRuntimeChildren(tree, annotation);
  if (runtimeChildren.length > 0) {
    return toRunTarget(runtimeChildren[0]);
  }

  return toDefinitionTarget(annotation.childWorkflowType, 'annotation-only');
};
