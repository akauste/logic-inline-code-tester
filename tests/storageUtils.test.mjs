import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_ASSERTION_LIBRARY,
  createDefaultCases,
  normalizeActionEntry,
  normalizeCaseEntry,
} from '../src/utils/storageUtils.mjs';

test('normalizeCaseEntry keeps legacy plain workflowContext objects compatible', () => {
  const entry = normalizeCaseEntry({ trigger: { outputs: { body: { Body: 'Hello' } } } }, 'result === 1', 'expect');
  assert.deepEqual(entry.workflowContext, { trigger: { outputs: { body: { Body: 'Hello' } } } });
  assert.equal(entry.assertion, 'result === 1');
  assert.equal(entry.assertionLibrary, 'expect');
});

test('normalizeCaseEntry falls back when entry shape is invalid', () => {
  const entry = normalizeCaseEntry(null, 'true', 'assert');
  assert.deepEqual(entry, {
    workflowContext: {},
    assertion: 'true',
    assertionLibrary: 'assert',
  });
});

test('createDefaultCases creates a usable default case', () => {
  const cases = createDefaultCases('Array.isArray(result)', DEFAULT_ASSERTION_LIBRARY);
  assert.ok(cases.default);
  assert.equal(cases.default.assertion, 'Array.isArray(result)');
  assert.equal(cases.default.assertionLibrary, DEFAULT_ASSERTION_LIBRARY);
  assert.equal(cases.default.workflowContext.workflow.name, 'My_logic_app');
});

test('normalizeActionEntry normalizes nested cases and invalid selected case names', () => {
  const action = normalizeActionEntry(
    {
      code: 'return 1;',
      selectedCaseName: 'missing',
      workflowPath: ['Scope', 42, 'Inline'],
      workflowContextCases: {
        alpha: {
          workflowContext: { trigger: { outputs: { body: { Body: 'A' } } } },
          assertion: 'result === 1',
          assertionLibrary: 'expect',
        },
      },
    },
    'return 0;',
    'true',
    'expression'
  );

  assert.equal(action.code, 'return 1;');
  assert.equal(action.selectedCaseName, 'alpha');
  assert.deepEqual(action.workflowPath, ['Scope', 'Inline']);
  assert.equal(action.workflowContextCases.alpha.assertionLibrary, 'expect');
});

test('normalizeActionEntry creates defaults for malformed action entries', () => {
  const action = normalizeActionEntry([], 'return 42;', 'result === 42', 'assert');
  assert.equal(action.code, 'return 42;');
  assert.equal(action.selectedCaseName, 'default');
  assert.ok(action.workflowContextCases.default);
  assert.equal(action.workflowContextCases.default.assertion, 'result === 42');
  assert.equal(action.workflowContextCases.default.assertionLibrary, 'assert');
});
