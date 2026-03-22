const $ = (id) => document.getElementById(id);

const defaultCode = `// Example: extract email addresses from the trigger body
// Tip: reference data via workflowContext, matching Logic Apps Standard.
const text =
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

const defaultAssertion = `Array.isArray(result) && result.length >= 1`;

function setText(id, value) {
  $(id).value = value;
}

function setPre(id, text) {
  $(id).textContent = text;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function setResultRich(lines) {
  const el = $('result');
  if (!el) return;
  const rendered = (lines || [])
    .map((line) => {
      if (typeof line === 'string') {
        return `<span class="result-line">${escapeHtml(line)}</span>`;
      }
      const kind = line?.kind ? ` result-${line.kind}` : '';
      return `<span class="result-line${kind}">${escapeHtml(line?.text ?? '')}</span>`;
    })
    .join('\n');
  el.innerHTML = rendered;
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

function getAssertionText() {
  return assertionEditor ? assertionEditor.getValue() : $('assertion')?.value || '';
}

function applyAssertionText(text) {
  if (assertionEditor) {
    assertionEditor.setValue(text || '');
  } else if ($('assertion')) {
    $('assertion').value = text || '';
  }
}

let codeEditor = null;
let workflowContextEditor = null;
let assertionEditor = null;

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

function normalizeCaseEntry(entry) {
  // Backward compatibility: older storage kept plain workflowContext object.
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    return { workflowContext: {}, assertion: defaultAssertion };
  }

  if (Object.prototype.hasOwnProperty.call(entry, 'workflowContext')) {
    const workflowContext =
      entry.workflowContext && typeof entry.workflowContext === 'object' && !Array.isArray(entry.workflowContext)
        ? entry.workflowContext
        : {};
    const assertion = typeof entry.assertion === 'string' ? entry.assertion : defaultAssertion;
    return { workflowContext, assertion };
  }

  return { workflowContext: entry, assertion: defaultAssertion };
}

function evaluateAssertion({ assertionText, resultValue, workflowContext }) {
  const text = (assertionText || '').trim();
  if (!text) {
    return { hasAssertion: false, passed: null, message: 'No assertion defined for this test case.' };
  }

  const fn = new Function(
    'result',
    'workflowContext',
    `"use strict"; return (${text});`
  );
  const value = fn(resultValue, workflowContext);

  if (value === true) {
    return { hasAssertion: true, passed: true, message: 'Assertion passed.' };
  }

  return {
    hasAssertion: true,
    passed: false,
    message: `Assertion failed (expected true, got ${String(value)}).`,
  };
}

function buildValidationText(code, workflowContext) {
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
        missing.length > 0
          ? 'Missing structural workflowContext parts:\n' + missing.map((m) => `- ${m}`).join('\n')
          : '';

      validationText = [issueText, missingText].filter(Boolean).join('\n\n');
    }
  } catch {
    // If analysis can't run (e.g. acorn CDN blocked), skip validation.
  }
  return validationText;
}

async function executeCase({ code, workflowContext, assertionText, timeoutMs }) {
  const validationText = buildValidationText(code, workflowContext);

  // Static / browser-only: execution runs in a Web Worker (no backend).
  const runData = await runInBrowserWorker({ code, workflowContext, timeoutMs });

  let assertionOutcome = null;
  if (runData?.ok) {
    try {
      assertionOutcome = evaluateAssertion({
        assertionText,
        resultValue: runData.resultValue,
        workflowContext,
      });
    } catch (err) {
      assertionOutcome = {
        hasAssertion: true,
        passed: false,
        message: `Assertion error: ${formatError(err)}`,
      };
    }
  }

  return { runData, validationText, assertionOutcome };
}

function setEditorToCase(name) {
  const entry = normalizeCaseEntry(workflowContextCases[name]);
  workflowContextCases[name] = entry;
  const pretty = JSON.stringify(entry.workflowContext ?? {}, null, 2);
  applyWorkflowContextJson(pretty);
  applyAssertionText(entry.assertion || defaultAssertion);
  selectedWorkflowContextName = name;
}

function initWorkflowContextTestCasesUI() {
  const fromStorage = loadWorkflowContextCasesFromStorage();
  if (fromStorage) {
    workflowContextCases = fromStorage.cases;
    selectedWorkflowContextName = fromStorage.selected || Object.keys(workflowContextCases)[0];
  } else {
    // Seed with the default template.
    try {
      workflowContextCases = {
        [DEFAULT_WORKFLOW_CONTEXT_NAME]: {
          workflowContext: JSON.parse(defaultWorkflowContext),
          assertion: defaultAssertion,
        },
      };
    } catch {
      workflowContextCases = {
        [DEFAULT_WORKFLOW_CONTEXT_NAME]: {
          workflowContext: {},
          assertion: defaultAssertion,
        },
      };
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

  if (!workflowContextUIBound && contextSelect) {
    contextSelect.addEventListener('change', () => {
      const name = contextSelect.value;
      setPre('result', '');
      setPre('console', '');
      setEditorToCase(name);
      persistWorkflowContextCases();
    });
  }

  // Modal-based test case creation - no longer used inline
  if (!workflowContextUIBound && saveNewBtn && newNameInput) {
    // Event handlers moved to modal system
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
        workflowContextCases[selectedWorkflowContextName] = {
          workflowContext: obj,
          assertion: getAssertionText() || defaultAssertion,
        };
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
        workflowContextCases[DEFAULT_WORKFLOW_CONTEXT_NAME] = {
          workflowContext: {},
          assertion: defaultAssertion,
        };
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
  const assertionText = getAssertionText();
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

  const timeoutMs = Number($('timeoutMs').value);
  const { runData, validationText, assertionOutcome } = await executeCase({
    code,
    workflowContext,
    assertionText,
    timeoutMs,
  });

  if (!runData?.ok) {
    const errText = 'Error:\n' + formatError(runData?.error);
    const lines = [];
    if (validationText) lines.push({ kind: 'warn', text: `⚠ ${validationText}` });
    lines.push({ kind: 'error', text: `💥 ${errText}` });
    setResultRich(lines);
    if (runData?.logs?.length) {
      setPre('console', runData.logs.map((l) => `${l.level}: ${l.args.join(' ')}`).join('\n'));
    }
    return;
  }

  const resultParts = [];
  if (validationText) resultParts.push({ kind: 'warn', text: `⚠ ${validationText}` });
  if (assertionOutcome?.hasAssertion) {
    resultParts.push(
      {
        kind: assertionOutcome.passed ? 'pass' : 'fail',
        text: `${assertionOutcome.passed ? '✅' : '❌'} Assertion (${selectedWorkflowContextName}): ${
          assertionOutcome.passed ? 'PASS' : 'FAIL'
        }`,
      },
      {
        kind: assertionOutcome.passed ? 'pass' : 'fail',
        text: assertionOutcome.message,
      }
    );
  }
  resultParts.push(
    `Execution time: ${runData.executionTimeMs} ms`,
    '---',
    runData.resultInspect ?? ''
  );
  setResultRich(resultParts);

  if (Array.isArray(runData.logs) && runData.logs.length > 0) {
    setPre('console', runData.logs.map((l) => `${l.level}: ${l.args.join(' ')}`).join('\n'));
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

function initAssertionEditor() {
  const textarea = $('assertion');
  if (!textarea) return;
  if (typeof window.CodeMirror === 'undefined') return;

  assertionEditor = window.CodeMirror.fromTextArea(textarea, {
    mode: 'javascript',
    theme: 'material-darker',
    lineNumbers: false,
    lineWrapping: true,
    indentUnit: 2,
    tabSize: 2,
  });

  assertionEditor.setValue(defaultAssertion);
}

initWorkflowContextEditor();
initAssertionEditor();
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

// Generate workflow context logic - moved to modal system
function generateWorkflowContextFromCode() {
  try {
    const codeText = getInlineCode();
    const { template, uniquePaths, issues, skippedPaths } = extractWorkflowContextPathsFromCode(codeText);

    if (!uniquePaths) {
      return {
        success: false,
        message: 'No `workflowContext.*` property access found in the inline code snippet.',
      };
    }

    return {
      success: true,
      template,
      uniquePaths,
      skippedPaths,
      issues: issues || [],
    };
  } catch (err) {
    return {
      success: false,
      message: 'Failed to generate workflowContext template:\n' + formatError(err),
    };
  }
}

async function runAllTestCases() {
  const code = getInlineCode();
  const timeoutMs = Number($('timeoutMs').value);

  setPre('result', '');
  setPre('console', '');

  // Keep selected case in sync before batch run.
  if (selectedWorkflowContextName) {
    try {
      workflowContextCases[selectedWorkflowContextName] = {
        workflowContext: getCurrentWorkflowContextObject(),
        assertion: getAssertionText() || defaultAssertion,
      };
      persistWorkflowContextCases();
    } catch (err) {
      setPre('result', 'Invalid workflowContext JSON in selected case:\n' + formatError(err));
      return;
    }
  }

  const caseNames = Object.keys(workflowContextCases).sort((a, b) => a.localeCompare(b));
  if (caseNames.length === 0) {
    setPre('result', 'No test cases found.');
    return;
  }

  const summaryLines = [];
  const consoleSections = [];
  let passCount = 0;
  let failCount = 0;
  let errorCount = 0;

  for (const caseName of caseNames) {
    const entry = normalizeCaseEntry(workflowContextCases[caseName]);
    workflowContextCases[caseName] = entry;

    const { runData, validationText, assertionOutcome } = await executeCase({
      code,
      workflowContext: entry.workflowContext,
      assertionText: entry.assertion,
      timeoutMs,
    });

    if (!runData?.ok) {
      errorCount += 1;
      summaryLines.push({ kind: 'error', text: `💥 ${caseName}: ERROR - ${formatError(runData?.error)}` });
    } else if (assertionOutcome?.hasAssertion) {
      if (assertionOutcome.passed) {
        passCount += 1;
        summaryLines.push({ kind: 'pass', text: `✅ ${caseName}: PASS` });
      } else {
        failCount += 1;
        summaryLines.push({ kind: 'fail', text: `❌ ${caseName}: FAIL - ${assertionOutcome.message}` });
      }
    } else {
      failCount += 1;
      summaryLines.push({ kind: 'fail', text: `❌ ${caseName}: FAIL - No assertion defined` });
    }

    if (validationText) {
      summaryLines.push({ kind: 'warn', text: `⚠ ${caseName} validation: ${validationText.replace(/\n/g, ' | ')}` });
    }

    if (Array.isArray(runData?.logs) && runData.logs.length > 0) {
      consoleSections.push(
        `[${caseName}]`,
        runData.logs.map((l) => `${l.level}: ${l.args.join(' ')}`).join('\n')
      );
    }
  }

  const total = caseNames.length;
  const headerKind = failCount === 0 && errorCount === 0 ? 'pass' : 'fail';
  const headerSymbol = headerKind === 'pass' ? '✅' : '❌';
  const header = `${headerSymbol} Run All completed: ${passCount} passed, ${failCount} failed, ${errorCount} errors, ${total} total.`;
  setResultRich([{ kind: headerKind, text: header }, '---', ...summaryLines]);

  if (consoleSections.length > 0) {
    setPre('console', consoleSections.join('\n'));
  } else {
    setPre('console', '(no console output)');
  }
}

$('run').addEventListener('click', () => {
  run().catch((err) => setPre('result', 'Error:\n' + formatError(err)));
});

const runAllBtn = $('runAll');
if (runAllBtn) {
  runAllBtn.addEventListener('click', () => {
    runAllTestCases().catch((err) => setPre('result', 'Error:\n' + formatError(err)));
  });
}

// Modal dialog for adding new test cases
let modalState = {
  mode: 'generate', // 'generate' or 'duplicate'
  generatedTemplate: null,
};

function showModal() {
  $('addTestCaseModal').classList.add('active');
  $('newTestCaseName').value = '';
  $('newTestCaseName').focus();
}

function hideModal() {
  const modal = $('addTestCaseModal');
  if (modal) modal.classList.remove('active');
  modalState.generatedTemplate = null;
  modalState.mode = 'generate';
  updateModalTabs();
}

function updateModalTabs() {
  const tabs = document.querySelectorAll('.modal-tab');
  const panels = document.querySelectorAll('.modal-panel');
  
  tabs.forEach(tab => {
    tab.classList.remove('active');
    if (tab.dataset.tab === modalState.mode) {
      tab.classList.add('active');
    }
  });
  
  panels.forEach(panel => {
    panel.classList.remove('active');
    if (panel.id === (modalState.mode === 'generate' ? 'generatePanel' : 'duplicatePanel')) {
      panel.classList.add('active');
    }
  });
}

function populateDuplicateSelect() {
  const select = $('duplicateSelect');
  if (!select) return;
  
  const names = Object.keys(workflowContextCases).sort((a, b) => a.localeCompare(b));
  select.innerHTML = '<option value="">-- Select test case to duplicate --</option>';
  
  names.forEach(name => {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    select.appendChild(option);
  });
}

// Add test case button
const addTestCaseBtn = $('addTestCase');
if (addTestCaseBtn) {
  addTestCaseBtn.addEventListener('click', () => {
    populateDuplicateSelect();
    updateModalTabs();
    showModal();
  });
}

// Modal tab switching
document.querySelectorAll('.modal-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    modalState.mode = tab.dataset.tab;
    updateModalTabs();
    
    // If switching to generate, clear any existing template
    if (modalState.mode === 'generate') {
      modalState.generatedTemplate = null;
    }
  });
});

// Generate button in modal
const generateButton = $('generateButton');
if (generateButton) {
  generateButton.addEventListener('click', () => {
    const result = generateWorkflowContextFromCode();
    
    if (!result.success) {
      setPre('result', result.message);
      return;
    }
    
    modalState.generatedTemplate = result.template;
    setPre(
      'result',
      `Generated template from ${result.uniquePaths} valid path(s). Skipped ${result.skippedPaths} structurally unsupported path(s).`
    );
    
    if (Array.isArray(result.issues) && result.issues.length > 0) {
      setPre(
        'console',
        'Validation issues (code -> workflowContext shape):\n' +
          result.issues
            .slice(0, 30)
            .map((it) => `- ${JSON.stringify(it.path)}: ${it.reason}`)
            .join('\n') +
          (result.issues.length > 30 ? `\n...and ${result.issues.length - 30} more` : '')
      );
    }
  });
}

// Create test case button
const createButton = $('createButton');
if (createButton) {
  createButton.addEventListener('click', () => {
    const name = $('newTestCaseName').value.trim();
    
    if (!name) {
      setPre('result', 'Please enter a name for the new test case.');
      return;
    }
    
    if (workflowContextCases.hasOwnProperty(name)) {
      setPre('result', `A test case with name "${name}" already exists. Choose a different name.`);
      return;
    }
    
    let newContext = {};
    let newAssertion = defaultAssertion;
    
    if (modalState.mode === 'generate') {
      if (!modalState.generatedTemplate) {
        setPre('result', 'Please generate a template first.');
        return;
      }
      newContext = modalState.generatedTemplate;
    } else {
      // Duplicate mode
      const sourceCase = $('duplicateSelect').value;
      if (!sourceCase) {
        setPre('result', 'Please select a test case to duplicate.');
        return;
      }
      
      const source = normalizeCaseEntry(workflowContextCases[sourceCase]);
      newContext = JSON.parse(JSON.stringify(source.workflowContext)); // Deep copy
      newAssertion = source.assertion || defaultAssertion;
    }
    
    try {
      workflowContextCases[name] = {
        workflowContext: newContext,
        assertion: newAssertion,
      };
      selectedWorkflowContextName = name;
      persistWorkflowContextCases();
      setPre('result', `Created test case: ${name}`);
      initWorkflowContextTestCasesUI();
      setEditorToCase(name);
      hideModal();
    } catch (err) {
      setPre('result', 'Error creating test case:\n' + formatError(err));
    }
  });
}

// Modal close buttons
const closeModalBtn = $('closeModal');
if (closeModalBtn) {
  closeModalBtn.addEventListener('click', hideModal);
}

const cancelButton = $('cancelButton');
if (cancelButton) {
  cancelButton.addEventListener('click', hideModal);
}

// Close modal on escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    hideModal();
  }
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

    function toJsonSafeValue(value) {
      try {
        const json = stringifySafe(value, 0);
        return json == null ? null : JSON.parse(json);
      } catch {
        return null;
      }
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
          resultValue: toJsonSafeValue(result),
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

