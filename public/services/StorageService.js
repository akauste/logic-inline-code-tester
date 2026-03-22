/**
 * Storage Service - Handles localStorage operations for test cases
 * Pure business logic, no DOM manipulation
 */
export class StorageService {
  static STORAGE_KEY = 'logicInlineCodeTester.workflowContexts.v1';
  static DEFAULT_CASE_NAME = 'default';

  /**
   * Load test cases from localStorage
   * @returns {object|null} Loaded data or null if not found/invalid
   */
  static loadTestCases() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
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

  /**
   * Save test cases to localStorage
   * @param {object} cases - Test case objects
   * @param {string} selectedName - Currently selected case name
   */
  static saveTestCases(cases, selectedName) {
    try {
      localStorage.setItem(
        this.STORAGE_KEY,
        JSON.stringify({
          selectedWorkflowContextName: selectedName,
          workflowContextCases: cases
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
}