import React, { useEffect, useMemo, useState } from 'react';
import { ExecutionService } from '../public/services/ExecutionService.js';
import { StorageService } from '../public/services/StorageService.js';
import { ValidationService } from '../public/services/ValidationService.js';
import { CodeMirrorEditor } from './components/CodeMirrorEditor.jsx';
import { AssertionHelpModal } from './components/AssertionHelpModal.jsx';
import { HeaderBar } from './components/HeaderBar.jsx';
import { HelpModal } from './components/HelpModal.jsx';
import { ImportWorkflowModal } from './components/ImportWorkflowModal.jsx';
import { MockDataEditor } from './components/MockDataEditor.jsx';
import { ResultDisplay } from './components/ResultDisplay.jsx';
import { TestCaseManager } from './components/TestCaseManager.jsx';
import { TestCaseModal } from './components/TestCaseModal.jsx';
import { WorkflowVisualizer } from './components/WorkflowVisualizer.jsx';
import {
  extractInlineCodeActions,
  formatWorkflowExpression,
  setNestedValue,
  updateWorkflowInlineCode,
} from './utils/workflowUtils.mjs';

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
const DEFAULT_ASSERTION_LIBRARY = StorageService.getDefaultAssertionLibrary();
const ASSERTION_LIBRARY_OPTIONS = [
  { value: 'expression', label: 'Boolean Expression' },
  { value: 'assert', label: 'Chai Assert' },
  { value: 'expect', label: 'Chai Expect' },
];
const RIGHT_PANEL_TABS = [
  { value: 'workflow', label: 'Workflow' },
  { value: 'mocked-inputs', label: 'Mocked Inputs' },
  { value: 'json-context', label: 'JSON Context' },
];
const LEFT_OUTPUT_TABS = [
  { value: 'result', label: 'Result' },
  { value: 'console', label: 'Console' },
];

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
          workflowPath: null,
        },
      },
      selectedActionName: defaultActionName,
      selectedCaseName,
      code: DEFAULT_CODE,
      workflowText: JSON.stringify(entry.workflowContext, null, 2),
      assertionText: entry.assertion,
      assertionLibrary: entry.assertionLibrary,
      importedWorkflow: null,
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
    assertionLibrary: entry.assertionLibrary,
    importedWorkflow: stored.importedWorkflow || null,
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

function indentBlock(text, indent = '    ') {
  return String(text || '')
    .split('\n')
    .map((line) => `${indent}${line}`)
    .join('\n');
}

function summarizeMockRequirements(code) {
  try {
    const analysis = ValidationService.extractWorkflowContextPathsFromCode(code);
    const grouped = new Map();

    for (const segments of analysis.validPaths || []) {
      let normalizedPath = null;
      let title = '';
      let category = '';

      if (segments[0] === 'trigger' && segments[1] === 'outputs' && (segments[2] === 'body' || segments[2] === 'headers')) {
        normalizedPath = ['trigger', 'outputs', segments[2]];
        title = `Trigger ${segments[2]}`;
        category = 'Trigger';
      } else if (segments[0] === 'actions' && typeof segments[1] === 'string') {
        if (segments[2] === 'outputs' && (segments[3] === 'body' || segments[3] === 'headers')) {
          normalizedPath = ['actions', segments[1], 'outputs', segments[3]];
          title = `${segments[1]} ${segments[3]}`;
          category = 'Action Output';
        } else if (segments[2] === 'inputs') {
          normalizedPath = ['actions', segments[1], 'inputs'];
          title = `${segments[1]} inputs`;
          category = 'Action Input';
        }
      }

      if (!normalizedPath) continue;

      const key = JSON.stringify(normalizedPath);
      if (!grouped.has(key)) {
        grouped.set(key, {
          key,
          path: normalizedPath,
          title,
          category,
          caption: formatWorkflowExpression(normalizedPath),
          accesses: [],
        });
      }

      grouped.get(key).accesses.push(formatWorkflowExpression(segments));
    }

    return Array.from(grouped.values()).map((entry) => ({
      ...entry,
      accesses: Array.from(new Set(entry.accesses)).sort((left, right) => left.localeCompare(right)),
    }));
  } catch {
    return [];
  }
}

