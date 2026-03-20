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

function getInlineCode() {
  return codeEditor ? codeEditor.getValue() : $('code').value;
}

function applyWorkflowContextJson(jsonText) {
  if (workflowContextEditor) {
    workflowContextEditor.setValue(jsonText);
  } else {
    $('workflowContext').value = jsonText;
  }
}

let codeEditor = null;
let workflowContextEditor = null;

const WORKFLOW_CONTEXT_STORAGE_KEY = 'logicInlineCodeTester.workflowContexts.v1';
const DEFAULT_WORKFLOW_CONTEXT_NAME = 'default';
let workflowContextCases = {};
let selectedWorkflowContextName = DEFAULT_WORKFLOW_CONTEXT_NAME;
let workflowContextUIBound = false;

function formatError(err) {
  if (!err) return 'Unknown error';
  if (typeof err === 'string') return err;
  const name = err.name ? `${err.name}: ` : '';
  const msg = err.message ? err.message : String(err);
  return name + msg + (err.stack ? `\n\n${err.stack}` : '');
}

function getCurrentWorkflowContextRaw() {
  return (workflowContextEditor ? workflowContextEditor.getValue() : $('workflowContext').value).trim();
}

function getCurrentWorkflowContextObject() {
  const raw = getCurrentWorkflowContextRaw();
  if (!raw) return {};
  return JSON.parse(raw);
}

function persistWorkflowContextCases() {
  try {
    localStorage.setItem(
      WORKFLOW_CONTEXT_STORAGE_KEY,
      JSON.stringify({ selectedWorkflowContextName, workflowContextCases })
    );
  } catch {
    // Best effort only.
  }
}

