/**
 * Validation Service - Handles code analysis and validation
 * Pure business logic, no DOM manipulation
 */
export class ValidationService {
  /**
   * Build validation text for code analysis
   * @param {string} code - Code to analyze
   * @param {object} workflowContext - Context to validate against
   * @returns {string} Validation messages
   */
  static buildValidationText(code, workflowContext) {
    let validationText = '';
    try {
      const analysis = this.extractWorkflowContextPathsFromCode(code);
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

  /**
   * Extract workflow context paths from code using AST analysis
   * @param {string} codeText - JavaScript code to analyze
   * @returns {object} Analysis results
   */
  static extractWorkflowContextPathsFromCode(codeText) {
    if (typeof window.acorn === 'undefined' || typeof window.acorn.parse !== 'function') {
      throw new Error('Acorn did not load; cannot generate template.');
    }

    // Wrap snippet as a function body so `return ...;` is valid during parsing.
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

  /**
   * Generate workflow context from code
   * @param {string} codeText - JavaScript code to analyze
   * @returns {object} Generation result
   */
  static generateWorkflowContextFromCode(codeText) {
    try {
      const { template, uniquePaths, issues, skippedPaths } = this.extractWorkflowContextPathsFromCode(codeText);

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
        message: 'Failed to generate workflowContext template:\n' + this.formatError(err),
      };
    }
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
}