/**
 * Storage Service - Handles localStorage operations for test cases
 * Pure business logic, no DOM manipulation
 */
export class StorageService {
  static STORAGE_KEY = 'logicInlineCodeTester.workflowContexts.v1';
  static DEFAULT_ACTION_NAME = 'Inline Code';
  static DEFAULT_CASE_NAME = 'default';

  /**
   * Load action suites from localStorage
   * @returns {object|null} Loaded data or null if not found/invalid
   */
  static loadTestCases() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (!raw) return null;

      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;

      if (parsed.actions && typeof parsed.actions === 'object') {
        const actions = {};
        for (const [actionName, actionEntry] of Object.entries(parsed.actions)) {
          actions[actionName] = this.normalizeActionEntry(actionEntry);
        }

        const actionNames = Object.keys(actions);
        if (actionNames.length === 0) return null;

        const selectedActionName =
          parsed.selectedActionName && actionNames.includes(parsed.selectedActionName)
            ? parsed.selectedActionName
            : actionNames[0];

        return {
          actions,
          selectedActionName,
          importedWorkflow:
            parsed.importedWorkflow && typeof parsed.importedWorkflow === 'object'
              ? parsed.importedWorkflow
              : null,
        };
      }

      const cases = parsed.workflowContextCases;
      const selected = parsed.selectedWorkflowContextName;
      if (!cases || typeof cases !== 'object') return null;

      return {
        actions: {
          [this.DEFAULT_ACTION_NAME]: {
            code: '',
            selectedCaseName: selected || this.DEFAULT_CASE_NAME,
            workflowContextCases: cases,
          },
        },
        selectedActionName: this.DEFAULT_ACTION_NAME,
        importedWorkflow: null,
      };
    } catch {
      return null;
    }
  }

  /**
   * Save action suites to localStorage
   * @param {object} actions - Action objects
   * @param {string} selectedActionName - Currently selected action name
   */
  static saveTestCases(actions, selectedActionName, importedWorkflow = null) {
    try {
      localStorage.setItem(
        this.STORAGE_KEY,
        JSON.stringify({
          selectedActionName,
          actions,
          importedWorkflow,
        })
      );
    } catch {
      // Best effort only - localStorage might be full or disabled
    }
  }

  /**
   * Normalize a test case entry for backward compatibility
   * @param {any} entry - Raw entry from storage
   * @param {string} defaultAssertion - Default assertion text
   * @returns {object} Normalized entry with workflowContext and assertion
   */
  static normalizeCaseEntry(entry, defaultAssertion = 'true') {
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

  /**
   * Normalize an action entry for backward compatibility.
   * @param {any} entry - Raw action entry
   * @param {string} defaultCode - Default inline code
   * @param {string} defaultAssertion - Default assertion text
   * @returns {{ code: string, selectedCaseName: string, workflowContextCases: object, workflowPath: string[]|null }}
   */
  static normalizeActionEntry(entry, defaultCode = '', defaultAssertion = 'true') {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return {
        code: defaultCode,
        selectedCaseName: this.DEFAULT_CASE_NAME,
        workflowContextCases: this.createDefaultCases(defaultAssertion),
        workflowPath: null,
      };
    }

    const workflowContextCases =
      entry.workflowContextCases && typeof entry.workflowContextCases === 'object'
        ? entry.workflowContextCases
        : this.createDefaultCases(defaultAssertion);

    const caseNames = Object.keys(workflowContextCases);
    const selectedCaseName =
      typeof entry.selectedCaseName === 'string' && caseNames.includes(entry.selectedCaseName)
        ? entry.selectedCaseName
        : caseNames[0] || this.DEFAULT_CASE_NAME;

    return {
      code: typeof entry.code === 'string' && entry.code ? entry.code : defaultCode,
      selectedCaseName,
      workflowContextCases,
      workflowPath: Array.isArray(entry.workflowPath) ? entry.workflowPath.filter((part) => typeof part === 'string') : null,
    };
  }

  /**
   * Create default test cases
   * @param {string} defaultAssertion - Default assertion text
   * @returns {object} Default cases object
   */
  static createDefaultCases(defaultAssertion = 'true') {
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

    try {
      return {
        [this.DEFAULT_CASE_NAME]: {
          workflowContext: JSON.parse(defaultWorkflowContext),
          assertion: defaultAssertion,
        },
      };
    } catch {
      return {
        [this.DEFAULT_CASE_NAME]: {
          workflowContext: {},
          assertion: defaultAssertion,
        },
      };
    }
  }

  /**
   * Get default case name
   * @returns {string} Default case name
   */
  static getDefaultCaseName() {
    return this.DEFAULT_CASE_NAME;
  }

  /**
   * Get default action name
   * @returns {string} Default action name
   */
  static getDefaultActionName() {
    return this.DEFAULT_ACTION_NAME;
  }
}
