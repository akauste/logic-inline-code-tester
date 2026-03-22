/**
 * Same execution model as the browser Web Worker (new Function + workflowContext).
 * Used by Node tests without a server.
 */
function runInlineSnippet(code, workflowContext) {
  const fn = new Function('workflowContext', '"use strict";\n' + code);
  return fn(workflowContext);
}

function toJsonSafeValue(value) {
  const seen = new WeakSet();
  try {
    const json = JSON.stringify(value, (key, val) => {
      if (typeof val === 'bigint') return `${val.toString()}n`;
      if (typeof val === 'object' && val !== null) {
        if (seen.has(val)) return '[Circular]';
        seen.add(val);
      }
      if (typeof val === 'function') return '[Function]';
      return val;
    });
    return json === undefined ? null : JSON.parse(json);
  } catch {
    return null;
  }
}

module.exports = { runInlineSnippet, toJsonSafeValue };
