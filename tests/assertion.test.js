const test = require('node:test');
const assert = require('node:assert/strict');
const { runInlineSnippet, toJsonSafeValue } = require('./runInlineSnippet.js');

function evaluateAssertion({ assertionText, resultValue, workflowContext }) {
  const text = (assertionText || '').trim();
  if (!text) {
    return { hasAssertion: false, passed: null };
  }

  const fn = new Function(
    'result',
    'workflowContext',
    `"use strict"; return (${text});`
  );
  const value = fn(resultValue, workflowContext);

  return {
    hasAssertion: true,
    passed: value === true,
    actual: value,
  };
}

test('assertion passes when condition is true', () => {
  const workflowContext = {
    trigger: {
      outputs: {
        body: {
          Body: 'Contact test@example.com',
        },
      },
    },
  };

  const code = `
    const text = workflowContext?.trigger?.outputs?.body?.Body ?? "";
    const matches = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}/ig) || [];
    return matches;
  `;

  const rawResult = runInlineSnippet(code, workflowContext);
  const resultValue = toJsonSafeValue(rawResult);
  assert.deepEqual(resultValue, ['test@example.com']);

  const assertion = evaluateAssertion({
    assertionText: 'Array.isArray(result) && result.length === 1',
    resultValue,
    workflowContext,
  });
  assert.equal(assertion.hasAssertion, true);
  assert.equal(assertion.passed, true);
});

test('assertion fails when condition is false', () => {
  const workflowContext = {
    trigger: {
      outputs: {
        body: {
          Body: 'No emails here',
        },
      },
    },
  };

  const code = `
    const text = workflowContext?.trigger?.outputs?.body?.Body ?? "";
    const matches = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}/ig) || [];
    return matches;
  `;

  const rawResult = runInlineSnippet(code, workflowContext);
  const resultValue = toJsonSafeValue(rawResult);
  assert.deepEqual(resultValue, []);

  const assertion = evaluateAssertion({
    assertionText: 'Array.isArray(result) && result.length > 0',
    resultValue,
    workflowContext,
  });
  assert.equal(assertion.hasAssertion, true);
  assert.equal(assertion.passed, false);
});