function loadWorkflowContextCasesFromStorage() {
  try {
    const raw = localStorage.getItem(WORKFLOW_CONTEXT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const cases = parsed.workflowContextCases;
    const selected = parsed.selectedWorkflowContextName;
    if (!cases || typeof cases !== 'object') return null;
    return { cases, selected };
  } catch {
    return null;
  }
}

function initWorkflowContextTestCasesUI() {
  const fromStorage = loadWorkflowContextCasesFromStorage();
  if (fromStorage) {
    workflowContextCases = fromStorage.cases;
    selectedWorkflowContextName = fromStorage.selected || Object.keys(workflowContextCases)[0];
  } else {
    // Seed with the default template.
    try {
      workflowContextCases = { [DEFAULT_WORKFLOW_CONTEXT_NAME]: JSON.parse(defaultWorkflowContext) };
    } catch {
      workflowContextCases = { [DEFAULT_WORKFLOW_CONTEXT_NAME]: {} };
    }
    selectedWorkflowContextName = DEFAULT_WORKFLOW_CONTEXT_NAME;
  }

  const contextSelect = $('contextSelect');
  const saveNewBtn = $('saveNewContext');
  const updateSelectedBtn = $('updateSelectedContext');
  const deleteSelectedBtn = $('deleteSelectedContext');
  const newNameInput = $('newContextName');

  if (contextSelect) {
    contextSelect.innerHTML = '';
    const names = Object.keys(workflowContextCases).sort((a, b) => a.localeCompare(b));
    for (const name of names) {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      contextSelect.appendChild(opt);
    }

    if (names.includes(selectedWorkflowContextName)) {
      contextSelect.value = selectedWorkflowContextName;
    } else if (names.length > 0) {
      selectedWorkflowContextName = names[0];
      contextSelect.value = selectedWorkflowContextName;
    }
  }

  const setEditorToCase = (name) => {
    const obj = workflowContextCases[name];
    const pretty = JSON.stringify(obj ?? {}, null, 2);
    applyWorkflowContextJson(pretty);
    selectedWorkflowContextName = name;
  };

  if (!workflowContextUIBound && contextSelect) {
    contextSelect.addEventListener('change', () => {
      const name = contextSelect.value;
      setPre('result', '');
      setPre('console', '');
      setEditorToCase(name);
      persistWorkflowContextCases();
    });
  }

  if (!workflowContextUIBound && saveNewBtn && newNameInput) {
    saveNewBtn.addEventListener('click', () => {
      setPre('result', '');
      setPre('console', '');

      const name = newNameInput.value.trim();
      if (!name) {
        setPre('result', 'Please enter a name for the new workflowContext test case.');
        return;
      }

      try {
        const obj = getCurrentWorkflowContextObject();
        workflowContextCases[name] = obj;
        selectedWorkflowContextName = name;
        persistWorkflowContextCases();
        newNameInput.value = '';
        setPre('result', `Saved workflowContext test case: ${name}`);
        initWorkflowContextTestCasesUI();
      } catch (err) {
        setPre('result', 'Invalid workflowContext JSON:\n' + formatError(err));
      }
    });
  }

  if (!workflowContextUIBound && updateSelectedBtn) {
    updateSelectedBtn.addEventListener('click', () => {
      setPre('result', '');
      setPre('console', '');
      if (!selectedWorkflowContextName) {
        setPre('result', 'No test case selected.');
        return;
      }

      try {
        const obj = getCurrentWorkflowContextObject();
        workflowContextCases[selectedWorkflowContextName] = obj;
        persistWorkflowContextCases();
        setPre('result', `Updated: ${selectedWorkflowContextName}`);
      } catch (err) {
        setPre('result', 'Invalid workflowContext JSON:\n' + formatError(err));
      }
    });
  }

  if (!workflowContextUIBound && deleteSelectedBtn) {
    deleteSelectedBtn.addEventListener('click', () => {
      setPre('result', '');
      setPre('console', '');
      if (!selectedWorkflowContextName) {
        setPre('result', 'No test case selected.');
        return;
      }

      const name = selectedWorkflowContextName;
      if (!window.confirm(`Delete workflowContext test case "${name}"?`)) return;

      delete workflowContextCases[name];
      const remaining = Object.keys(workflowContextCases);

      if (remaining.length === 0) {
        workflowContextCases[DEFAULT_WORKFLOW_CONTEXT_NAME] = {};
        selectedWorkflowContextName = DEFAULT_WORKFLOW_CONTEXT_NAME;
      } else {
        selectedWorkflowContextName = remaining.sort((a, b) => a.localeCompare(b))[0];
      }

      persistWorkflowContextCases();
      initWorkflowContextTestCasesUI();
      setPre('result', `Deleted: ${name}`);
    });
  }

  // Load selected case into editor at startup.
  if (selectedWorkflowContextName) setEditorToCase(selectedWorkflowContextName);

  workflowContextUIBound = true;
}

async function run() {
  const code = getInlineCode();
  setPre('result', '');
  setPre('console', '');

  let workflowContext;
  const workflowContextRaw = (workflowContextEditor
    ? workflowContextEditor.getValue()
    : $('workflowContext').value
  ).trim();
  try {
    workflowContext = workflowContextRaw ? JSON.parse(workflowContextRaw) : {};
  } catch (err) {
    setPre('result', 'Invalid workflowContext JSON:\n' + formatError(err));
    return;
  }

  let validationText = '';
  try {
    const analysis = extractWorkflowContextPathsFromCode(code);
    const issues = analysis?.issues || [];
    const requiredStructuralPaths = analysis?.requiredStructuralPaths || [];

    const missing = [];

    const pathExists = (obj, segments) => {
      let cur = obj;
      for (const seg of segments) {
        if (cur === null || cur === undefined) return false;
        if (typeof cur !== 'object') return false;
        if (cur[seg] === undefined) return false;
        cur = cur[seg];
      }
      return true;
    };

    const formatExpression = (segments) => {
      // Human-friendly: show `workflowContext.<...>` access with brackets for unsafe keys.
      let expr = 'workflowContext';
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        if (i === 0) {
          expr += `.${seg}`;
          continue;
        }
        if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(seg)) expr += `.${seg}`;
        else expr += `[${JSON.stringify(seg)}]`;
      }
      return expr;
    };

    for (const segs of requiredStructuralPaths) {
      if (!pathExists(workflowContext, segs)) {
        missing.push(formatExpression(segs));
      }
    }

    if (issues.length > 0 || missing.length > 0) {
      const issueText =
        issues.length > 0
          ? 'Potentially unsupported workflowContext access in code:\n' +
            issues
              .slice(0, 25)
              .map((it) => `- ${formatExpression(it.path || [])}`)
              .join('\n')
          : '';
      const missingText =
        missing.length > 0 ? 'Missing structural workflowContext parts:\n' + missing.map((m) => `- ${m}`).join('\n') : '';

      validationText = [issueText, missingText].filter(Boolean).join('\n\n');
    }
  } catch {
    // If analysis can't run (e.g. acorn CDN blocked), we silently skip validation.
  }

  const timeoutMs = Number($('timeoutMs').value);
  const mode = $('mode').value;

  if (mode === 'browser') {
    const data = await runInBrowserWorker({ code, workflowContext, timeoutMs });
    if (!data.ok) {
      const errText = 'Error:\n' + formatError(data?.error);
      setPre('result', validationText ? `${validationText}\n\n${errText}` : errText);
      if (data?.logs?.length) {
        setPre('console', data.logs.map((l) => `${l.level}: ${l.args.join(' ')}`).join('\n'));
      }
      return;
    }

    const resultParts = [];
    if (validationText) resultParts.push(validationText);
    resultParts.push(
      `Execution time: ${data.executionTimeMs} ms`,
      '---',
      data.resultInspect ?? ''
    );
    const resultText = resultParts.join('\n');
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
    const errText = 'Error:\n' + formatError(data?.error);
    setPre('result', validationText ? `${validationText}\n\n${errText}` : errText);
    if (data?.logs?.length) {
      setPre('console', data.logs.map((l) => `${l.level}: ${l.args.join(' ')}`).join('\n'));
    }
    return;
  }

  const resultParts = [];
  if (validationText) resultParts.push(validationText);
  resultParts.push(
    `Execution time: ${data.executionTimeMs} ms`,
    '---',
    data.resultInspect ?? ''
  );
  const resultText = resultParts.join('\n');
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
  if (!textarea) return;
  if (typeof window.CodeMirror === 'undefined') {
    // Useful when CDN assets are blocked/offline; avoid silent failure.
    console.warn('CodeMirror did not load (window.CodeMirror is undefined).');
    return;
  }

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
function initWorkflowContextEditor() {
  const textarea = $('workflowContext');
  if (!textarea) return;
  if (typeof window.CodeMirror === 'undefined') return;

  workflowContextEditor = window.CodeMirror.fromTextArea(textarea, {
    // Treat as JSON, but rendered by the JS mode with json enabled.
    mode: { name: 'javascript', json: true },
    theme: 'material-darker',
    lineNumbers: true,
    lineWrapping: true,
    indentUnit: 2,
    tabSize: 2,
  });

  workflowContextEditor.setValue(defaultWorkflowContext);
}

