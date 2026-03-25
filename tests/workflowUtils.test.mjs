import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractInlineCodeActions,
  formatWorkflowExpression,
  setNestedValue,
  updateWorkflowInlineCode,
} from '../src/utils/workflowUtils.mjs';

test('extractInlineCodeActions finds nested inline code actions across workflow branches', () => {
  const workflow = {
    definition: {
      actions: {
        ScopeA: {
          type: 'Scope',
          actions: {
            InlineOne: {
              type: 'ExecuteJavaScriptCode',
              inputs: { code: 'return 1;' },
            },
          },
          else: {
            actions: {
              InlineElse: {
                type: 'ExecuteJavaScriptCode',
                inputs: { code: 'return 2;' },
              },
            },
          },
          cases: {
            Success: {
              actions: {
                InlineCase: {
                  type: 'ExecuteJavaScriptCode',
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

test('updateWorkflowInlineCode updates a nested action path in place', () => {
  const workflow = {
    definition: {
      actions: {
        ScopeA: {
          type: 'Scope',
          actions: {
            InlineOne: {
              type: 'ExecuteJavaScriptCode',
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

test('updateWorkflowInlineCode returns false when path cannot be resolved', () => {
  const workflow = { definition: { actions: {} } };
  assert.equal(updateWorkflowInlineCode(workflow, ['Missing', 'Action'], 'return 1;'), false);
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
