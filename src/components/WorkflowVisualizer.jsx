import React, { useEffect, useMemo, useRef, useState } from 'react';

const NODE_WIDTH = 180;
const NODE_HEIGHT = 72;
const COLUMN_GAP = 30;
const ROW_GAP = 42;
const SVG_PADDING_X = 24;
const SVG_PADDING_Y = 24;
const SVG_VIEWPORT_MARGIN = 18;

function getRootActions(logicApp) {
  if (logicApp?.definition?.actions && typeof logicApp.definition.actions === 'object') {
    return logicApp.definition.actions;
  }

  if (logicApp?.actions && typeof logicApp.actions === 'object') {
    return logicApp.actions;
  }

  return null;
}

function getRootTriggers(logicApp) {
  if (logicApp?.definition?.triggers && typeof logicApp.definition.triggers === 'object') {
    return logicApp.definition.triggers;
  }

  if (logicApp?.triggers && typeof logicApp.triggers === 'object') {
    return logicApp.triggers;
  }

  return null;
}

function isSamePath(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
  return left.every((part, index) => part === right[index]);
}

function buildNodeRecord({ id, name, type, path = null, isInline = false, kind = 'action' }) {
  return { id, name, type, path, isInline, kind, order: 0 };
}

function buildWorkflowGraph({ importedWorkflow, workflowContext }) {
  const nodes = [];
  const edges = [];
  const nodeMap = new Map();
  let order = 0;

  function addNode(node) {
    node.order = order;
    order += 1;
    nodes.push(node);
    nodeMap.set(node.id, node);
    return node;
  }

  function addEdge(from, to) {
    const id = `${from}->${to}`;
    if (!edges.some((edge) => edge.id === id)) {
      edges.push({ id, from, to });
    }
  }

  function addActionMap(actionMap, anchorId, prefix = [], source = 'workflow') {
    if (!actionMap || typeof actionMap !== 'object') return;

    const localIds = new Map();
    for (const [actionName, action] of Object.entries(actionMap)) {
      const path = [...prefix, actionName];
      const node = addNode(
        buildNodeRecord({
          id: path.join('/'),
          name: actionName,
          type: action?.type || (source === 'mock' ? 'Mocked Action' : 'Action'),
          path,
          isInline: action?.type === 'ExecuteJavaScriptCode',
          kind: 'action',
        })
      );
      localIds.set(actionName, { node, action, path });
    }

    for (const [actionName, entry] of localIds.entries()) {
      const dependencies =
        entry.action?.runAfter && typeof entry.action.runAfter === 'object'
          ? Object.keys(entry.action.runAfter)
          : [];
      const resolvedDependencies = dependencies
        .map((dependencyName) => localIds.get(dependencyName)?.node?.id)
        .filter(Boolean);

      if (resolvedDependencies.length > 0) {
        resolvedDependencies.forEach((dependencyId) => addEdge(dependencyId, entry.node.id));
      } else if (anchorId) {
        addEdge(anchorId, entry.node.id);
      }
    }

    for (const entry of localIds.values()) {
      if (entry.action?.actions && typeof entry.action.actions === 'object') {
        addActionMap(entry.action.actions, entry.node.id, entry.path, source);
      }

      if (entry.action?.else?.actions && typeof entry.action.else.actions === 'object') {
        addActionMap(entry.action.else.actions, entry.node.id, [...entry.path, 'Else'], source);
      }

      if (entry.action?.default?.actions && typeof entry.action.default.actions === 'object') {
        addActionMap(entry.action.default.actions, entry.node.id, [...entry.path, 'Default'], source);
      }

      if (entry.action?.cases && typeof entry.action.cases === 'object') {
        for (const [caseName, caseEntry] of Object.entries(entry.action.cases)) {
          if (caseEntry?.actions && typeof caseEntry.actions === 'object') {
            addActionMap(caseEntry.actions, entry.node.id, [...entry.path, caseName], source);
          }
        }
      }
    }
  }

  if (importedWorkflow) {
    const triggers = getRootTriggers(importedWorkflow);
    const rootActions = getRootActions(importedWorkflow);

    const triggerIds =
      triggers && Object.keys(triggers).length > 0
        ? Object.entries(triggers).map(([name, trigger]) =>
            addNode(
              buildNodeRecord({
                id: `trigger/${name}`,
                name,
                type: trigger?.type || 'Trigger',
                kind: 'trigger',
              })
            ).id
          )
        : [
            addNode(
              buildNodeRecord({
                id: 'trigger/workflow-start',
                name: 'Workflow Start',
                type: 'Trigger',
                kind: 'trigger',
              })
            ).id,
          ];

    addActionMap(rootActions, triggerIds[0], [], 'workflow');
  } else {
    const triggerId = addNode(
      buildNodeRecord({
        id: 'trigger/mock-trigger',
        name: workflowContext?.trigger?.name || 'Trigger',
        type: 'Mock Trigger',
        kind: 'trigger',
      })
    ).id;

    addActionMap(
      workflowContext?.actions && typeof workflowContext.actions === 'object' ? workflowContext.actions : {},
      triggerId,
      [],
      'mock'
    );
  }

  return { nodes, edges, nodeMap };
}

