const $ = (id) => document.getElementById(id);

const defaultCode = `// Example: extract email addresses from the trigger body
// Tip: reference data via workflowContext, matching Logic Apps Standard.
const text =
  workflowContext?.trigger?.outputs?.body?.Body ??
  workflowContext?.trigger?.outputs?.body?.body ??
  "";

const myRegex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}/ig;
const matches = (text.match(myRegex) || []);

// Returning an array becomes the action "Result" token.
return matches;`;

const defaultWorkflowContext = `{
  "actions": {},
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

function setText(id, value) {
  $(id).value = value;
}

function setPre(id, text) {
  $(id).textContent = text;
}

let codeEditor = null;

function formatError(err) {
  if (!err) return 'Unknown error';
  if (typeof err === 'string') return err;
  const name = err.name ? `${err.name}: ` : '';
  const msg = err.message ? err.message : String(err);
  return name + msg + (err.stack ? `\n\n${err.stack}` : '');
}

async function run() {
  const code = codeEditor ? codeEditor.getValue() : $('code').value;
  setPre('result', '');
  setPre('console', '');

  let workflowContext;
  const workflowContextRaw = $('workflowContext').value.trim();
  try {
    workflowContext = workflowContextRaw ? JSON.parse(workflowContextRaw) : {};
  } catch (err) {
    setPre('result', 'Invalid workflowContext JSON:\n' + formatError(err));
    return;
  }

  const timeoutMs = Number($('timeoutMs').value);
  const mode = $('mode').value;

  if (mode === 'browser') {
    const data = await runInBrowserWorker({ code, workflowContext, timeoutMs });
    if (!data.ok) {
      setPre('result', 'Error:\n' + formatError(data?.error));
      if (data?.logs?.length) {
        setPre('console', data.logs.map((l) => `${l.level}: ${l.args.join(' ')}`).join('\n'));
      }
      return;
    }

    const resultText = [
      `Execution time: ${data.executionTimeMs} ms`,
      '---',
      data.resultInspect ?? '',
    ].join('\n');
    setPre('result', resultText);

    if (Array.isArray(data.logs) && data.logs.length > 0) {
      setPre(
        'console',
        data.logs
          .map((l) => `${l.level}: ${l.args.join(' ')}`)
          .join('\n')
      );
    } else {
      setPre('console', '(no console output)');
    }
    return;
  }

  // Default: run via server-side Node.js VM sandbox.
  const resp = await fetch('/api/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, workflowContext, timeoutMs }),
  });

  const data = await resp.json();
  if (!resp.ok || !data.ok) {
    setPre('result', 'Error:\n' + formatError(data?.error));
    if (data?.logs?.length) {
      setPre('console', data.logs.map((l) => `${l.level}: ${l.args.join(' ')}`).join('\n'));
    }
    return;
  }

  const resultText = [
    `Execution time: ${data.executionTimeMs} ms`,
    '---',
    data.resultInspect ?? '',
  ].join('\n');
  setPre('result', resultText);

  if (Array.isArray(data.logs) && data.logs.length > 0) {
    setPre(
      'console',
      data.logs
        .map((l) => `${l.level}: ${l.args.join(' ')}`)
        .join('\n')
    );
  } else {
    setPre('console', '(no console output)');
  }
}

// Initialize CodeMirror for syntax highlighting.
// CodeMirror replaces the textarea visually but we still keep it in sync.
function initCodeEditor() {
  const textarea = $('code');
  if (!textarea || typeof window.CodeMirror === 'undefined') return;

  codeEditor = window.CodeMirror.fromTextArea(textarea, {
    mode: 'javascript',
    theme: 'material-darker',
    lineNumbers: true,
    lineWrapping: true,
    indentUnit: 2,
    tabSize: 2,
  });

  codeEditor.setValue(defaultCode);
}

initCodeEditor();
setText('workflowContext', defaultWorkflowContext);

$('run').addEventListener('click', () => {
  run().catch((err) => setPre('result', 'Error:\n' + formatError(err)));
});

async function runInBrowserWorker({ code, workflowContext, timeoutMs }) {
  // Web Worker lets us enforce timeouts (by terminating the worker).
  const workerScript = `
    "use strict";

    const formatError = (err) => {
      if (!err) return { name: "Error", message: "Unknown error" };
      return {
        name: err && err.name ? err.name : "Error",
        message: err && err.message ? err.message : String(err),
        stack: err && err.stack ? err.stack : undefined
      };
    };

    function stringifySafe(value, space) {
      const seen = new WeakSet();
      const json = (() => {
        try {
          return JSON.stringify(value, (key, val) => {
            if (typeof val === "bigint") return val.toString() + "n";
            if (typeof val === "object" && val !== null) {
              if (seen.has(val)) return "[Circular]";
              seen.add(val);
            }
            if (typeof val === "function") return "[Function]";
            return val;
          }, space);
        } catch (e) {
          return null;
        }
      })();
      if (json !== null) return json;
      try {
        return String(value);
      } catch {
        return "[Uninspectable]";
      }
    }

    function inspectValue(value) {
      if (typeof value === "string") return JSON.stringify(value);
      if (value === undefined) return "undefined";
      if (value === null) return "null";
      if (typeof value === "number" || typeof value === "boolean") return String(value);
      const json = stringifySafe(value, 2);
      return json;
    }

    self.onmessage = (e) => {
      const { code, workflowContext } = e.data || {};
      const logs = [];
      const methods = ["log", "info", "warn", "error"];
      const original = {};
      for (const m of methods) {
        original[m] = console[m];
        console[m] = (...args) => {
          logs.push({ level: m, args: args.map((a) => inspectValue(a)) });
        };
      }

      const start = Date.now();
      try {
        const wrapped = '"use strict";\\n' + code + '\\n';
        const fn = new Function("workflowContext", wrapped);
        const result = fn(workflowContext);
        const executionTimeMs = Date.now() - start;
        self.postMessage({
          ok: true,
          resultInspect: inspectValue(result),
          executionTimeMs,
          logs
        });
      } catch (err) {
        const executionTimeMs = Date.now() - start;
        self.postMessage({
          ok: false,
          error: formatError(err),
          executionTimeMs,
          logs
        });
      }
      // No restore needed since the worker is terminated by the main thread.
    };
  `;

  const blob = new Blob([workerScript], { type: 'text/javascript' });
  const url = URL.createObjectURL(blob);
  const worker = new Worker(url);

  let timer = null;
  try {
    const data = await new Promise((resolve) => {
      let done = false;
      timer = setTimeout(() => {
        if (done) return;
        done = true;
        worker.terminate();
        URL.revokeObjectURL(url);
        resolve({
          ok: false,
          error: { name: 'TimeoutError', message: `Timed out after ${timeoutMs} ms`, stack: undefined },
          executionTimeMs: timeoutMs,
          logs: [],
        });
      }, timeoutMs);

      worker.onmessage = (event) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        const payload = event.data || {};
        resolve(payload);
        worker.terminate();
        URL.revokeObjectURL(url);
      };

      worker.onerror = (err) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve({
          ok: false,
          error: { name: 'WorkerError', message: err?.message ? err.message : String(err), stack: err?.filename },
          executionTimeMs: Date.now(),
          logs: [],
        });
        worker.terminate();
        URL.revokeObjectURL(url);
      };

      worker.postMessage({ code, workflowContext });
    });

    return data;
  } finally {
    try {
      if (timer) clearTimeout(timer);
    } catch {}
  }
}

