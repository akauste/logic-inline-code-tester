/**
 * Execution Service - Handles code execution in Web Workers
 * Pure business logic, no DOM manipulation
 */
import { assert, expect } from 'chai';
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
  static async execute(code, workflowContext, assertionText, timeoutMs = 1000, assertionLibrary = 'expression') {
    const validationText = this.buildValidationText(code, workflowContext);

    // Static / browser-only: execution runs in a Web Worker
    const runData = await this.runInBrowserWorker({ code, workflowContext, timeoutMs });

    let assertionOutcome = null;
    if (runData?.ok) {
      try {
        assertionOutcome = this.evaluateAssertion({
          assertionLibrary,
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
  static evaluateAssertion({ assertionLibrary = 'expression', assertionText, resultValue, workflowContext }) {
    const text = (assertionText || '').trim();
    if (!text) {
      return { hasAssertion: false, passed: null, message: 'No assertion defined for this test case.' };
    }

    if (assertionLibrary === 'assert') {
      const fn = new Function('result', 'workflowContext', 'assert', `"use strict";\n${text}\nreturn true;`);
      const value = fn(resultValue, workflowContext, assert);
      return value === false
        ? { hasAssertion: true, passed: false, message: 'Assertion failed (returned false).' }
        : { hasAssertion: true, passed: true, message: 'Assertion passed.' };
    }

    if (assertionLibrary === 'expect') {
      const fn = new Function('result', 'workflowContext', 'expect', `"use strict";\n${text}\nreturn true;`);
      const value = fn(resultValue, workflowContext, expect);
      return value === false
        ? { hasAssertion: true, passed: false, message: 'Assertion failed (returned false).' }
        : { hasAssertion: true, passed: true, message: 'Assertion passed.' };
    }

    const fn = new Function('result', 'workflowContext', `"use strict"; return (${text});`);
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

  /**
   * Execute code in a Web Worker (browser-only)
   * @param {object} params - Execution parameters
   * @returns {Promise<object>} Execution result
   */
  static async runInBrowserWorker({ code, workflowContext, timeoutMs }) {
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
}
