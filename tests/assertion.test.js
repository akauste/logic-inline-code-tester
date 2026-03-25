const test = require('node:test');
const assert = require('node:assert/strict');
const { assert: chaiAssert, expect: chaiExpect } = require('chai');
const { runInlineSnippet, toJsonSafeValue } = require('./runInlineSnippet.js');

// Define the default constants directly for testing
const DEFAULT_CODE = `// action-name: Inline Code
// Example: read both trigger output and a prior HTTP action output.
// Tip: Logic Apps Standard inline code reads values from workflowContext.
const triggerText =
  workflowContext?.trigger?.outputs?.body?.Body ??
  "";

const httpStatus =
  workflowContext?.actions?.Get_user_profile?.outputs?.body?.status ??
  "unknown";

return {
  triggerText,
  httpStatus,
};`;

const DEFAULT_WORKFLOW_CONTEXT = `{
  "actions": {
    "Get_user_profile": {
      "outputs": {
        "headers": {},
        "body": {
          "status": "active",
          "displayName": "Ada Lovelace"
        }
      }
    }
  },
  "trigger": {
    "name": "When_a_new_email_arrives",
    "outputs": {
      "headers": {},
      "body": {
        "Body": "Hello World. Contact me at test@example.com and user2@domain.org"
      }
    }
  },
  "workflow": {
    "name": "My_logic_app"
  }
}`;

const DEFAULT_ASSERTION = `result?.triggerText?.includes("test@example.com") && result?.httpStatus === "active"`;

function evaluateAssertion({ assertionLibrary = 'expression', assertionText, resultValue, workflowContext }) {
  const text = (assertionText || '').trim();
  if (!text) {
    return { hasAssertion: false, passed: null };
  }

  if (assertionLibrary === 'assert') {
    const fn = new Function('result', 'workflowContext', 'assert', `"use strict";\n${text}\nreturn true;`);
    return {
      hasAssertion: true,
      passed: fn(resultValue, workflowContext, chaiAssert) !== false,
      actual: true,
    };
  }

  if (assertionLibrary === 'expect') {
    const fn = new Function('result', 'workflowContext', 'expect', `"use strict";\n${text}\nreturn true;`);
    return {
      hasAssertion: true,
      passed: fn(resultValue, workflowContext, chaiExpect) !== false,
      actual: true,
    };
  }

  const fn = new Function('result', 'workflowContext', `"use strict"; return (${text});`);
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

test('assert library assertions can pass', () => {
  const workflowContext = { trigger: { outputs: { body: { Body: 'hello' } } } };
  const rawResult = runInlineSnippet('return { count: 2, items: ["a", "b"] };', workflowContext);
  const resultValue = toJsonSafeValue(rawResult);
  const assertion = evaluateAssertion({
    assertionLibrary: 'assert',
    assertionText: 'assert.equal(result.count, 2);\nassert.deepEqual(result.items, ["a", "b"]);',
    resultValue,
    workflowContext,
  });
  assert.equal(assertion.passed, true);
});

test('expect library assertions can pass', () => {
  const workflowContext = { trigger: { outputs: { body: { Body: 'hello' } } } };
  const rawResult = runInlineSnippet('return ["first", "second"];', workflowContext);
  const resultValue = toJsonSafeValue(rawResult);
  const assertion = evaluateAssertion({
    assertionLibrary: 'expect',
    assertionText: 'expect(result).to.have.lengthOf(2);\nexpect(result[0]).to.equal("first");',
    resultValue,
    workflowContext,
  });
  assert.equal(assertion.passed, true);
});

test('default constants are defined', () => {
  assert.ok(DEFAULT_CODE, 'DEFAULT_CODE should be defined');
  assert.ok(DEFAULT_WORKFLOW_CONTEXT, 'DEFAULT_WORKFLOW_CONTEXT should be defined');
  assert.ok(DEFAULT_ASSERTION, 'DEFAULT_ASSERTION should be defined');

  assert.equal(typeof DEFAULT_CODE, 'string', 'DEFAULT_CODE should be a string');
  assert.equal(typeof DEFAULT_WORKFLOW_CONTEXT, 'string', 'DEFAULT_WORKFLOW_CONTEXT should be a string');
  assert.equal(typeof DEFAULT_ASSERTION, 'string', 'DEFAULT_ASSERTION should be a string');
});

test('default code executes successfully', () => {
  const workflowContext = JSON.parse(DEFAULT_WORKFLOW_CONTEXT);
  const rawResult = runInlineSnippet(DEFAULT_CODE, workflowContext);
  const resultValue = toJsonSafeValue(rawResult);

  assert.deepEqual(resultValue, {
    triggerText: 'Hello World. Contact me at test@example.com and user2@domain.org',
    httpStatus: 'active',
  });
});

test('default assertion works with default code result', () => {
  const workflowContext = JSON.parse(DEFAULT_WORKFLOW_CONTEXT);
  const rawResult = runInlineSnippet(DEFAULT_CODE, workflowContext);
  const resultValue = toJsonSafeValue(rawResult);

  const assertion = evaluateAssertion({
    assertionText: DEFAULT_ASSERTION,
    resultValue,
    workflowContext,
  });

  assert.equal(assertion.hasAssertion, true);
  assert.equal(assertion.passed, true, 'Default assertion should pass with default code result');
});

test('default workflow context is valid JSON', () => {
  assert.doesNotThrow(() => {
    JSON.parse(DEFAULT_WORKFLOW_CONTEXT);
  }, 'DEFAULT_WORKFLOW_CONTEXT should be valid JSON');

  const parsed = JSON.parse(DEFAULT_WORKFLOW_CONTEXT);
  assert.ok(parsed.trigger, 'Should have trigger property');
  assert.ok(parsed.actions, 'Should have actions property');
  assert.ok(parsed.workflow, 'Should have workflow property');
});