function layoutGraph(graph, selectedActionPath) {
  const nodeMap = new Map(graph.nodes.map((node) => [node.id, { ...node, incoming: [], outgoing: [] }]));
  for (const edge of graph.edges) {
    const fromNode = nodeMap.get(edge.from);
    const toNode = nodeMap.get(edge.to);
    if (!fromNode || !toNode) continue;
    fromNode.outgoing.push(edge.to);
    toNode.incoming.push(edge.from);
  }

  const incomingCounts = new Map();
  for (const node of nodeMap.values()) {
    incomingCounts.set(node.id, node.incoming.length);
  }

  const queue = Array.from(nodeMap.values())
    .filter((node) => node.incoming.length === 0)
    .sort((left, right) => left.order - right.order);

  const orderedNodes = [];
  while (queue.length > 0) {
    const current = queue.shift();
    orderedNodes.push(current);
    const outgoingSorted = [...current.outgoing].sort(
      (left, right) => (nodeMap.get(left)?.order || 0) - (nodeMap.get(right)?.order || 0)
    );
    for (const nextId of outgoingSorted) {
      const nextCount = (incomingCounts.get(nextId) || 0) - 1;
      incomingCounts.set(nextId, nextCount);
      if (nextCount === 0) {
        queue.push(nodeMap.get(nextId));
      }
    }
  }

  for (const node of orderedNodes) {
    if (node.incoming.length === 0) {
      node.level = 0;
    } else {
      node.level = Math.max(...node.incoming.map((id) => nodeMap.get(id)?.level || 0)) + 1;
    }
    node.isSelected = isSamePath(node.path, selectedActionPath);
  }

  const levels = new Map();
  for (const node of orderedNodes) {
    const bucket = levels.get(node.level) || [];
    bucket.push(node);
    levels.set(node.level, bucket);
  }

  let maxRows = 0;
  for (const bucket of levels.values()) {
    bucket.sort((left, right) => {
      const leftParents = left.incoming.map((id) => nodeMap.get(id)?.row ?? 0);
      const rightParents = right.incoming.map((id) => nodeMap.get(id)?.row ?? 0);
      const leftScore = leftParents.length > 0 ? leftParents.reduce((sum, value) => sum + value, 0) / leftParents.length : left.order;
      const rightScore = rightParents.length > 0 ? rightParents.reduce((sum, value) => sum + value, 0) / rightParents.length : right.order;
      return leftScore - rightScore || left.order - right.order;
    });
    bucket.forEach((node, index) => {
      node.row = index;
      node.x = index * (NODE_WIDTH + COLUMN_GAP);
      node.y = node.level * (NODE_HEIGHT + ROW_GAP);
    });
    maxRows = Math.max(maxRows, bucket.length);
  }

  const maxLevel = Math.max(...Array.from(levels.keys()), 0);
  const width = Math.max(1, maxRows) * NODE_WIDTH + Math.max(0, maxRows - 1) * COLUMN_GAP + SVG_PADDING_X * 2;
  const height = (maxLevel + 1) * NODE_HEIGHT + maxLevel * ROW_GAP + SVG_PADDING_Y * 2;

  const laidOutEdges = graph.edges.map((edge) => {
    const fromNode = nodeMap.get(edge.from);
    const toNode = nodeMap.get(edge.to);
    return {
      ...edge,
      fromX: fromNode.x + NODE_WIDTH / 2,
      fromY: fromNode.y + NODE_HEIGHT,
      toX: toNode.x + NODE_WIDTH / 2,
      toY: toNode.y,
    };
  });

  const positionedNodes = orderedNodes.map((node) => ({
    ...node,
    x: node.x,
    y: node.y,
  }));

  const minX = Math.min(...positionedNodes.map((node) => node.x), 0) - SVG_VIEWPORT_MARGIN;
  const minY = Math.min(...positionedNodes.map((node) => node.y), 0) - SVG_VIEWPORT_MARGIN;
  const maxX =
    Math.max(...positionedNodes.map((node) => node.x + NODE_WIDTH), 0) + SVG_VIEWPORT_MARGIN;
  const maxY =
    Math.max(...positionedNodes.map((node) => node.y + NODE_HEIGHT), 0) + SVG_VIEWPORT_MARGIN;

  return {
    nodes: positionedNodes,
    edges: laidOutEdges,
    width: maxX - minX + SVG_PADDING_X * 2,
    height: maxY - minY + SVG_PADDING_Y * 2,
    offsetX: SVG_PADDING_X - minX,
    offsetY: SVG_PADDING_Y - minY,
    hasContent: orderedNodes.length > 0,
  };
}

