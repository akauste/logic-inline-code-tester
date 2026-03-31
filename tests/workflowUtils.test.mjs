import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collectInlineCodeActionsFromMap,
  extractInlineCodeActions,
  formatWorkflowExpression,
  getChildActionMap,
  getRootActions,
  setNestedValue,
  updateWorkflowInlineCode,
} from '../src/utils/workflowUtils.mjs';

test('collectInlineCodeActionsFromMap ignores malformed entries without crashing', () => {
  const found = collectInlineCodeActionsFromMap({
    Good: {
      type: 'JavaScriptCode',
      inputs: { code: 'return 1;' },
    },
    MissingCode: {
      type: 'JavaScriptCode',
      inputs: {},
    },
    BadEntry: null,
  });

  assert.deepEqual(found.map((entry) => entry.name), ['Good']);
});

test('extractInlineCodeActions finds nested inline code actions across workflow branches', () => {
  const workflow = {
    definition: {
      actions: {
        ScopeA: {
          type: 'Scope',
          actions: {
            InlineOne: {
              type: 'JavaScriptCode',
              inputs: { code: 'return 1;' },
            },
          },
          else: {
            actions: {
              InlineElse: {
                type: 'JavaScriptCode',
                inputs: { code: 'return 2;' },
              },
            },
          },
          cases: {
            Success: {
              actions: {
                InlineCase: {
                  type: 'JavaScriptCode',
                  inputs: { code: 'return 3;' },
                },
              },
            },
          },
        },
      },
    },
  };

  const actions = extractInlineCodeActions(workflow);
  assert.deepEqual(
    actions.map((entry) => entry.name),
    ['ScopeA / InlineOne', 'ScopeA / Else / InlineElse', 'ScopeA / Success / InlineCase']
  );
});

test('extractInlineCodeActions supports root actions outside definition and returns empty for invalid workflow', () => {
  const workflow = {
    actions: {
      InlineRoot: {
        type: 'JavaScriptCode',
        inputs: { code: 'return 1;' },
      },
    },
  };

  assert.deepEqual(extractInlineCodeActions(workflow).map((entry) => entry.name), ['InlineRoot']);
  assert.deepEqual(extractInlineCodeActions(null), []);
});

test('getRootActions and getChildActionMap cover alternate branch types', () => {
  const action = {
    default: {
      actions: {
        InlineDefault: {
          type: 'JavaScriptCode',
          inputs: { code: 'return "default";' },
        },
      },
    },
    cases: {
      Success: {
        actions: {
          InlineCase: {
            type: 'JavaScriptCode',
            inputs: { code: 'return "case";' },
          },
        },
      },
    },
  };

  assert.equal(getRootActions({ actions: { A: {} } }).A !== undefined, true);
  assert.equal(getRootActions({ notActions: {} }), null);
  assert.deepEqual(Object.keys(getChildActionMap(action, 'Default')), ['InlineDefault']);
  assert.deepEqual(Object.keys(getChildActionMap(action, 'Success')), ['InlineCase']);
  assert.equal(getChildActionMap(action, 'Missing'), null);
  assert.equal(getChildActionMap(null, 'Else'), null);
});

test('updateWorkflowInlineCode updates a nested action path in place', () => {
  const workflow = {
    definition: {
      actions: {
        ScopeA: {
          type: 'Scope',
          actions: {
            InlineOne: {
              type: 'JavaScriptCode',
              inputs: { code: 'return 1;' },
            },
          },
        },
      },
    },
  };

  const updated = updateWorkflowInlineCode(workflow, ['ScopeA', 'InlineOne'], 'return 99;');
  assert.equal(updated, true);
  assert.equal(workflow.definition.actions.ScopeA.actions.InlineOne.inputs.code, 'return 99;');
});

test('updateWorkflowInlineCode updates default and case branch actions and creates missing inputs', () => {
  const workflow = {
    definition: {
      actions: {
        ScopeA: {
          type: 'Scope',
          default: {
            actions: {
              InlineDefault: {
                type: 'JavaScriptCode',
              },
            },
          },
          cases: {
            Success: {
              actions: {
                InlineCase: {
                  type: 'JavaScriptCode',
                  inputs: { code: 'return 1;' },
                },
              },
            },
          },
        },
      },
    },
  };

  assert.equal(updateWorkflowInlineCode(workflow, ['ScopeA', 'Default', 'InlineDefault'], 'return "d";'), true);
  assert.equal(updateWorkflowInlineCode(workflow, ['ScopeA', 'Success', 'InlineCase'], 'return "c";'), true);
  assert.equal(workflow.definition.actions.ScopeA.default.actions.InlineDefault.inputs.code, 'return "d";');
  assert.equal(workflow.definition.actions.ScopeA.cases.Success.actions.InlineCase.inputs.code, 'return "c";');
});

test('updateWorkflowInlineCode returns false when path cannot be resolved', () => {
  const workflow = { definition: { actions: {} } };
  assert.equal(updateWorkflowInlineCode(workflow, ['Missing', 'Action'], 'return 1;'), false);
  assert.equal(updateWorkflowInlineCode(workflow, [], 'return 1;'), false);
  assert.equal(updateWorkflowInlineCode({ definition: { actions: { A: { type: 'Scope' } } } }, ['A', 'Child'], 'x'), false);
});

test('formatWorkflowExpression uses dot and bracket notation correctly', () => {
  assert.equal(
    formatWorkflowExpression(['actions', 'Send Email', 'outputs', 'body']),
    'workflowContext.actions["Send Email"].outputs.body'
  );
});

test('setNestedValue creates missing objects along the path', () => {
  const target = {};
  setNestedValue(target, ['actions', 'Compose', 'outputs', 'body'], { value: 3 });
  assert.deepEqual(target, {
    actions: {
      Compose: {
        outputs: {
          body: { value: 3 },
        },
      },
    },
  });
});

test('setNestedValue replaces array intermediates with objects when needed', () => {
  const target = { actions: [] };
  setNestedValue(target, ['actions', 'Compose', 'outputs'], { value: 1 });
  assert.deepEqual(target, {
    actions: {
      Compose: {
        outputs: { value: 1 },
      },
    },
  });
});
