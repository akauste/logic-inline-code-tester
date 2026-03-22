/**
 * Execution Service - Handles code execution in Web Workers
 * Pure business logic, no DOM manipulation
 */
import { ValidationService } from './ValidationService.js';
export class ExecutionService {
  /**
   * Execute JavaScript code in a Web Worker
   * @param {string} code - JavaScript code to execute
   * @param {object} workflowContext - Workflow context object
   * @param {string} assertionText - Assertion expression
   * @param {number} timeoutMs - Execution timeout
   * @returns {Promise<object>} Execution result
   */
  static async execute(code, workflowContext, assertionText, timeoutMs = 1000) {
    const validationText = this.buildValidationText(code, workflowContext);

    // Static / browser-only: execution runs in a Web Worker
    const runData = await this.runInBrowserWorker({ code, workflowContext, timeoutMs });

    let assertionOutcome = null;
    if (runData?.ok) {
      try {
        assertionOutcome = this.evaluateAssertion({
          assertionText,
          resultValue: runData.resultValue,
          workflowContext,
        });
      } catch (err) {
        assertionOutcome = {
          hasAssertion: true,
          passed: false,
          message: `Assertion error: ${this.formatError(err)}`,
        };
      }
    }

    return { runData, validationText, assertionOutcome };
  }

  /**
   * Evaluate assertion expression
   * @param {object} params - Assertion parameters
   * @returns {object} Assertion result
   */
  static evaluateAssertion({ assertionText, resultValue, workflowContext }) {
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

  /**
   * Build validation text for code analysis
   * @param {string} code - Code to analyze
   * @param {object} workflowContext - Context to validate against
   * @returns {string} Validation messages
   */
  static buildValidationText(code, workflowContext) {
    return ValidationService.buildValidationText(code, workflowContext);
  }

  /**
   * Format error for display
   * @param {Error} err - Error object
   * @returns {string} Formatted error message
   */
  static formatError(err) {
    if (!err) return 'Unknown error';
    if (typeof err === 'string') return err;
    const name = err.name ? `${err.name}: ` : '';
    const msg = err.message ? err.message : String(err);
    return name + msg + (err.stack ? `\n\n${err.stack}` : '');
  }

  // ... rest of the execution logic (runInBrowserWorker, etc.)
  // This would be moved from the original app.js
}