const path = require('path');
const express = require('express');
const vm = require('vm');
const util = require('util');

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function safeInspect(value) {
  try {
    return util.inspect(value, {
      depth: 20,
      maxArrayLength: 200,
      breakLength: 120,
      compact: false,
    });
  } catch {
    return String(value);
  }
}

function runInlineCode({ code, workflowContext, timeoutMs }) {
  const logs = [];
  const sandboxConsole = {
    log: (...args) => logs.push({ level: 'log', args }),
    info: (...args) => logs.push({ level: 'info', args }),
    warn: (...args) => logs.push({ level: 'warn', args }),
    error: (...args) => logs.push({ level: 'error', args }),
  };

  // Match the Logic Apps Standard inline code pattern:
  // - your snippet is written as a "method body"
  // - it can `return ...;`
  // - it can read `workflowContext`
  const wrapped = `(
    function () {
      "use strict";
      ${code}
    }
  )()`;

  const sandbox = {
    workflowContext,
    console: sandboxConsole,
    // Block common Node globals to keep local testing reasonably safe.
    require: undefined,
    process: undefined,
    Buffer: undefined,
    setTimeout: undefined,
    setInterval: undefined,
    clearTimeout: undefined,
    clearInterval: undefined,
  };

  const context = vm.createContext(sandbox);
  const script = new vm.Script(wrapped, { displayErrors: true });
  const start = Date.now();
  const result = script.runInContext(context, { timeout: timeoutMs });
  const executionTimeMs = Date.now() - start;

  return {
    resultInspect: safeInspect(result),
    executionTimeMs,
    logs: logs.map((l) => ({
      level: l.level,
      args: l.args.map((a) => safeInspect(a)),
    })),
  };
}

app.post('/api/run', (req, res) => {
  const code = req.body?.code;
  const workflowContext = req.body?.workflowContext;
  const timeoutMs = Number(req.body?.timeoutMs ?? 1000);

  if (typeof code !== 'string') {
    return res.status(400).json({ ok: false, error: { message: '`code` must be a string.' } });
  }

  // Allow empty / missing workflowContext so you can still prototype quickly.
  const ctx = workflowContext && typeof workflowContext === 'object' ? workflowContext : {};

  try {
    const output = runInlineCode({
      code,
      workflowContext: ctx,
      timeoutMs: Math.max(50, Math.min(5000, timeoutMs)),
    });
    return res.json({ ok: true, ...output });
  } catch (err) {
    return res.status(400).json({
      ok: false,
      error: {
        name: err?.name || 'Error',
        message: err?.message || String(err),
        stack: err?.stack,
      },
    });
  }
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Logic Inline Code Tester running at http://localhost:${port}`);
});

