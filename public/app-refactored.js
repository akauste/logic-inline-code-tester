/**
 * Refactored App - Component-based architecture
 * Uses services and components for better organization
 */

// Import services
import { ExecutionService } from './services/ExecutionService.js';
import { StorageService } from './services/StorageService.js';
import { ValidationService } from './services/ValidationService.js';

// Import components
import { TestCaseManager } from './components/TestCaseManager.js';
import { CodeEditor } from './components/CodeEditor.js';
import { ResultDisplay } from './components/ResultDisplay.js';
import { Modal } from './components/Modal.js';

// Constants
const DEFAULT_CODE = `// Example: extract email addresses from the trigger body
// Tip: reference data via workflowContext, matching Logic Apps Standard.
const text =
  workflowContext?.trigger?.outputs?.body?.body ??
  "";

const myRegex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}/ig;
const matches = (text.match(myRegex) || []);

// Returning an array becomes the action "Result" token.
return matches;`;

const DEFAULT_ASSERTION = `Array.isArray(result) && result.length >= 1`;

// Utility functions
const $ = (id) => document.getElementById(id);

function setPre(id, text) {
  const el = $(id);
  if (el) el.textContent = text;
}

/**
 * Main Application Class
 */
export class App {
  constructor() {
    // Services
    this.executionService = ExecutionService;
    this.storageService = StorageService;
    this.validationService = ValidationService;

    // Components
    this.codeEditor = null;
    this.workflowEditor = null;
    this.assertionEditor = null;
    this.testCaseManager = null;
    this.resultDisplay = null;
    this.modal = null;

    // State
    this.cases = {};
    this.selectedCase = StorageService.getDefaultCaseName();
  }

  /**
   * Initialize the application
   */
  async init() {
    this.initComponents();
    this.loadState();
    this.bindEvents();
  }

  /**
   * Initialize all components
   */
  initComponents() {
    // Initialize editors
    this.codeEditor = new CodeEditor($('code'), { mode: 'javascript' });
    this.codeEditor.init();

    this.workflowEditor = new CodeEditor($('workflowContext'), { mode: 'json' });
    this.workflowEditor.init();

    this.assertionEditor = new CodeEditor($('assertion'), { mode: 'javascript', height: 110 });
    this.assertionEditor.init();

    // Initialize result display
    this.resultDisplay = new ResultDisplay($('result'));

    // Initialize test case manager
    this.testCaseManager = new TestCaseManager($('.context-manager'));
    this.testCaseManager.init({
      onCaseChange: (caseName) => this.onCaseChange(caseName),
      onAddCase: () => this.onAddCase(),
      onUpdateCase: (caseName) => this.onUpdateCase(caseName),
      onDeleteCase: (caseName) => this.onDeleteCase(caseName),
    });

    // Initialize modal
    this.modal = new Modal($('addTestCaseModal'));
  }

  /**
   * Load application state from storage
   */
  loadState() {
    const stored = this.storageService.loadTestCases();
    if (stored) {
      this.cases = stored.cases;
      this.selectedCase = stored.selected;
    } else {
      this.cases = this.storageService.createDefaultCases(DEFAULT_ASSERTION);
      this.selectedCase = this.storageService.getDefaultCaseName();
    }

    this.testCaseManager.setCases(this.cases, this.selectedCase);
    this.loadCaseIntoEditors(this.selectedCase);
  }

  /**
   * Bind global event handlers
   */
  bindEvents() {
    // Run button
    $('run')?.addEventListener('click', () => {
      this.run().catch(err => this.handleError(err));
    });

    // Run all button
    $('runAll')?.addEventListener('click', () => {
      this.runAll().catch(err => this.handleError(err));
    });
  }

  /**
   * Handle case selection change
   * @param {string} caseName - Selected case name
   */
  onCaseChange(caseName) {
    setPre('result', '');
    setPre('console', '');
    this.selectedCase = caseName;
    this.loadCaseIntoEditors(caseName);
    this.storageService.saveTestCases(this.cases, this.selectedCase);
  }

  /**
   * Handle add case request
   */
  onAddCase() {
    this.showAddCaseModal();
  }

  /**
   * Handle update case request
   * @param {string} caseName - Case to update
   */
  onUpdateCase(caseName) {
    try {
      const workflowContext = JSON.parse(this.workflowEditor.getValue());
      const assertion = this.assertionEditor.getValue() || DEFAULT_ASSERTION;

      this.cases[caseName] = { workflowContext, assertion };
      this.storageService.saveTestCases(this.cases, this.selectedCase);

      setPre('result', `Updated: ${caseName}`);
    } catch (err) {
      setPre('result', 'Invalid workflowContext JSON:\n' + this.formatError(err));
    }
  }

