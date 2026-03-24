import React, { useEffect, useMemo, useState } from 'react';
import { ExecutionService } from '../public/services/ExecutionService.js';
import { StorageService } from '../public/services/StorageService.js';
import { ValidationService } from '../public/services/ValidationService.js';
import { CodeMirrorEditor } from './components/CodeMirrorEditor.jsx';
import { HeaderBar } from './components/HeaderBar.jsx';
import { ImportWorkflowModal } from './components/ImportWorkflowModal.jsx';
import { IntroBanner } from './components/IntroBanner.jsx';
import { ResultDisplay } from './components/ResultDisplay.jsx';
import { TestCaseManager } from './components/TestCaseManager.jsx';
import { TestCaseModal } from './components/TestCaseModal.jsx';

const DEFAULT_CODE = `// Example: extract email addresses from the trigger body
// Tip: reference data via workflowContext, matching Logic Apps Standard.
const text =
  workflowContext?.trigger?.outputs?.body?.Body ??
  "";

const myRegex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}/ig;
const matches = (text.match(myRegex) || []);

// Returning an array becomes the action "Result" token.
return matches;`;

const DEFAULT_WORKFLOW_CONTEXT = `{
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

const DEFAULT_ASSERTION = `Array.isArray(result) && result.length >= 1`;

function formatError(err) {
  if (!err) return 'Unknown error';
  if (typeof err === 'string') return err;
  const name = err.name ? `${err.name}: ` : '';
  const message = err.message ? err.message : String(err);
  return name + message + (err.stack ? `\n\n${err.stack}` : '');
}

function readInitialState() {
  const stored = StorageService.loadTestCases();
  if (!stored) {
    const defaultActionName = StorageService.getDefaultActionName();
    const cases = StorageService.createDefaultCases(DEFAULT_ASSERTION);
    const selectedCaseName = StorageService.getDefaultCaseName();
    const entry = StorageService.normalizeCaseEntry(cases[selectedCaseName], DEFAULT_ASSERTION);
    return {
      actions: {
        [defaultActionName]: {
          code: DEFAULT_CODE,
          selectedCaseName,
          workflowContextCases: cases,
        },
      },
      selectedActionName: defaultActionName,
      selectedCaseName,
      code: DEFAULT_CODE,
      workflowText: JSON.stringify(entry.workflowContext, null, 2),
      assertionText: entry.assertion,
    };
  }

  const actionNames = Object.keys(stored.actions);
  const selectedActionName =
    stored.selectedActionName && actionNames.includes(stored.selectedActionName)
      ? stored.selectedActionName
      : actionNames[0] || StorageService.getDefaultActionName();
  const actionEntry = StorageService.normalizeActionEntry(
    stored.actions[selectedActionName],
    DEFAULT_CODE,
    DEFAULT_ASSERTION
  );
  const entry = StorageService.normalizeCaseEntry(
    actionEntry.workflowContextCases[actionEntry.selectedCaseName],
    DEFAULT_ASSERTION
  );

  return {
    actions: stored.actions,
    selectedActionName,
    selectedCaseName: actionEntry.selectedCaseName,
    code: actionEntry.code || DEFAULT_CODE,
    workflowText: JSON.stringify(entry.workflowContext, null, 2),
    assertionText: entry.assertion,
  };
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function sanitizeActionName(name, fallbackIndex) {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  return trimmed || `Inline Action ${fallbackIndex + 1}`;
}

function buildUniqueActionName(baseName, existingNames) {
  if (!existingNames.has(baseName)) return baseName;

  let suffix = 2;
  while (existingNames.has(`${baseName} (${suffix})`)) {
    suffix += 1;
  }

  return `${baseName} (${suffix})`;
}

function collectInlineCodeActionsFromMap(actionMap, prefix = [], found = []) {
  if (!actionMap || typeof actionMap !== 'object') return found;

  for (const [actionName, action] of Object.entries(actionMap)) {
    if (!action || typeof action !== 'object') continue;

    const path = [...prefix, actionName];
    if (action.type === 'ExecuteJavaScriptCode' && typeof action.inputs?.code === 'string') {
      found.push({
        name: path.join(' / '),
        code: action.inputs.code,
      });
    }

    if (action.actions && typeof action.actions === 'object') {
      collectInlineCodeActionsFromMap(action.actions, path, found);
    }

    if (action.else?.actions && typeof action.else.actions === 'object') {
      collectInlineCodeActionsFromMap(action.else.actions, [...path, 'Else'], found);
    }

    if (action.default?.actions && typeof action.default.actions === 'object') {
      collectInlineCodeActionsFromMap(action.default.actions, [...path, 'Default'], found);
    }

    if (action.cases && typeof action.cases === 'object') {
      for (const [caseName, caseValue] of Object.entries(action.cases)) {
        if (caseValue?.actions && typeof caseValue.actions === 'object') {
          collectInlineCodeActionsFromMap(caseValue.actions, [...path, caseName], found);
        }
      }
    }
  }

  return found;
}

function extractInlineCodeActions(logicApp) {
  const rootActions =
    logicApp?.definition?.actions && typeof logicApp.definition.actions === 'object'
      ? logicApp.definition.actions
      : logicApp?.actions && typeof logicApp.actions === 'object'
        ? logicApp.actions
        : null;

  if (!rootActions) return [];

  return collectInlineCodeActionsFromMap(rootActions);
}

export function App() {
  const initialState = useMemo(() => readInitialState(), []);
  const [actions, setActions] = useState(initialState.actions);
  const [selectedActionName, setSelectedActionName] = useState(initialState.selectedActionName);
  const [code, setCode] = useState(initialState.code || DEFAULT_CODE);
  const [selectedCaseName, setSelectedCaseName] = useState(initialState.selectedCaseName);
  const [workflowText, setWorkflowText] = useState(initialState.workflowText || DEFAULT_WORKFLOW_CONTEXT);
  const [assertionText, setAssertionText] = useState(initialState.assertionText || DEFAULT_ASSERTION);
  const [timeoutMs, setTimeoutMs] = useState(1000);
  const [resultLines, setResultLines] = useState([]);
  const [consoleText, setConsoleText] = useState('');
  const [introVisible, setIntroVisible] = useState(true);
  const [statusSummary, setStatusSummary] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('generate');
  const [generatedTemplate, setGeneratedTemplate] = useState(null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importWorkflowText, setImportWorkflowText] = useState('');

  useEffect(() => {
    StorageService.saveTestCases(actions, selectedActionName);
  }, [actions, selectedActionName]);

  useEffect(() => {
    if (!selectedActionName || !selectedCaseName) return;

    setActions((currentActions) => {
      const currentAction = StorageService.normalizeActionEntry(
        currentActions[selectedActionName],
        DEFAULT_CODE,
        DEFAULT_ASSERTION
      );

      const nextAction = {
        ...currentAction,
        code,
        selectedCaseName,
      };

      try {
        const parsedWorkflowContext = JSON.parse(workflowText || '{}');
        const currentEntry = StorageService.normalizeCaseEntry(
          currentAction.workflowContextCases[selectedCaseName],
          DEFAULT_ASSERTION
        );
        const nextAssertion = assertionText || DEFAULT_ASSERTION;
        const currentWorkflowJson = JSON.stringify(currentEntry.workflowContext);
        const nextWorkflowJson = JSON.stringify(parsedWorkflowContext);

        if (currentWorkflowJson !== nextWorkflowJson || currentEntry.assertion !== nextAssertion) {
          nextAction.workflowContextCases = {
            ...currentAction.workflowContextCases,
            [selectedCaseName]: {
              workflowContext: parsedWorkflowContext,
              assertion: nextAssertion,
            },
          };
        }
      } catch {
        // Keep the last valid saved case while the editor contains invalid JSON.
      }

      const sameCode = currentAction.code === nextAction.code;
      const sameSelectedCase = currentAction.selectedCaseName === nextAction.selectedCaseName;
      const sameCases =
        JSON.stringify(currentAction.workflowContextCases) === JSON.stringify(nextAction.workflowContextCases);
      if (sameCode && sameSelectedCase && sameCases) {
        return currentActions;
      }

      return {
        ...currentActions,
        [selectedActionName]: nextAction,
      };
    });
  }, [assertionText, code, selectedActionName, selectedCaseName, workflowText]);

  const currentAction = useMemo(
    () =>
      StorageService.normalizeActionEntry(actions[selectedActionName], DEFAULT_CODE, DEFAULT_ASSERTION),
    [actions, selectedActionName]
  );

  const actionNames = useMemo(
    () => Object.keys(actions).sort((left, right) => left.localeCompare(right)),
    [actions]
  );

  const caseNames = useMemo(
    () => Object.keys(currentAction.workflowContextCases).sort((left, right) => left.localeCompare(right)),
    [currentAction]
  );

  function clearOutput() {
    setResultLines([]);
    setConsoleText('');
    setStatusSummary(null);
  }

  function loadCaseIntoEditors(caseName, nextCases = currentAction.workflowContextCases) {
    const entry = StorageService.normalizeCaseEntry(nextCases[caseName], DEFAULT_ASSERTION);
    setWorkflowText(JSON.stringify(entry.workflowContext, null, 2));
    setAssertionText(entry.assertion || DEFAULT_ASSERTION);
  }

  function loadAction(actionName, nextActions = actions) {
    const actionEntry = StorageService.normalizeActionEntry(nextActions[actionName], DEFAULT_CODE, DEFAULT_ASSERTION);
    setSelectedActionName(actionName);
    setCode(actionEntry.code || DEFAULT_CODE);
    setSelectedCaseName(actionEntry.selectedCaseName);
    loadCaseIntoEditors(actionEntry.selectedCaseName, actionEntry.workflowContextCases);
  }

  function selectCase(caseName, nextCases = currentAction.workflowContextCases) {
    setSelectedCaseName(caseName);
    loadCaseIntoEditors(caseName, nextCases);
  }

  function setConsoleFromLogs(logs) {
    if (Array.isArray(logs) && logs.length > 0) {
      setConsoleText(logs.map((line) => `${line.level}: ${line.args.join(' ')}`).join('\n'));
    } else {
      setConsoleText('(no console output)');
    }
  }

  function updateStatus(passCount, failCount, errorCount, total) {
    if (!total) {
      setStatusSummary(null);
      return;
    }

    setStatusSummary({
      passCount,
      failCount,
      errorCount,
      total,
      allPassed: failCount === 0 && errorCount === 0,
    });
  }

  function syncSelectedAction() {
    if (!selectedActionName || !selectedCaseName) return actions;

    const nextActions = {
      ...actions,
      [selectedActionName]: {
        ...currentAction,
        code,
        selectedCaseName,
        workflowContextCases: {
          ...currentAction.workflowContextCases,
          [selectedCaseName]: {
            workflowContext: JSON.parse(workflowText || '{}'),
            assertion: assertionText || DEFAULT_ASSERTION,
          },
        },
      },
    };

    setActions(nextActions);
    return nextActions;
  }

  function handleCaseChange(caseName) {
    clearOutput();
    selectCase(caseName);
  }

  function handleActionChange(actionName) {
    clearOutput();
    loadAction(actionName);
  }

  function handleCreateAction() {
    const name = window.prompt('Action name');
    const actionName = name ? name.trim() : '';
    if (!actionName) return;

    if (Object.prototype.hasOwnProperty.call(actions, actionName)) {
      setResultLines([`An action named "${actionName}" already exists.`]);
      return;
    }

    const nextActions = {
      ...actions,
      [actionName]: {
        code: DEFAULT_CODE,
        selectedCaseName: StorageService.getDefaultCaseName(),
        workflowContextCases: StorageService.createDefaultCases(DEFAULT_ASSERTION),
      },
    };

    setActions(nextActions);
    loadAction(actionName, nextActions);
    setResultLines([`Created action: ${actionName}`]);
  }

  function handleDeleteAction() {
    clearOutput();
    if (!selectedActionName) return;
    if (!window.confirm(`Delete inline code action "${selectedActionName}"?`)) return;

    const nextActions = { ...actions };
    const deletedAction = selectedActionName;
    delete nextActions[deletedAction];

    const remaining = Object.keys(nextActions).sort((left, right) => left.localeCompare(right));
    if (remaining.length === 0) {
      const defaultActionName = StorageService.getDefaultActionName();
      const defaults = {
        [defaultActionName]: {
          code: DEFAULT_CODE,
          selectedCaseName: StorageService.getDefaultCaseName(),
          workflowContextCases: StorageService.createDefaultCases(DEFAULT_ASSERTION),
        },
      };
      setActions(defaults);
      loadAction(defaultActionName, defaults);
    } else {
      setActions(nextActions);
      loadAction(remaining[0], nextActions);
    }

    setResultLines([`Deleted action: ${deletedAction}`]);
  }

  function handleDeleteCase() {
    clearOutput();
    if (!selectedCaseName) return;
    if (!window.confirm(`Delete workflowContext test case "${selectedCaseName}"?`)) return;

    const nextCases = { ...currentAction.workflowContextCases };
    const deletedCase = selectedCaseName;
    delete nextCases[deletedCase];

    const remaining = Object.keys(nextCases).sort((left, right) => left.localeCompare(right));
    const nextActions = {
      ...actions,
      [selectedActionName]: {
        ...currentAction,
        workflowContextCases: nextCases,
      },
    };

    if (remaining.length === 0) {
      const defaults = StorageService.createDefaultCases(DEFAULT_ASSERTION);
      const defaultCaseName = StorageService.getDefaultCaseName();
      nextActions[selectedActionName] = {
        ...currentAction,
        selectedCaseName: defaultCaseName,
        workflowContextCases: defaults,
      };
      setActions(nextActions);
      selectCase(defaultCaseName, defaults);
    } else {
      nextActions[selectedActionName] = {
        ...currentAction,
        selectedCaseName: remaining[0],
        workflowContextCases: nextCases,
      };
      setActions(nextActions);
      selectCase(remaining[0], nextCases);
    }

    setResultLines([`Deleted: ${deletedCase}`]);
  }

  function parseWorkflowImport(text) {
    const trimmedText = text.trim();
    if (!trimmedText) {
      return { importedActions: [], error: null };
    }

    try {
      const logicApp = JSON.parse(trimmedText);
      const importedActions = extractInlineCodeActions(logicApp);
      return { importedActions, error: null };
    } catch (error) {
      return { importedActions: [], error: `Invalid Logic App JSON: ${formatError(error)}` };
    }
  }

  function openImportModal() {
    setImportModalOpen(true);
  }

  function closeImportModal() {
    setImportModalOpen(false);
  }

  function handleImportWorkflow(preview, jsonText) {
    if (!preview || preview.error) {
      setResultLines([preview?.error || 'Invalid Logic App JSON.']);
      return;
    }

    if (preview.importedActions.length === 0) {
      setResultLines([
        'No inline JavaScript actions were found. Expected actions of type "ExecuteJavaScriptCode".',
      ]);
      return;
    }

    if (
      Object.keys(actions).length > 0 &&
      !window.confirm('Replace the current inline actions with the imported workflow actions?')
    ) {
      return;
    }

    try {
      const importedActions = preview.importedActions;

      const nextActions = {};
      const usedNames = new Set();

      importedActions.forEach((action, index) => {
        const baseName = sanitizeActionName(action.name, index);
        const uniqueName = buildUniqueActionName(baseName, usedNames);
        usedNames.add(uniqueName);
        nextActions[uniqueName] = {
          code: action.code,
          selectedCaseName: StorageService.getDefaultCaseName(),
          workflowContextCases: StorageService.createDefaultCases(DEFAULT_ASSERTION),
        };
      });

      const firstActionName = Object.keys(nextActions)[0];
      setActions(nextActions);
      setSelectedActionName(firstActionName);
      setImportWorkflowText(jsonText);
      setImportModalOpen(false);
      setGeneratedTemplate(null);
      setModalOpen(false);
      clearOutput();
      loadAction(firstActionName, nextActions);
      setResultLines([
        `Imported ${importedActions.length} inline action${importedActions.length === 1 ? '' : 's'} from workflow JSON.`,
      ]);
    } catch (error) {
      setResultLines([`Invalid Logic App JSON:\n${formatError(error)}`]);
    }
  }

  function openModal() {
    setGeneratedTemplate(null);
    setModalMode('generate');
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setGeneratedTemplate(null);
    setModalMode('generate');
  }

  function handleGenerateTemplate() {
    const generation = ValidationService.generateWorkflowContextFromCode(code);
    if (!generation.success) {
      setResultLines([generation.message]);
      return;
    }

    setGeneratedTemplate(generation.template);
    setResultLines([
      `Generated template from ${generation.uniquePaths} valid path(s). Skipped ${generation.skippedPaths} structurally unsupported path(s).`,
    ]);

    if (Array.isArray(generation.issues) && generation.issues.length > 0) {
      setConsoleText(
        'Validation issues (code -> workflowContext shape):\n' +
          generation.issues
            .slice(0, 30)
            .map((issue) => `- ${JSON.stringify(issue.path)}: ${issue.reason}`)
            .join('\n') +
          (generation.issues.length > 30 ? `\n...and ${generation.issues.length - 30} more` : '')
      );
    }
  }

  function handleCreateCase({ name, sourceCase }) {
    if (!name) {
      setResultLines(['Please enter a name for the new test case.']);
      return;
    }

    if (Object.prototype.hasOwnProperty.call(currentAction.workflowContextCases, name)) {
      setResultLines([`A test case with name "${name}" already exists. Choose a different name.`]);
      return;
    }

    let workflowContext = {};
    let assertion = DEFAULT_ASSERTION;

    if (modalMode === 'generate') {
      if (!generatedTemplate) {
        setResultLines(['Please generate a template first.']);
        return;
      }
      workflowContext = generatedTemplate;
    } else {
      if (!sourceCase) {
        setResultLines(['Please select a test case to duplicate.']);
        return;
      }
      const entry = StorageService.normalizeCaseEntry(
        currentAction.workflowContextCases[sourceCase],
        DEFAULT_ASSERTION
      );
      workflowContext = cloneJson(entry.workflowContext);
      assertion = entry.assertion || DEFAULT_ASSERTION;
    }

    const nextCases = {
      ...currentAction.workflowContextCases,
      [name]: {
        workflowContext,
        assertion,
      },
    };

    setActions({
      ...actions,
      [selectedActionName]: {
        ...currentAction,
        selectedCaseName: name,
        workflowContextCases: nextCases,
      },
    });
    selectCase(name, nextCases);
    setResultLines([`Created test case: ${name}`]);
    closeModal();
  }

  async function handleRun() {
    clearOutput();

    let parsedWorkflowContext;
    try {
      parsedWorkflowContext = workflowText.trim() ? JSON.parse(workflowText) : {};
    } catch (error) {
      setResultLines([`Invalid workflowContext JSON:\n${formatError(error)}`]);
      return;
    }

    const { runData, validationText, assertionOutcome } = await ExecutionService.execute(
      code,
      parsedWorkflowContext,
      assertionText,
      Number(timeoutMs)
    );

    if (!runData?.ok) {
      const lines = [];
      if (validationText) lines.push({ kind: 'warn', text: `Warning: ${validationText}` });
      lines.push({ kind: 'error', text: `Error:\n${formatError(runData?.error)}` });
      setResultLines(lines);
      setConsoleFromLogs(runData?.logs);
      updateStatus(0, 0, 0, 0);
      return;
    }

    const lines = [];
    if (validationText) lines.push({ kind: 'warn', text: `Warning: ${validationText}` });
    if (assertionOutcome?.hasAssertion) {
      lines.push({
        kind: assertionOutcome.passed ? 'pass' : 'fail',
        text: `Assertion (${selectedCaseName}): ${assertionOutcome.passed ? 'PASS' : 'FAIL'}`,
      });
      lines.push({
        kind: assertionOutcome.passed ? 'pass' : 'fail',
        text: assertionOutcome.message,
      });
    }
    lines.push(`Execution time: ${runData.executionTimeMs} ms`);
    lines.push('---');
    lines.push(runData.resultInspect ?? '');

    setResultLines(lines);
    setConsoleFromLogs(runData.logs);
    updateStatus(0, 0, 0, 0);
  }

  async function handleRunAll() {
    clearOutput();

    let nextActions;
    try {
      nextActions = syncSelectedAction();
    } catch (error) {
      setResultLines([`Invalid workflowContext JSON in selected action:\n${formatError(error)}`]);
      return;
    }

    const summaryLines = [];
    const consoleSections = [];
    let passCount = 0;
    let failCount = 0;
    let errorCount = 0;

    const actionEntry = StorageService.normalizeActionEntry(
      nextActions[selectedActionName],
      DEFAULT_CODE,
      DEFAULT_ASSERTION
    );

    for (const caseName of Object.keys(actionEntry.workflowContextCases).sort((left, right) => left.localeCompare(right))) {
      const entry = StorageService.normalizeCaseEntry(
        actionEntry.workflowContextCases[caseName],
        DEFAULT_ASSERTION
      );
      const { runData, validationText, assertionOutcome } = await ExecutionService.execute(
        actionEntry.code,
        entry.workflowContext,
        entry.assertion,
        Number(timeoutMs)
      );

      if (!runData?.ok) {
        errorCount += 1;
        summaryLines.push({ kind: 'error', text: `${caseName}: ERROR - ${formatError(runData?.error)}` });
      } else if (assertionOutcome?.hasAssertion) {
        if (assertionOutcome.passed) {
          passCount += 1;
          summaryLines.push({ kind: 'pass', text: `${caseName}: PASS` });
        } else {
          failCount += 1;
          summaryLines.push({ kind: 'fail', text: `${caseName}: FAIL - ${assertionOutcome.message}` });
        }
      } else {
        failCount += 1;
        summaryLines.push({ kind: 'fail', text: `${caseName}: FAIL - No assertion defined` });
      }

      if (validationText) {
        summaryLines.push({
          kind: 'warn',
          text: `${caseName} validation: ${validationText.replace(/\n/g, ' | ')}`,
        });
      }

      if (Array.isArray(runData?.logs) && runData.logs.length > 0) {
        consoleSections.push(
          `[${caseName}]`,
          runData.logs.map((line) => `${line.level}: ${line.args.join(' ')}`).join('\n')
        );
      }
    }

    const total = Object.keys(actionEntry.workflowContextCases).length;
    const allPassed = failCount === 0 && errorCount === 0;
    setResultLines([
      {
        kind: allPassed ? 'pass' : 'fail',
        text: `Run All completed for ${selectedActionName}: ${passCount} passed, ${failCount} failed, ${errorCount} errors, ${total} total.`,
      },
      '---',
      ...summaryLines,
    ]);
    setConsoleText(consoleSections.length > 0 ? consoleSections.join('\n') : '(no console output)');
    updateStatus(passCount, failCount, errorCount, total);
  }

  return (
    <div className="container">
      <HeaderBar
        statusSummary={statusSummary}
        onImportWorkflow={openImportModal}
        onRunAll={handleRunAll}
      />

      {introVisible ? <IntroBanner onDismiss={() => setIntroVisible(false)} /> : null}

      <section className="grid">
        <div className="panel">
          <TestCaseManager
            itemNames={actionNames}
            selectedItem={selectedActionName}
            onSelectItem={handleActionChange}
            onCreateItem={handleCreateAction}
            onDeleteItem={handleDeleteAction}
            title="Inline Actions"
            caption="Each action keeps its own code and test suite."
            selectLabel="Select inline code action"
            createLabel="Add Action"
            deleteLabel="Delete Action"
          />
          <div className="panel-title">Inline Code</div>
          <CodeMirrorEditor editorId="code" value={code} onChange={setCode} />
          <div className="hint">
            Your snippet is treated like a "method body". Use <code>return</code> if you want a value back.
          </div>
        </div>

        <div className="panel">
          <TestCaseManager
            itemNames={caseNames}
            selectedItem={selectedCaseName}
            onSelectItem={handleCaseChange}
            onCreateItem={openModal}
            onDeleteItem={handleDeleteCase}
          />

          <div className="panel-title">workflowContext JSON</div>
          <CodeMirrorEditor
            editorId="workflowContext"
            value={workflowText}
            onChange={setWorkflowText}
            mode="json"
            height={260}
          />
          <div className="hint">
            Shape matches Logic Apps Standard: <code>{'{ actions, trigger, workflow }'}</code>.
          </div>

          <div className="panel-title section-title">Assertion (paired with selected test case)</div>
          <CodeMirrorEditor
            editorId="assertion"
            value={assertionText}
            onChange={setAssertionText}
            mode="javascript"
            height={110}
            lineNumbers={false}
          />
          <div className="hint">
            JavaScript expression that must evaluate to <code>true</code>. Available variables:
            <code>result</code>, <code>workflowContext</code>.
          </div>
        </div>
      </section>

      <section className="actions">
        <label className="field" htmlFor="timeoutMs">
          Timeout (ms)
          <input
            id="timeoutMs"
            type="number"
            min="50"
            max="5000"
            step="50"
            value={timeoutMs}
            onChange={(event) => setTimeoutMs(event.target.value)}
          />
        </label>

        <button type="button" onClick={handleRun}>
          Run
        </button>
        <button type="button" onClick={handleRunAll}>
          Run All Test Cases
        </button>
      </section>

      <section className="bottom-grid">
        <div className="panel">
          <div className="panel-title">Result</div>
          <ResultDisplay lines={resultLines} />
        </div>

        <div className="panel">
          <div className="panel-title">Console</div>
          <pre className="pre">{consoleText}</pre>
        </div>
      </section>

      <TestCaseModal
        open={modalOpen}
        mode={modalMode}
        onModeChange={setModalMode}
        onClose={closeModal}
        onGenerate={handleGenerateTemplate}
        onCreate={handleCreateCase}
        caseNames={caseNames}
        generatedTemplateReady={Boolean(generatedTemplate)}
      />

      <ImportWorkflowModal
        open={importModalOpen}
        value={importWorkflowText}
        onChange={setImportWorkflowText}
        onClose={closeImportModal}
        onImport={handleImportWorkflow}
        parseWorkflow={parseWorkflowImport}
        existingActionCount={actionNames.length}
      />
    </div>
  );
}