initWorkflowContextEditor();
initWorkflowContextTestCasesUI();

function extractWorkflowContextPathsFromCode(codeText) {
  if (typeof window.acorn === 'undefined' || typeof window.acorn.parse !== 'function') {
    throw new Error('Acorn did not load; cannot generate template.');
  }

  // Wrap snippet as a function body so `return ...;` is valid during parsing.
  // Don't use template literals here; the snippet itself might contain backticks.
  const wrapped = 'function __la__(){\n' + codeText + '\n}\n';
  const ast = window.acorn.parse(wrapped, {
    ecmaVersion: 2022,
    sourceType: 'script',
  });

  const validPathsSet = new Set();
  const validPaths = [];
  const issues = [];
  let skippedPaths = 0;

  // Logic Apps Standard inline code exposes a structured `workflowContext`:
  // - workflowContext.trigger.outputs.{body, headers}
  // - workflowContext.actions[ActionName].outputs.{body, headers}
  // We only "tighten" at these structural points; deeper fields under `body`/`headers`
  // are connector-specific, so we don't validate them.
  function isValidWorkflowContextSegments(segments) {
    if (!Array.isArray(segments) || segments.length === 0) return { valid: false, reason: 'Empty path' };

    const root = segments[0];
    if (root !== 'trigger' && root !== 'actions' && root !== 'workflow') {
      return { valid: false, reason: `Unknown workflowContext root "${root}"` };
    }

    if (root === 'trigger') {
      const allowedTriggerKeys = new Set([
        'name',
        'inputs',
        'outputs',
        'startTime',
        'endTime',
        'scheduledTime',
        'trackingId',
        'clientTrackingId',
        'originHistoryName',
        'code',
        'status',
      ]);

      if (segments.length >= 2 && !allowedTriggerKeys.has(segments[1])) {
        return {
          valid: false,
          reason: `trigger.${String(segments[1])} is not a supported trigger property`,
        };
      }

      // trigger.outputs.{body, headers}
      if (segments[1] === 'outputs' && segments.length >= 3) {
        const next = segments[2];
        if (next !== 'body' && next !== 'headers') {
          return { valid: false, reason: `trigger.outputs.${String(next)} is not a supported shape` };
        }
      }
      return { valid: true };
    }

    if (root === 'actions') {
      // actions[ActionName].outputs.{body, headers}
      if (segments.length >= 3) {
        const next = segments[2];
        if (next !== 'outputs' && next !== 'inputs') {
          return { valid: false, reason: `actions[ActionName].${String(next)} is not a supported shape` };
        }

        if (next === 'outputs' && segments.length >= 4) {
          const outputKey = segments[3];
          if (outputKey !== 'body' && outputKey !== 'headers') {
            return { valid: false, reason: `actions[ActionName].outputs.${String(outputKey)} is not a supported shape` };
          }
        }
      }

      return { valid: true };
    }

    // workflow: can't easily validate without knowing the runtime shape.
    return { valid: true };
  }

  function getWorkflowContextPathSegments(memberNode) {
    let cur = memberNode;
    const segments = [];

    // Walk backwards through `workflowContext...` chains until we reach the base identifier.
    while (cur) {
      if (cur.type === 'ChainExpression') {
        cur = cur.expression;
        continue;
      }

      if (cur.type === 'MemberExpression' || cur.type === 'OptionalMemberExpression') {
        const computed = !!cur.computed;
        const prop = cur.property;

        if (computed) {
          if (prop.type === 'Literal') {
            segments.unshift(String(prop.value));
          } else if (
            prop.type === 'TemplateLiteral' &&
            prop.expressions.length === 0 &&
            prop.quasis.length === 1
          ) {
            segments.unshift(prop.quasis[0].value.cooked ?? '');
          } else {
            return null; // dynamic property key: can't template reliably
          }
        } else {
          if (prop.type === 'Identifier') segments.unshift(prop.name);
          else return null;
        }

        cur = cur.object;
        continue;
      }

      if (cur.type === 'Identifier' && cur.name === 'workflowContext') {
        return segments;
      }

      return null;
    }

    return null;
  }

  function visit(node) {
    if (!node || typeof node !== 'object') return;

    if (node.type === 'MemberExpression' || node.type === 'OptionalMemberExpression') {
      const segs = getWorkflowContextPathSegments(node);
      if (segs && segs.length > 0) {
        const check = isValidWorkflowContextSegments(segs);
        if (check.valid) {
          const key = JSON.stringify(segs);
          if (!validPathsSet.has(key)) {
            validPathsSet.add(key);
            validPaths.push(segs);
          }
        } else {
          // Keep the issue message short; show later as guidance.
          skippedPaths += 1;
          issues.push({
            path: segs,
            reason: check.reason || 'Invalid workflowContext access'
          });
        }
      }
    }

    for (const key of Object.keys(node)) {
      const value = node[key];
      if (!value) continue;
      if (Array.isArray(value)) {
        for (const child of value) visit(child);
      } else if (value && typeof value === 'object' && typeof value.type === 'string') {
        visit(value);
      }
    }
  }

  visit(ast);

  const template = {};

  function setPath(root, segments) {
    let cur = root;
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const isLeaf = i === segments.length - 1;
      if (isLeaf) {
        if (cur[seg] === undefined) cur[seg] = null;
      } else {
        const next = cur[seg];
        if (!next || typeof next !== 'object' || Array.isArray(next)) {
          cur[seg] = {};
        }
        cur = cur[seg];
      }
    }
  }

  for (const segs of validPaths) {
    setPath(template, segs);
  }

  // Only validate structural parts that are stable across runs.
  // We look for these prefixes:
  // - trigger.outputs.{body,headers}
  // - actions[ActionName].outputs.{body,headers}
  const requiredStructuralPathsSet = new Set();
  const requiredStructuralPaths = [];
  for (const segs of validPaths) {
    if (segs[0] === 'trigger' && segs[1] === 'outputs' && segs.length >= 3) {
      const key = JSON.stringify(['trigger', 'outputs', segs[2]]);
      if (!requiredStructuralPathsSet.has(key)) {
        requiredStructuralPathsSet.add(key);
        requiredStructuralPaths.push(['trigger', 'outputs', segs[2]]);
      }
    }
    if (segs[0] === 'actions' && segs[2] === 'outputs' && segs.length >= 4) {
      const key = JSON.stringify(['actions', segs[1], 'outputs', segs[3]]);
      if (!requiredStructuralPathsSet.has(key)) {
        requiredStructuralPathsSet.add(key);
        requiredStructuralPaths.push(['actions', segs[1], 'outputs', segs[3]]);
      }
    }
  }

  return {
    template,
    uniquePaths: validPaths.length,
    validPaths,
    issues,
    skippedPaths,
    requiredStructuralPaths
  };
}