  /**
   * Handle delete case request
   * @param {string} caseName - Case to delete
   */
  onDeleteCase(caseName) {
    delete this.cases[caseName];

    // Select another case
    const remaining = Object.keys(this.cases);
    if (remaining.length === 0) {
      this.cases = this.storageService.createDefaultCases(DEFAULT_ASSERTION);
      this.selectedCase = this.storageService.getDefaultCaseName();
    } else {
      this.selectedCase = remaining.sort((a, b) => a.localeCompare(b))[0];
    }

    this.storageService.saveTestCases(this.cases, this.selectedCase);
    this.testCaseManager.setCases(this.cases, this.selectedCase);
    this.loadCaseIntoEditors(this.selectedCase);
    setPre('result', `Deleted: ${caseName}`);
  }

  /**
   * Load case data into editors
   * @param {string} caseName - Case to load
   */
  loadCaseIntoEditors(caseName) {
    const caseData = this.storageService.normalizeCaseEntry(this.cases[caseName], DEFAULT_ASSERTION);

    this.workflowEditor.setValue(JSON.stringify(caseData.workflowContext, null, 2));
    this.assertionEditor.setValue(caseData.assertion);
  }

  /**
   * Show add case modal
   */
  showAddCaseModal() {
    const modalContent = `
      <div class="modal-section">
        <label class="field">Test Case Name</label>
        <input
          name="caseName"
          type="text"
          placeholder="e.g., Extract Emails, Invalid Input"
          autocomplete="off"
          class="modal-input"
        />
      </div>

      <div class="modal-divider"></div>

      <div class="modal-section">
        <div class="modal-tabs">
          <button type="button" class="modal-tab active" data-tab="generate">Generate New</button>
          <button type="button" class="modal-tab" data-tab="duplicate">Duplicate</button>
        </div>

        <div id="generatePanel" class="modal-panel active">
          <p class="modal-hint">Generate workflowContext skeleton from the inline code.</p>
          <button id="generateButton" type="button" class="btn-primary">Generate from Code</button>
        </div>

        <div id="duplicatePanel" class="modal-panel">
          <p class="modal-hint">Copy an existing test case and rename it.</p>
          <select name="sourceCase" class="modal-select">
            <option value="">-- Select test case to duplicate --</option>
            ${Object.keys(this.cases).map(name => `<option value="${name}">${name}</option>`).join('')}
          </select>
        </div>
      </div>
    `;

    const modalFooter = `
      <button id="cancelButton" type="button" class="btn-secondary">Cancel</button>
      <button id="createButton" type="button" class="btn-primary">Create Test Case</button>
    `;

    this.modal.show({
      title: 'Create New Test Case',
      content: modalContent,
      footer: modalFooter,
      onConfirm: () => this.createTestCase(),
      onClose: () => this.resetModalState()
    });

    // Bind tab switching
    this.bindModalTabs();
  }

