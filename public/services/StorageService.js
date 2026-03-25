import {
  DEFAULT_ACTION_NAME,
  DEFAULT_ASSERTION_LIBRARY,
  DEFAULT_CASE_NAME,
  createDefaultCases,
  normalizeActionEntry,
  normalizeCaseEntry,
} from '../../src/utils/storageUtils.mjs';

/**
 * Storage Service - Handles localStorage operations for test cases
 * Pure business logic, no DOM manipulation
 */
export class StorageService {
  static STORAGE_KEY = 'logicInlineCodeTester.workflowContexts.v1';
  static DEFAULT_ACTION_NAME = DEFAULT_ACTION_NAME;
  static DEFAULT_CASE_NAME = DEFAULT_CASE_NAME;
  static DEFAULT_ASSERTION_LIBRARY = DEFAULT_ASSERTION_LIBRARY;

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
  static normalizeCaseEntry(entry, defaultAssertion = 'true', defaultAssertionLibrary = 'expression') {
    return normalizeCaseEntry(entry, defaultAssertion, defaultAssertionLibrary);
  }

  /**
   * Normalize an action entry for backward compatibility.
   * @param {any} entry - Raw action entry
   * @param {string} defaultCode - Default inline code
   * @param {string} defaultAssertion - Default assertion text
   * @returns {{ code: string, selectedCaseName: string, workflowContextCases: object, workflowPath: string[]|null }}
   */
  static normalizeActionEntry(entry, defaultCode = '', defaultAssertion = 'true', defaultAssertionLibrary = 'expression') {
    return normalizeActionEntry(entry, defaultCode, defaultAssertion, defaultAssertionLibrary);
  }

  /**
   * Create default test cases
   * @param {string} defaultAssertion - Default assertion text
   * @returns {object} Default cases object
   */
  static createDefaultCases(defaultAssertion = 'true', defaultAssertionLibrary = this.DEFAULT_ASSERTION_LIBRARY) {
    return createDefaultCases(defaultAssertion, defaultAssertionLibrary);
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

  static getDefaultAssertionLibrary() {
    return this.DEFAULT_ASSERTION_LIBRARY;
  }
}
