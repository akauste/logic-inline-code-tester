/**
 * Code Editor Component
 * Wrapper around CodeMirror for code editing
 */
export class CodeEditor {
  constructor(container, options = {}) {
    this.container = container;
    this.editor = null;
    this.options = {
      mode: 'javascript',
      theme: 'material-darker',
      lineNumbers: true,
      tabSize: 2,
      height: 320,
      ...options
    };
    this.onChange = null;
  }

  /**
   * Initialize the editor
   * @param {Function} onChange - Change callback
   */
  init(onChange = null) {
    this.onChange = onChange;

    // Create textarea if it doesn't exist
    let textarea = this.container.querySelector('textarea');
    if (!textarea) {
      textarea = document.createElement('textarea');
      this.container.appendChild(textarea);
    }

    // Initialize CodeMirror
    if (typeof window.CodeMirror !== 'undefined') {
      this.editor = window.CodeMirror.fromTextArea(textarea, {
        mode: this.options.mode,
        theme: this.options.theme,
        lineNumbers: this.options.lineNumbers,
        tabSize: this.options.tabSize,
      });

      // Set height
      this.editor.setSize(null, this.options.height);

      // Bind change event
      if (this.onChange) {
        this.editor.on('change', () => {
          this.onChange(this.getValue());
        });
      }
    } else {
      // Fallback to plain textarea
      textarea.style.width = '100%';
      textarea.style.minHeight = this.options.height + 'px';
      textarea.style.resize = 'vertical';

      if (this.onChange) {
        textarea.addEventListener('input', () => {
          this.onChange(this.getValue());
        });
      }
    }
  }

  /**
   * Get current value
   * @returns {string} Current editor value
   */
  getValue() {
    if (this.editor) {
      return this.editor.getValue();
    }

    const textarea = this.container.querySelector('textarea');
    return textarea ? textarea.value : '';
  }

  /**
   * Set editor value
   * @param {string} value - Value to set
   */
  setValue(value) {
    if (this.editor) {
      this.editor.setValue(value);
    } else {
      const textarea = this.container.querySelector('textarea');
      if (textarea) {
        textarea.value = value;
      }
    }
  }

  /**
   * Focus the editor
   */
  focus() {
    if (this.editor) {
      this.editor.focus();
    } else {
      const textarea = this.container.querySelector('textarea');
      if (textarea) {
        textarea.focus();
      }
    }
  }

  /**
   * Refresh the editor (useful after container size changes)
   */
  refresh() {
    if (this.editor) {
      this.editor.refresh();
    }
  }

  /**
   * Set editor height
   * @param {number} height - Height in pixels
   */
  setHeight(height) {
    this.options.height = height;
    if (this.editor) {
      this.editor.setSize(null, height);
    } else {
      const textarea = this.container.querySelector('textarea');
      if (textarea) {
        textarea.style.minHeight = height + 'px';
      }
    }
  }

  /**
   * Check if CodeMirror is loaded
   * @returns {boolean} True if CodeMirror is available
   */
  hasCodeMirror() {
    return this.editor !== null;
  }
}