export function collectInlineCodeActionsFromMap(actionMap, prefix = [], found = []) {
  if (!actionMap || typeof actionMap !== 'object') return found;

  for (const [actionName, action] of Object.entries(actionMap)) {
    if (!action || typeof action !== 'object') continue;

    const path = [...prefix, actionName];
    if (action.type === 'ExecuteJavaScriptCode' && typeof action.inputs?.code === 'string') {
      found.push({
        name: path.join(' / '),
        code: action.inputs.code,
        path,
      });
    }

    if (action.actions && typeof action.actions === 'object') {
      collectInlineCodeActionsFromMap(action.actions, path, found);
    }

    if (action.else?.actions && typeof action.else.actions === 'object') {
      collectInlineCodeActionsFromMap(action.else.actions, [...path, 'Else'], found);
    }

    if (action.default?.actions && typeof action.default.actions === 'object') {
      collectInlineCodeActionsFromMap(action.default.actions, [...path, 'Default'], found);
    }

    if (action.cases && typeof action.cases === 'object') {
      for (const [caseName, caseValue] of Object.entries(action.cases)) {
        if (caseValue?.actions && typeof caseValue.actions === 'object') {
          collectInlineCodeActionsFromMap(caseValue.actions, [...path, caseName], found);
        }
      }
    }
  }

  return found;
}

export function getRootActions(logicApp) {
  if (logicApp?.definition?.actions && typeof logicApp.definition.actions === 'object') {
    return logicApp.definition.actions;
  }

  if (logicApp?.actions && typeof logicApp.actions === 'object') {
    return logicApp.actions;
  }

  return null;
}

export function extractInlineCodeActions(logicApp) {
  const rootActions = getRootActions(logicApp);
  if (!rootActions) return [];
  return collectInlineCodeActionsFromMap(rootActions);
}

export function getChildActionMap(action, segment) {
  if (!action || typeof action !== 'object') return null;

  if (segment === 'Else') {
    return action.else?.actions && typeof action.else.actions === 'object' ? action.else.actions : null;
  }

  if (segment === 'Default') {
    return action.default?.actions && typeof action.default.actions === 'object' ? action.default.actions : null;
  }

  if (action.cases && typeof action.cases === 'object') {
    const caseEntry = action.cases[segment];
    if (caseEntry?.actions && typeof caseEntry.actions === 'object') {
      return caseEntry.actions;
    }
  }

  return null;
}

export function updateWorkflowInlineCode(logicApp, workflowPath, code) {
  const rootActions = getRootActions(logicApp);
  if (!rootActions || !Array.isArray(workflowPath) || workflowPath.length === 0) {
    return false;
  }

  let currentMap = rootActions;
  for (let index = 0; index < workflowPath.length; ) {
    const segment = workflowPath[index];
    const action = currentMap?.[segment];
    if (!action || typeof action !== 'object') {
      return false;
    }

    if (index === workflowPath.length - 1) {
      if (!action.inputs || typeof action.inputs !== 'object') {
        action.inputs = {};
      }
      action.inputs.code = code;
      return true;
    }

    const nextSegment = workflowPath[index + 1];
    const branchMap = getChildActionMap(action, nextSegment);
    if (branchMap) {
      currentMap = branchMap;
      index += 2;
      continue;
    }

    if (action.actions && typeof action.actions === 'object') {
      currentMap = action.actions;
      index += 1;
      continue;
    }

    return false;
  }

  return false;
}

export function formatWorkflowExpression(segments) {
  let expression = 'workflowContext';
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (index === 0 || /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(segment)) expression += `.${segment}`;
    else expression += `[${JSON.stringify(segment)}]`;
  }
  return expression;
}

export function setNestedValue(target, path, value) {
  let current = target;
  for (let index = 0; index < path.length; index += 1) {
    const segment = path[index];
    const isLeaf = index === path.length - 1;
    if (isLeaf) {
      current[segment] = value;
      return;
    }
    if (!current[segment] || typeof current[segment] !== 'object' || Array.isArray(current[segment])) {
      current[segment] = {};
    }
    current = current[segment];
  }
}