const genWorkflowContextBtn = $('genWorkflowContext');
if (genWorkflowContextBtn) {
  genWorkflowContextBtn.addEventListener('click', () => {
    setPre('console', '');
    setPre('result', '');

    try {
      const codeText = getInlineCode();
      const { template, uniquePaths, issues, skippedPaths } = extractWorkflowContextPathsFromCode(codeText);

      if (!uniquePaths) {
        setPre(
          'result',
          'No `workflowContext.*` property access found in the inline code snippet.'
        );
        return;
      }

      const pretty = JSON.stringify(template, null, 2);
      applyWorkflowContextJson(pretty);
      workflowContextCases[selectedWorkflowContextName] = template;
      persistWorkflowContextCases();
      setPre(
        'result',
        `Generated workflowContext template from ${uniquePaths} valid path(s). Skipped ${skippedPaths} structurally unsupported path(s).`
      );

      if (Array.isArray(issues) && issues.length > 0) {
        setPre(
          'console',
          'Validation issues (code -> workflowContext shape):\n' +
            issues
              .slice(0, 30)
              .map((it) => `- ${JSON.stringify(it.path)}: ${it.reason}`)
              .join('\n') +
            (issues.length > 30 ? `\n...and ${issues.length - 30} more` : '')
        );
      }
    } catch (err) {
      setPre('result', 'Failed to generate workflowContext template:\n' + formatError(err));
    }
  });
}

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