export function App() {
  const initialState = useMemo(() => readInitialState(), []);
  const [actions, setActions] = useState(initialState.actions);
  const [selectedActionName, setSelectedActionName] = useState(initialState.selectedActionName);
  const [code, setCode] = useState(initialState.code || DEFAULT_CODE);
  const [selectedCaseName, setSelectedCaseName] = useState(initialState.selectedCaseName);
  const [workflowText, setWorkflowText] = useState(initialState.workflowText || DEFAULT_WORKFLOW_CONTEXT);
  const [assertionText, setAssertionText] = useState(initialState.assertionText || DEFAULT_ASSERTION);
  const [assertionLibrary, setAssertionLibrary] = useState(
    initialState.assertionLibrary || DEFAULT_ASSERTION_LIBRARY
  );
  const [timeoutMs, setTimeoutMs] = useState(1000);
  const [resultLines, setResultLines] = useState([]);
  const [consoleText, setConsoleText] = useState('');
  const [statusSummary, setStatusSummary] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('generate');
  const [generatedTemplate, setGeneratedTemplate] = useState(null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importWorkflowText, setImportWorkflowText] = useState('');
  const [importedWorkflow, setImportedWorkflow] = useState(initialState.importedWorkflow);
  const [assertionHelpOpen, setAssertionHelpOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [rightPanelTab, setRightPanelTab] = useState('workflow');
  const [leftOutputTab, setLeftOutputTab] = useState('result');

  useEffect(() => {
    StorageService.saveTestCases(actions, selectedActionName, importedWorkflow);
  }, [actions, importedWorkflow, selectedActionName]);

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
        const nextAssertionLibrary = assertionLibrary || DEFAULT_ASSERTION_LIBRARY;
        const currentWorkflowJson = JSON.stringify(currentEntry.workflowContext);
        const nextWorkflowJson = JSON.stringify(parsedWorkflowContext);

        if (
          currentWorkflowJson !== nextWorkflowJson ||
          currentEntry.assertion !== nextAssertion ||
          currentEntry.assertionLibrary !== nextAssertionLibrary
        ) {
          nextAction.workflowContextCases = {
            ...currentAction.workflowContextCases,
            [selectedCaseName]: {
              workflowContext: parsedWorkflowContext,
              assertion: nextAssertion,
              assertionLibrary: nextAssertionLibrary,
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
  }, [assertionLibrary, assertionText, code, selectedActionName, selectedCaseName, workflowText]);

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

  const parsedWorkflowPreview = useMemo(() => {
    try {
      return { value: workflowText.trim() ? JSON.parse(workflowText) : {}, error: null };
    } catch (error) {
      return { value: null, error: formatError(error) };
    }
  }, [workflowText]);

  const mockRequirements = useMemo(() => summarizeMockRequirements(code), [code]);

  function clearOutput() {
    setResultLines([]);
    setConsoleText('');
    setStatusSummary(null);
  }

  function loadCaseIntoEditors(caseName, nextCases = currentAction.workflowContextCases) {
    const entry = StorageService.normalizeCaseEntry(nextCases[caseName], DEFAULT_ASSERTION);
    setWorkflowText(JSON.stringify(entry.workflowContext, null, 2));
    setAssertionText(entry.assertion || DEFAULT_ASSERTION);
    setAssertionLibrary(entry.assertionLibrary || DEFAULT_ASSERTION_LIBRARY);
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
            assertionLibrary: assertionLibrary || DEFAULT_ASSERTION_LIBRARY,
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
        workflowPath: null,
      },
    };

    setActions(nextActions);
    setImportedWorkflow(null);
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
          workflowPath: null,
        },
      };
      setActions(defaults);
      setImportedWorkflow(null);
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

  function handleStructuredMockUpdate(path, value) {
    let nextWorkflowContext;
    try {
      nextWorkflowContext = workflowText.trim() ? JSON.parse(workflowText) : {};
    } catch {
      nextWorkflowContext = {};
    }

    nextWorkflowContext = cloneJson(nextWorkflowContext);
    setNestedValue(nextWorkflowContext, path, value);
    setWorkflowText(JSON.stringify(nextWorkflowContext, null, 2));
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
          workflowPath: action.path,
        };
      });

      const firstActionName = Object.keys(nextActions)[0];
      setActions(nextActions);
      setSelectedActionName(firstActionName);
      setImportWorkflowText(jsonText);
      setImportedWorkflow(JSON.parse(jsonText));
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

  function handleExportWorkflow() {
    if (!importedWorkflow) {
      setResultLines(['Import a Logic App workflow first before exporting an updated workflow JSON.']);
      return;
    }

    let nextActions;
    try {
      nextActions = syncSelectedAction();
    } catch (error) {
      setResultLines([`Invalid workflowContext JSON in selected action:\n${formatError(error)}`]);
      return;
    }

    const exportedWorkflow = cloneJson(importedWorkflow);
    const missingPaths = [];

    for (const [actionName, actionEntryRaw] of Object.entries(nextActions)) {
      const actionEntry = StorageService.normalizeActionEntry(actionEntryRaw, DEFAULT_CODE, DEFAULT_ASSERTION);
      if (!Array.isArray(actionEntry.workflowPath) || actionEntry.workflowPath.length === 0) {
        continue;
      }

      const updated = updateWorkflowInlineCode(exportedWorkflow, actionEntry.workflowPath, actionEntry.code);
      if (!updated) {
        missingPaths.push(actionName);
      }
    }

    const jsonText = JSON.stringify(exportedWorkflow, null, 2);
    const blob = new Blob([jsonText], { type: 'application/json;charset=utf-8' });
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = 'logic-app-workflow.updated.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(downloadUrl);

    if (missingPaths.length > 0) {
      setResultLines([
        `Exported workflow JSON, but ${missingPaths.length} action path${missingPaths.length === 1 ? '' : 's'} could not be updated: ${missingPaths.join(', ')}`,
      ]);
      return;
    }

    setResultLines(['Exported workflow JSON with updated inline JavaScript actions.']);
  }

  function buildVitestSuite(nextActions) {
    const lines = [];
    lines.push(`import { describe, it } from 'vitest';`);
    lines.push(`import { assert, expect } from 'chai';`);
    lines.push('');
    lines.push('function runInlineSnippet(code, workflowContext) {');
    lines.push(`  const fn = new Function('workflowContext', '"use strict";\\n' + code);`);
    lines.push('  return fn(workflowContext);');
    lines.push('}');
    lines.push('');
    lines.push('function toJsonSafeValue(value) {');
    lines.push('  const seen = new WeakSet();');
    lines.push('  const json = JSON.stringify(value, (key, val) => {');
    lines.push(`    if (typeof val === 'bigint') return \`\${val.toString()}n\`;`);
    lines.push(`    if (typeof val === 'object' && val !== null) {`);
    lines.push('      if (seen.has(val)) return "[Circular]";');
    lines.push('      seen.add(val);');
    lines.push('    }');
    lines.push(`    if (typeof val === 'function') return '[Function]';`);
    lines.push('    return val;');
    lines.push('  });');
    lines.push('  return json === undefined ? null : JSON.parse(json);');
    lines.push('}');
    lines.push('');

    for (const actionName of Object.keys(nextActions).sort((left, right) => left.localeCompare(right))) {
      const actionEntry = StorageService.normalizeActionEntry(
        nextActions[actionName],
        DEFAULT_CODE,
        DEFAULT_ASSERTION,
        DEFAULT_ASSERTION_LIBRARY
      );
      lines.push(`describe(${JSON.stringify(actionName)}, () => {`);
      for (const caseName of Object.keys(actionEntry.workflowContextCases).sort((left, right) => left.localeCompare(right))) {
        const entry = StorageService.normalizeCaseEntry(
          actionEntry.workflowContextCases[caseName],
          DEFAULT_ASSERTION,
          DEFAULT_ASSERTION_LIBRARY
        );
        lines.push(`  it(${JSON.stringify(caseName)}, () => {`);
        lines.push(`    const code = ${JSON.stringify(actionEntry.code)};`);
        lines.push(`    const workflowContext = ${JSON.stringify(entry.workflowContext, null, 2)};`);
        lines.push('    const result = toJsonSafeValue(runInlineSnippet(code, workflowContext));');
        if (entry.assertionLibrary === 'expression') {
          lines.push('    const passed = (() => {');
          lines.push('      return (');
          lines.push(indentBlock(entry.assertion, '        '));
          lines.push('      );');
          lines.push('    })();');
          lines.push('    assert.equal(passed, true);');
        } else {
          lines.push(indentBlock(entry.assertion, '    '));
        }
        lines.push('  });');
      }
      lines.push('});');
      lines.push('');
    }

    return lines.join('\n');
  }

  function handleExportTests() {
    let nextActions;
    try {
      nextActions = syncSelectedAction();
    } catch (error) {
      setResultLines([`Invalid workflowContext JSON in selected action:\n${formatError(error)}`]);
      return;
    }

    const testFileText = buildVitestSuite(nextActions);
    const blob = new Blob([testFileText], { type: 'text/javascript;charset=utf-8' });
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = 'logic-inline-code.spec.js';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(downloadUrl);
    setResultLines(['Exported a Vitest-ready test suite for the current inline actions and test cases using Chai.']);
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
    let nextAssertionLibrary = assertionLibrary || DEFAULT_ASSERTION_LIBRARY;

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
      nextAssertionLibrary = entry.assertionLibrary || DEFAULT_ASSERTION_LIBRARY;
    }

    const nextCases = {
      ...currentAction.workflowContextCases,
      [name]: {
        workflowContext,
        assertion,
        assertionLibrary: nextAssertionLibrary,
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
      Number(timeoutMs),
      assertionLibrary
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
        Number(timeoutMs),
        entry.assertionLibrary
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
        canExportWorkflow={Boolean(importedWorkflow)}
        onExportWorkflow={handleExportWorkflow}
        onExportTests={handleExportTests}
        onOpenHelp={() => setHelpOpen(true)}
        statusSummary={statusSummary}
        onImportWorkflow={openImportModal}
        onRunAll={handleRunAll}
      />

      <section className="grid">
        <div className="panel workspace-panel">
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

          <section className="actions actions-inline">
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

          <section className="output-panel">
            <div className="panel-tabs" role="tablist" aria-label="Execution output views">
              {LEFT_OUTPUT_TABS.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  role="tab"
                  aria-selected={leftOutputTab === tab.value}
                  className={`panel-tab ${leftOutputTab === tab.value ? 'active' : ''}`}
                  onClick={() => setLeftOutputTab(tab.value)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {leftOutputTab === 'result' ? (
              <div className="panel-tab-content">
                <ResultDisplay lines={resultLines} />
              </div>
            ) : null}

            {leftOutputTab === 'console' ? (
              <div className="panel-tab-content">
                <pre className="pre pre-output">{consoleText}</pre>
              </div>
            ) : null}
          </section>
        </div>

        <div className="panel workspace-panel">
          <TestCaseManager
            itemNames={caseNames}
            selectedItem={selectedCaseName}
            onSelectItem={handleCaseChange}
            onCreateItem={openModal}
            onDeleteItem={handleDeleteCase}
          />

          <div className="panel-tabs" role="tablist" aria-label="Right panel views">
            {RIGHT_PANEL_TABS.map((tab) => (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={rightPanelTab === tab.value}
                className={`panel-tab ${rightPanelTab === tab.value ? 'active' : ''}`}
                onClick={() => setRightPanelTab(tab.value)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {rightPanelTab === 'workflow' ? (
            <div className="panel-tab-content">
              <div className="panel-title">Workflow Map</div>
              <div className="hint">
                Shape matches Logic Apps Standard: <code>{'{ actions, trigger, workflow }'}</code>.
              </div>
              <WorkflowVisualizer
                importedWorkflow={importedWorkflow}
                parsedWorkflowContext={parsedWorkflowPreview.value}
                parseError={parsedWorkflowPreview.error}
                selectedActionPath={currentAction.workflowPath}
              />
            </div>
          ) : null}

          {rightPanelTab === 'mocked-inputs' ? (
            <div className="panel-tab-content">
              <MockDataEditor
                requirements={mockRequirements}
                workflowContext={parsedWorkflowPreview.value || {}}
                parseError={parsedWorkflowPreview.error}
                selectedActionName={selectedActionName}
                selectedCaseName={selectedCaseName}
                onUpdateRequirement={handleStructuredMockUpdate}
              />
            </div>
          ) : null}

          {rightPanelTab === 'json-context' ? (
            <div className="panel-tab-content">
              <div className="panel-title">Advanced workflowContext JSON</div>
              <div className="hint">
                Use the targeted mock editors in the `Mocked Inputs` tab for common upstream results. Edit the full
                JSON here for anything more advanced.
              </div>
              <CodeMirrorEditor
                editorId="workflowContext"
                value={workflowText}
                onChange={setWorkflowText}
                mode="json"
                height={260}
              />
            </div>
          ) : null}

          <div className="panel-title section-title">Assertion (paired with selected test case)</div>
          <div className="field field-inline">
            <label htmlFor="assertionLibrary">Assertion Library</label>
            <div className="field-row">
              <div className="field-grow">
                <select
                  id="assertionLibrary"
                  value={assertionLibrary}
                  onChange={(event) => setAssertionLibrary(event.target.value)}
                >
                  {ASSERTION_LIBRARY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            <button
              type="button"
              className="assertion-help-trigger"
              onClick={() => setAssertionHelpOpen(true)}
            >
              Help
            </button>
            </div>
          </div>
          <CodeMirrorEditor
            editorId="assertion"
            value={assertionText}
            onChange={setAssertionText}
            mode="javascript"
            height={110}
            lineNumbers={false}
          />
          <div className="hint">
            {assertionLibrary === 'expression' ? (
              <>
                JavaScript expression that must evaluate to <code>true</code>. Available variables:
                <code>result</code>, <code>workflowContext</code>.
              </>
            ) : assertionLibrary === 'assert' ? (
              <>
                Assertion body using Chai <code>assert</code>, plus <code>result</code> and
                <code>workflowContext</code>.
              </>
            ) : (
              <>
                Expect-style assertion body using Chai <code>expect</code>, plus <code>result</code> and
                <code>workflowContext</code>.
              </>
            )}
          </div>
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

      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
      <AssertionHelpModal open={assertionHelpOpen} onClose={() => setAssertionHelpOpen(false)} />
    </div>
  );
}
