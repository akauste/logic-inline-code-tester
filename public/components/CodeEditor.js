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

    // Handle both container and textarea inputs
    let textarea = this.container.tagName === 'TEXTAREA' 
      ? this.container 
      : this.container.querySelector('textarea');
    
    if (!textarea) {
      textarea = document.createElement('textarea');
      this.container.appendChild(textarea);
    }

    // Initialize CodeMirror - with retry for cases where CodeMirror might not be fully loaded
    const initCodeMirror = () => {
      if (typeof window.CodeMirror === 'undefined') {
        // Retry after a short delay if CodeMirror is not yet available
        setTimeout(initCodeMirror, 100);
        return;
      }

      try {
        // Normalize mode names for better compatibility
        let mode = this.options.mode;
        if (mode === 'json') {
          mode = 'application/json';
        }

        this.editor = window.CodeMirror.fromTextArea(textarea, {
          mode: mode,
          theme: this.options.theme,
          lineNumbers: this.options.lineNumbers,
          tabSize: this.options.tabSize,
          indentUnit: 2,
          indentWithTabs: false,
          lineWrapping: true,
          autoCloseBrackets: true,
          matchBrackets: true,
        });

        // Set height
        this.editor.setSize(null, this.options.height);

        // Force syntax highlighting refresh
        setTimeout(() => {
          this.editor.refresh();
        }, 0);

        // Bind change event
        if (this.onChange) {
          this.editor.on('change', () => {
            this.onChange(this.getValue());
          });
        }
      } catch (err) {
        // If CodeMirror initialization fails, fall back to plain textarea
        console.warn('CodeMirror initialization failed for mode', this.options.mode, err);
        this.setupPlainTextarea(textarea);
      }
    };

    // Start initialization
    initCodeMirror();

    // Also set up plain textarea as fallback
    if (typeof window.CodeMirror === 'undefined') {
      this.setupPlainTextarea(textarea);
    }
  }

  /**
   * Set up plain textarea fallback
   * @param {HTMLTextAreaElement} textarea - Textarea element
   */
  setupPlainTextarea(textarea) {
    textarea.style.width = '100%';
    textarea.style.minHeight = this.options.height + 'px';
    textarea.style.resize = 'vertical';
    textarea.style.fontFamily = 'monospace';

    if (this.onChange) {
      textarea.addEventListener('input', () => {
        this.onChange(this.getValue());
      });
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