  /**
   * Bind modal tab switching
   */
  bindModalTabs() {
    const tabs = this.modal.container.querySelectorAll('.modal-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const tabType = tab.dataset.tab;
        this.switchModalTab(tabType);
      });
    });

    // Bind generate button
    const generateBtn = this.modal.container.querySelector('#generateButton');
    if (generateBtn) {
      generateBtn.addEventListener('click', () => {
        this.generateWorkflowContext();
      });
    }
  }

  /**
   * Switch modal tabs
   * @param {string} tabType - Tab to switch to
   */
  switchModalTab(tabType) {
    const tabs = this.modal.container.querySelectorAll('.modal-tab');
    const panels = this.modal.container.querySelectorAll('.modal-panel');

    tabs.forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === tabType);
    });

    panels.forEach(panel => {
      panel.classList.toggle('active', panel.id === `${tabType}Panel`);
    });
  }

  /**
   * Generate workflow context from code
   */
  generateWorkflowContext() {
    const result = this.validationService.generateWorkflowContextFromCode(this.codeEditor.getValue());

    if (!result.success) {
      setPre('result', result.message);
      return;
    }

    setPre('result', `Generated template from ${result.uniquePaths} valid path(s).`);

    if (result.issues.length > 0) {
      setPre('console', 'Validation issues:\n' + result.issues.map(issue => `- ${issue.reason}`).join('\n'));
    }
  }

  /**
   * Create test case from modal
   * @returns {boolean} Success status
   */
  createTestCase() {
    const formData = this.modal.getFormData();
    const caseName = formData.caseName?.trim();

    if (!caseName) {
      setPre('result', 'Please enter a name for the new test case.');
      return false;
    }

    if (this.cases.hasOwnProperty(caseName)) {
      setPre('result', `A test case with name "${caseName}" already exists.`);
      return false;
    }

    let newContext = {};
    let newAssertion = DEFAULT_ASSERTION;

    // Generate or duplicate based on active tab
    const activeTab = this.modal.container.querySelector('.modal-tab.active')?.dataset.tab;

    if (activeTab === 'generate') {
      // Use current workflow context
      try {
        newContext = JSON.parse(this.workflowEditor.getValue());
        newAssertion = this.assertionEditor.getValue() || DEFAULT_ASSERTION;
      } catch (err) {
        setPre('result', 'Invalid workflowContext JSON:\n' + this.formatError(err));
        return false;
      }
    } else if (activeTab === 'duplicate') {
      const sourceCase = formData.sourceCase;
      if (!sourceCase) {
        setPre('result', 'Please select a test case to duplicate.');
        return false;
      }

      const source = this.storageService.normalizeCaseEntry(this.cases[sourceCase]);
      newContext = JSON.parse(JSON.stringify(source.workflowContext));
      newAssertion = source.assertion || DEFAULT_ASSERTION;
    }

    // Create the case
    this.cases[caseName] = { workflowContext: newContext, assertion: newAssertion };
    this.selectedCase = caseName;
    this.storageService.saveTestCases(this.cases, this.selectedCase);

    this.testCaseManager.setCases(this.cases, this.selectedCase);
    this.loadCaseIntoEditors(caseName);

    setPre('result', `Created test case: ${caseName}`);
    return true;
  }

  /**
   * Reset modal state
   */
  resetModalState() {
    // Reset any modal-specific state
  }

  /**
   * Run current test case
   */
  async run() {
    const code = this.codeEditor.getValue();
    const assertion = this.assertionEditor.getValue();

    let workflowContext;
    try {
      workflowContext = JSON.parse(this.workflowEditor.getValue());
    } catch (err) {
      setPre('result', 'Invalid workflowContext JSON:\n' + this.formatError(err));
      return;
    }

    const timeoutMs = Number($('timeoutMs')?.value || 1000);

    setPre('result', '');
    setPre('console', '');

    const { runData, validationText, assertionOutcome } = await this.executionService.execute(
      code, workflowContext, assertion, timeoutMs
    );

    this.displayExecutionResult(runData, validationText, assertionOutcome);
  }

  /**
   * Run all test cases
   */
  async runAll() {
    const code = this.codeEditor.getValue();
    const timeoutMs = Number($('timeoutMs')?.value || 1000);
    const caseNames = Object.keys(this.cases).sort((a, b) => a.localeCompare(b));

    if (caseNames.length === 0) {
      setPre('result', 'No test cases found.');
      return;
    }

    const summaryLines = [];
    let passCount = 0, failCount = 0, errorCount = 0;

    for (const caseName of caseNames) {
      const caseData = this.storageService.normalizeCaseEntry(this.cases[caseName]);
      const { runData, validationText, assertionOutcome } = await this.executionService.execute(
        code, caseData.workflowContext, caseData.assertion, timeoutMs
      );

      if (!runData?.ok) {
        errorCount++;
        summaryLines.push({ kind: 'error', text: `💥 ${caseName}: ERROR` });
      } else if (assertionOutcome?.hasAssertion) {
        if (assertionOutcome.passed) {
          passCount++;
          summaryLines.push({ kind: 'pass', text: `✅ ${caseName}: PASS` });
        } else {
          failCount++;
          summaryLines.push({ kind: 'fail', text: `❌ ${caseName}: FAIL - ${assertionOutcome.message}` });
        }
      } else {
        failCount++;
        summaryLines.push({ kind: 'fail', text: `❌ ${caseName}: FAIL - No assertion` });
      }
    }

    const total = caseNames.length;
    const headerKind = failCount === 0 && errorCount === 0 ? 'pass' : 'fail';
    const header = `Run All completed: ${passCount} passed, ${failCount} failed, ${errorCount} errors, ${total} total.`;

    this.resultDisplay.showResult([{ kind: headerKind, text: header }, '---', ...summaryLines]);
  }

  /**
   * Display execution result
   * @param {object} runData - Execution data
   * @param {string} validationText - Validation messages
   * @param {object} assertionOutcome - Assertion result
   */
  displayExecutionResult(runData, validationText, assertionOutcome) {
    const resultParts = [];

    if (validationText) {
      resultParts.push({ kind: 'warn', text: `⚠ ${validationText.replace(/\n/g, ' | ')}` });
    }

    if (assertionOutcome?.hasAssertion) {
      resultParts.push({
        kind: assertionOutcome.passed ? 'pass' : 'fail',
        text: `Assertion (${this.selectedCase}): ${assertionOutcome.passed ? 'PASS' : 'FAIL'}`
      }, {
        kind: assertionOutcome.passed ? 'pass' : 'fail',
        text: assertionOutcome.message
      });
    }

    resultParts.push(
      `Execution time: ${runData.executionTimeMs} ms`,
      '---',
      runData.resultInspect ?? ''
    );

    this.resultDisplay.showResult(resultParts);

    if (runData.logs?.length > 0) {
      setPre('console', runData.logs.map(l => `${l.level}: ${l.args.join(' ')}`).join('\n'));
    } else {
      setPre('console', '(no console output)');
    }
  }

  /**
   * Handle application errors
   * @param {Error} err - Error to handle
   */
  handleError(err) {
    setPre('result', 'Error:\n' + this.formatError(err));
  }

  /**
   * Format error for display
   * @param {Error} err - Error object
   * @returns {string} Formatted error message
   */
  formatError(err) {
    if (!err) return 'Unknown error';
    if (typeof err === 'string') return err;
    const name = err.name ? `${err.name}: ` : '';
    const msg = err.message ? err.message : String(err);
    return name + msg + (err.stack ? `\n\n${err.stack}` : '');
  }
}

// Bootstrap
document.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  app.init();
});