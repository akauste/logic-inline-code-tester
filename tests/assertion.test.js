const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');

const PORT = 3111;
const BASE_URL = `http://127.0.0.1:${PORT}`;

let serverProc = null;

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

async function waitForServerReady(timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const resp = await fetch(`${BASE_URL}/`);
      if (resp.ok) return;
    } catch {
      // Keep polling until timeout.
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  throw new Error('Server did not become ready in time.');
}

test.before(async () => {
  serverProc = spawn('node', ['server.js'], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'pipe',
    cwd: process.cwd(),
  });

  await waitForServerReady();
});

test.after(() => {
  if (serverProc && !serverProc.killed) {
    serverProc.kill('SIGTERM');
  }
});

test('assertion passes when condition is true', async () => {
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

  const resp = await fetch(`${BASE_URL}/api/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code,
      workflowContext,
      timeoutMs: 1000,
    }),
  });
  assert.equal(resp.ok, true);

  const payload = await resp.json();
  assert.equal(payload.ok, true);
  assert.deepEqual(payload.resultValue, ['test@example.com']);

  const assertion = evaluateAssertion({
    assertionText: 'Array.isArray(result) && result.length === 1',
    resultValue: payload.resultValue,
    workflowContext,
  });
  assert.equal(assertion.hasAssertion, true);
  assert.equal(assertion.passed, true);
});

test('assertion fails when condition is false', async () => {
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

  const resp = await fetch(`${BASE_URL}/api/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code,
      workflowContext,
      timeoutMs: 1000,
    }),
  });
  assert.equal(resp.ok, true);

  const payload = await resp.json();
  assert.equal(payload.ok, true);
  assert.deepEqual(payload.resultValue, []);

  const assertion = evaluateAssertion({
    assertionText: 'Array.isArray(result) && result.length > 0',
    resultValue: payload.resultValue,
    workflowContext,
  });
  assert.equal(assertion.hasAssertion, true);
  assert.equal(assertion.passed, false);
});