function splitLabel(text, maxChars = 20) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  if (words.length === 0) return ['Untitled'];

  const lines = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars || current.length === 0) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
    if (lines.length === 2) break;
  }

  if (current && lines.length < 2) lines.push(current);
  if (lines.length === 2 && words.join(' ').length > lines.join(' ').length) {
    lines[1] = lines[1].length > maxChars - 1 ? `${lines[1].slice(0, maxChars - 1)}…` : `${lines[1]}…`;
  }
  return lines;
}

function renderEdge(edge) {
  const midY = edge.fromY + (edge.toY - edge.fromY) / 2;
  const path = `M ${edge.fromX} ${edge.fromY} C ${edge.fromX} ${midY}, ${edge.toX} ${midY}, ${edge.toX} ${edge.toY}`;
  return <path key={edge.id} d={path} className="workflow-svg-edge" fill="none" />;
}

function renderNode(node) {
  const titleLines = splitLabel(node.name, 18);
  const isTrigger = node.kind === 'trigger';

  return (
    <g key={node.id} transform={`translate(${node.x}, ${node.y})`} className="workflow-svg-node-group">
      <rect
        x="0"
        y="0"
        width={NODE_WIDTH}
        height={NODE_HEIGHT}
        rx={16}
        className={[
          'workflow-svg-node',
          isTrigger ? 'workflow-svg-node-trigger' : '',
          node.isInline ? 'workflow-svg-node-inline' : '',
          node.isSelected ? 'workflow-svg-node-selected' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      />

      <text x="16" y="24" className="workflow-svg-title">
        {titleLines.map((line, index) => (
          <tspan key={`${node.id}-title-${index}`} x="16" dy={index === 0 ? 0 : 15}>
            {line}
          </tspan>
        ))}
      </text>

      <text x="16" y="58" className="workflow-svg-meta">
        {node.type}
        {node.isSelected ? ' • Selected' : node.isInline ? ' • Inline JS' : ''}
      </text>
    </g>
  );
}

export function WorkflowVisualizer({ importedWorkflow, parsedWorkflowContext, parseError, selectedActionPath }) {
  const shellRef = useRef(null);
  const dragStateRef = useRef(null);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const graph = useMemo(
    () =>
      layoutGraph(
        buildWorkflowGraph({ importedWorkflow, workflowContext: parsedWorkflowContext || {} }),
        selectedActionPath
      ),
    [importedWorkflow, parsedWorkflowContext, selectedActionPath]
  );

  useEffect(() => {
    const element = shellRef.current;
    if (!element) return undefined;

    const updateSize = () => {
      setViewportSize({
        width: element.clientWidth,
        height: element.clientHeight,
      });
    };

    updateSize();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateSize);
      return () => window.removeEventListener('resize', updateSize);
    }

    const observer = new ResizeObserver(() => updateSize());
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const fitScale = useMemo(() => {
    if (!viewportSize.width || !viewportSize.height || !graph.width || !graph.height) return 1;
    return Math.min(viewportSize.width / graph.width, viewportSize.height / graph.height);
  }, [graph.height, graph.width, viewportSize.height, viewportSize.width]);

  useEffect(() => {
    const nextZoom = Number.isFinite(fitScale) && fitScale > 0 ? fitScale : 1;
    setZoom(nextZoom);
    setPan({ x: 0, y: 0 });
  }, [fitScale, graph.height, graph.width]);

  function clampZoom(nextZoom) {
    return Math.max(0.35, Math.min(2.5, nextZoom));
  }

  function zoomBy(multiplier) {
    setZoom((currentZoom) => clampZoom(currentZoom * multiplier));
  }

  function resetViewport() {
    setZoom(clampZoom(fitScale || 1));
    setPan({ x: 0, y: 0 });
  }

  function beginPan(event) {
    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startPanX: pan.x,
      startPanY: pan.y,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function continuePan(event) {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    setPan({
      x: dragState.startPanX + (event.clientX - dragState.startX),
      y: dragState.startPanY + (event.clientY - dragState.startY),
    });
  }

  function endPan(event) {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    dragStateRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }

  function handleWheel(event) {
    event.preventDefault();
    const multiplier = event.deltaY < 0 ? 1.08 : 1 / 1.08;
    setZoom((currentZoom) => clampZoom(currentZoom * multiplier));
  }

  const viewportTransform = `translate(${pan.x}, ${pan.y}) scale(${zoom})`;

  return (
    <section className="workflow-visualizer">
      <div className="workflow-header">
        <div>
          <div className="panel-title">Workflow Map</div>
          <div className="workflow-caption">
            {importedWorkflow
              ? 'SVG workflow diagram from the imported definition, with the selected inline action highlighted.'
              : 'SVG workflow diagram built from the current mocked workflowContext.'}
          </div>
        </div>
        <div className="workflow-legend">
          <span className="workflow-legend-pill">Trigger / Action</span>
          <span className="workflow-legend-pill workflow-legend-pill-inline">Inline JS</span>
          <span className="workflow-legend-pill workflow-legend-pill-selected">Selected</span>
        </div>
        <div className="workflow-toolbar">
          <button type="button" className="workflow-tool-button" onClick={() => zoomBy(1 / 1.12)}>
            -
          </button>
          <button type="button" className="workflow-tool-button" onClick={() => zoomBy(1.12)}>
            +
          </button>
          <button type="button" className="workflow-tool-button workflow-tool-button-wide" onClick={resetViewport}>
            Reset
          </button>
        </div>
      </div>

      {parseError && !importedWorkflow ? (
        <div className="workflow-empty-state workflow-empty-state-error">
          Fix the <code>workflowContext</code> JSON to preview the mocked workflow structure.
        </div>
      ) : !graph.hasContent ? (
        <div className="workflow-empty-state">No workflow nodes found yet.</div>
      ) : (
        <div
          ref={shellRef}
          className="workflow-svg-shell"
          onPointerDown={beginPan}
          onPointerMove={continuePan}
          onPointerUp={endPan}
          onPointerLeave={endPan}
          onWheel={handleWheel}
        >
          <svg
            className="workflow-svg-canvas"
            viewBox={`0 0 ${graph.width} ${graph.height}`}
            role="img"
            aria-label="Workflow diagram"
            preserveAspectRatio="xMinYMin meet"
          >
            <g transform={viewportTransform}>
              <g transform={`translate(${graph.offsetX}, ${graph.offsetY})`}>
                {graph.edges.map((edge) => renderEdge(edge))}
                {graph.nodes.map((node) => renderNode(node))}
              </g>
            </g>
          </svg>
        </div>
      )}
    </section>
  );
}
