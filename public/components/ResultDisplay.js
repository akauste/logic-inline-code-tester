/**
 * Result Display Component
 * Handles displaying execution results and errors
 */
export class ResultDisplay {
  constructor(container) {
    this.container = container;
  }

  /**
   * Display rich result lines
   * @param {Array} lines - Array of result line objects
   */
  showResult(lines) {
    const el = this.container;
    if (!el) return;

    const rendered = (lines || [])
      .map((line) => {
        if (typeof line === 'string') {
          return `<span class="result-line">${this.escapeHtml(line)}</span>`;
        }
        const kind = line?.kind ? ` result-${line.kind}` : '';
        return `<span class="result-line${kind}">${this.escapeHtml(line?.text ?? '')}</span>`;
      })
      .join('\n');

    el.innerHTML = rendered;
  }

  /**
   * Clear the result display
   */
  clear() {
    if (this.container) {
      this.container.textContent = '';
    }
  }

  /**
   * Show error message
   * @param {string|Error} error - Error to display
   */
  showError(error) {
    this.showResult([{
      text: `Error: ${this.formatError(error)}`,
      kind: 'error'
    }]);
  }

  /**
   * Show success message
   * @param {string} message - Success message
   */
  showSuccess(message) {
    this.showResult([{
      text: message,
      kind: 'pass'
    }]);
  }

  /**
   * Escape HTML entities
   * @param {string} value - String to escape
   * @returns {string} Escaped string
   */
  escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
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